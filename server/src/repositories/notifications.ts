import { PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { ddb, NOTIFICATIONS_TABLE } from '../lib/dynamo';
import { pushToUser } from '../lib/websocket';
import { encryptCode, decryptStoredCode } from '../lib/codeCrypto';

// DynamoDB allows exactly one TTL attribute per table, so `expires_at` does
// double duty (see the interface below):
//   - a code-carrying fallback row (offline share, or a failed P2P
//     negotiation) is kept only 72h, then the whole row goes;
//   - every other row is ordinary history, kept 30 days.
// Without the second value notifications accumulated forever, which is what
// made reading a user's partition expensive in the first place.
const CODE_TTL_SECONDS = 72 * 60 * 60;
const NOTIFICATION_TTL_SECONDS = 30 * 24 * 60 * 60;

const ttlFromNow = (seconds: number) => Math.floor(Date.now() / 1000) + seconds;

const MAX_NOTIFICATIONS_RETURNED = 50;
const MAX_QUERY_PAGES = 20; // safety valve on any paged base-table read

// GSI (user_id, created_at) - the base table's sort key is a random uuidv4,
// so only this index can answer "newest first". Created manually in the
// console, same as Couplet-Connections' user_id-index.
const CREATED_AT_INDEX = 'user_id-created_at-index';

export interface Notification {
  user_id: string;
  notification_id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
  group_id?: string;
  group_name?: string;
  coupon_id?: string;
  coupon_code?: string;
  // DynamoDB TTL attribute (epoch seconds), set on every row. Deletes the
  // whole item, never just one attribute: 72h while it still carries an
  // unconsumed coupon_code, otherwise 30 days as ordinary history.
  // clearNotificationCode moves a row from the first case to the second.
  expires_at?: number;
}

export async function insertNotification(
  notif: Omit<Notification, 'notification_id' | 'created_at'>
): Promise<Notification> {
  const { coupon_code, ...rest } = notif;
  const item: Notification = {
    ...rest,
    notification_id: uuidv4(),
    created_at: new Date().toISOString(),
    expires_at: ttlFromNow(coupon_code ? CODE_TTL_SECONDS : NOTIFICATION_TTL_SECONDS),
    ...(coupon_code ? { coupon_code: encryptCode(coupon_code) } : {}),
  };
  await ddb.send(new PutCommand({ TableName: NOTIFICATIONS_TABLE, Item: item }));
  return { ...item, coupon_code };
}

// Insert a notification AND push it live over the WebSocket. The pushed payload
// is always code-stripped: coupon codes never travel inside a notification
// frame. Persisting coupon_code on the item (encrypted, TTL'd) is a fallback
// only - used when the recipient was offline at share time, or when a P2P
// data-channel transfer to an online recipient failed (see rescueCode).
export async function notifyUser(
  notif: Omit<Notification, 'notification_id' | 'created_at'>
): Promise<Notification> {
  const item = await insertNotification(notif);
  const { coupon_code, ...metadataOnly } = item;
  await pushToUser(item.user_id, { event: 'notification', notification: metadataOnly });
  return item;
}

// Clears a delivered fallback code once the client has consumed it locally -
// faster and more precise than waiting on the 72h TTL, and leaves the
// notification row (read state, history) intact.
//
// The row also graduates from the 72h code clock to ordinary 30-day
// retention. Simply dropping the TTL attribute here would leave it with no
// expiry at all, i.e. immortal - which is how notifications came to
// accumulate without bound.
export async function clearNotificationCode(userId: string, notificationId: string): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: NOTIFICATIONS_TABLE,
    Key: { user_id: userId, notification_id: notificationId },
    UpdateExpression: 'REMOVE coupon_code SET expires_at = :exp',
    ExpressionAttributeValues: { ':exp': ttlFromNow(NOTIFICATION_TTL_SECONDS) },
  }));
}

// Rescue path: called when a P2P negotiation to an online recipient failed.
// Writes the code (encrypted, TTL'd) onto that recipient's existing row for
// this coupon, same as the offline fallback.
//
// Matches by group_id/coupon_id, so no ordering is needed and an unrelated
// backlog cannot hide it. Accepts either carrier type: a first share leaves a
// group_share row, while a code update to an ONLINE recipient leaves none at
// all (the code was meant to go P2P only).
//
// Reads the BASE table with ConsistentRead, deliberately not the GSI: indexes
// are eventually consistent and cannot be read consistently, and this runs
// seconds after notifyUser wrote the row. A lagging index would miss it and
// strand the code - the exact failure this path exists to prevent.
export async function rescueCode(
  userId: string,
  groupId: string,
  couponId: string,
  couponCode: string,
  groupName?: string
): Promise<boolean> {
  const matches = await queryUserPartition(userId, {
    filter: '(#t = :share OR #t = :sync) AND group_id = :gid AND coupon_id = :cid',
    names: { '#t': 'type' }, // `type` is a DynamoDB reserved word
    values: {
      ':share': 'group_share',
      ':sync': 'coupon_code_sync',
      ':gid': groupId,
      ':cid': couponId,
    },
    consistent: true,
  });
  const target = matches[0];

  // Nothing to attach to. Happens when a code update's P2P delivery fails and
  // the recipient has no surviving row from the original share (they dismissed
  // it, or it aged out). Without this the code would simply be lost for them.
  if (!target) {
    await insertNotification({
      user_id: userId,
      type: 'coupon_code_sync',
      title: 'Coupon code updated',
      body: 'The code for a shared coupon was updated.',
      read: true, // carrier row only - never surfaced, see the client type guard
      group_id: groupId,
      ...(groupName ? { group_name: groupName } : {}),
      coupon_id: couponId,
      coupon_code: couponCode,
    });
    return true;
  }
  await ddb.send(new UpdateCommand({
    TableName: NOTIFICATIONS_TABLE,
    Key: { user_id: userId, notification_id: target.notification_id },
    UpdateExpression: 'SET coupon_code = :code, expires_at = :exp',
    ExpressionAttributeValues: {
      ':code': encryptCode(couponCode),
      // Back onto the 72h code clock until the recipient consumes it.
      ':exp': ttlFromNow(CODE_TTL_SECONDS),
    },
  }));
  return true;
}

// Pages a user's partition on the BASE table. Used where ordering is
// irrelevant but completeness matters, and where a strongly consistent read
// is required (the GSI cannot do one).
//
// Keeps paging on an empty page on purpose: a FilterExpression is applied
// after the read, so DynamoDB can return zero matches and still hand back a
// LastEvaluatedKey. Stopping there would miss later matches.
async function queryUserPartition(
  userId: string,
  opts: {
    filter?: string;
    names?: Record<string, string>;
    values?: Record<string, unknown>;
    consistent?: boolean;
  } = {}
): Promise<Notification[]> {
  const items: Notification[] = [];
  let lastKey: Record<string, unknown> | undefined;
  let pages = 0;

  do {
    const result: any = await ddb.send(new QueryCommand({
      TableName: NOTIFICATIONS_TABLE,
      KeyConditionExpression: 'user_id = :uid',
      ...(opts.filter ? { FilterExpression: opts.filter } : {}),
      ...(opts.names ? { ExpressionAttributeNames: opts.names } : {}),
      ExpressionAttributeValues: { ':uid': userId, ...(opts.values ?? {}) },
      ...(opts.consistent ? { ConsistentRead: true } : {}),
      ExclusiveStartKey: lastKey,
    }));
    items.push(...((result.Items as Notification[]) ?? []));
    lastKey = result.LastEvaluatedKey;
    pages += 1;
  } while (lastKey && pages < MAX_QUERY_PAGES);

  return items;
}

// Fallback for getNotificationsForUser when the GSI is unavailable: read the
// whole partition and order it here. Correct but reads everything, which is
// exactly what the index exists to avoid.
async function newestByFullScan(userId: string): Promise<Notification[]> {
  const items = await queryUserPartition(userId);
  return items
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .slice(0, MAX_NOTIFICATIONS_RETURNED);
}

// Newest first, capped. Served by the GSI so DynamoDB returns exactly the
// rows we need instead of us reading the whole partition to find them.
//
// Falls back to a full scan on any index error: the GSI is unusable for a few
// minutes after creation while it backfills, and this keeps notifications
// working if it is missing or misnamed rather than failing the request. The
// warning makes a permanently-absent index visible instead of silently slow.
export async function getNotificationsForUser(userId: string): Promise<Notification[]> {
  let items: Notification[];
  try {
    const result = await ddb.send(new QueryCommand({
      TableName: NOTIFICATIONS_TABLE,
      IndexName: CREATED_AT_INDEX,
      KeyConditionExpression: 'user_id = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ScanIndexForward: false,
      Limit: MAX_NOTIFICATIONS_RETURNED,
    }));
    items = (result.Items as Notification[]) ?? [];
  } catch (err: any) {
    console.warn(
      '[notifications] GSI query failed (%s), falling back to full scan: %s',
      CREATED_AT_INDEX, err?.message ?? err
    );
    items = await newestByFullScan(userId);
  }
  return items.map(n => (n.coupon_code ? { ...n, coupon_code: decryptStoredCode(n.coupon_code) } : n));
}

export async function deleteNotification(userId: string, notificationId: string): Promise<void> {
  await ddb.send(new DeleteCommand({
    TableName: NOTIFICATIONS_TABLE,
    Key: { user_id: userId, notification_id: notificationId },
  }));
}

// Filters server-side for unread rows across the whole partition, not just a
// page: marking only the newest 50 would leave older unread rows behind and
// the badge stuck above zero. Ordering is irrelevant here, so no index.
export async function markAllNotificationsRead(userId: string): Promise<void> {
  const unread = await queryUserPartition(userId, {
    filter: '#r = :false',
    names: { '#r': 'read' }, // `read` is a DynamoDB reserved word
    values: { ':false': false },
  });
  await Promise.all(
    unread
      .map(n =>
        ddb.send(new UpdateCommand({
          TableName: NOTIFICATIONS_TABLE,
          Key: { user_id: n.user_id, notification_id: n.notification_id },
          UpdateExpression: 'SET #r = :true',
          ExpressionAttributeNames: { '#r': 'read' },
          ExpressionAttributeValues: { ':true': true },
        }))
      )
  );
}
