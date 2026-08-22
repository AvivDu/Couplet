import { PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { ddb, NOTIFICATIONS_TABLE } from '../lib/dynamo';
import { pushToUser } from '../lib/websocket';
import { encryptCode, decryptStoredCode } from '../lib/codeCrypto';

// A code-carrying fallback row (offline share, or a failed P2P negotiation)
// is only kept for 72h — see code_expires_at below.
const CODE_TTL_SECONDS = 72 * 60 * 60;

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
  // DynamoDB TTL attribute (epoch seconds) — only set when coupon_code is
  // present. Deletes the whole item (not just the code) after ~72h if the
  // recipient never consumed it; see markCodeConsumed for the earlier path.
  code_expires_at?: number;
}

export async function insertNotification(
  notif: Omit<Notification, 'notification_id' | 'created_at'>
): Promise<Notification> {
  const { coupon_code, ...rest } = notif;
  const item: Notification = {
    ...rest,
    notification_id: uuidv4(),
    created_at: new Date().toISOString(),
    ...(coupon_code
      ? { coupon_code: encryptCode(coupon_code), code_expires_at: Math.floor(Date.now() / 1000) + CODE_TTL_SECONDS }
      : {}),
  };
  await ddb.send(new PutCommand({ TableName: NOTIFICATIONS_TABLE, Item: item }));
  return { ...item, coupon_code };
}

// Insert a notification AND push it live over the WebSocket. The pushed payload
// is always code-stripped: coupon codes never travel inside a notification
// frame. Persisting coupon_code on the item (encrypted, TTL'd) is a fallback
// only — used when the recipient was offline at share time, or when a P2P
// data-channel transfer to an online recipient failed (see rescueCode).
export async function notifyUser(
  notif: Omit<Notification, 'notification_id' | 'created_at'>
): Promise<Notification> {
  const item = await insertNotification(notif);
  const { coupon_code, ...metadataOnly } = item;
  await pushToUser(item.user_id, { event: 'notification', notification: metadataOnly });
  return item;
}

// Clears a delivered fallback code once the client has consumed it locally —
// faster and more precise than waiting on the 72h TTL, and leaves the
// notification row (read state, history) intact.
export async function clearNotificationCode(userId: string, notificationId: string): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: NOTIFICATIONS_TABLE,
    Key: { user_id: userId, notification_id: notificationId },
    UpdateExpression: 'REMOVE coupon_code, code_expires_at',
  }));
}

// Rescue path: called when a P2P negotiation to an online recipient failed.
// Finds that recipient's group_share notification for this coupon and writes
// the code onto it (encrypted, TTL'd), same as the offline fallback.
export async function rescueCode(
  userId: string,
  groupId: string,
  couponId: string,
  couponCode: string
): Promise<boolean> {
  const notifications = await getNotificationsForUser(userId);
  const target = notifications.find(
    n => n.type === 'group_share' && n.group_id === groupId && n.coupon_id === couponId
  );
  if (!target) return false;
  await ddb.send(new UpdateCommand({
    TableName: NOTIFICATIONS_TABLE,
    Key: { user_id: userId, notification_id: target.notification_id },
    UpdateExpression: 'SET coupon_code = :code, code_expires_at = :exp',
    ExpressionAttributeValues: {
      ':code': encryptCode(couponCode),
      ':exp': Math.floor(Date.now() / 1000) + CODE_TTL_SECONDS,
    },
  }));
  return true;
}

export async function getNotificationsForUser(userId: string): Promise<Notification[]> {
  const result = await ddb.send(new QueryCommand({
    TableName: NOTIFICATIONS_TABLE,
    KeyConditionExpression: 'user_id = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    ScanIndexForward: false,
    Limit: 50,
  }));
  const items = (result.Items as Notification[]) ?? [];
  return items.map(n => (n.coupon_code ? { ...n, coupon_code: decryptStoredCode(n.coupon_code) } : n));
}

export async function deleteNotification(userId: string, notificationId: string): Promise<void> {
  await ddb.send(new DeleteCommand({
    TableName: NOTIFICATIONS_TABLE,
    Key: { user_id: userId, notification_id: notificationId },
  }));
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const notifications = await getNotificationsForUser(userId);
  await Promise.all(
    notifications
      .filter(n => !n.read)
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
