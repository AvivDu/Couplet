import { verifier } from '../lib/cognito';
import { addConnection, removeConnection, getUserIdByConnection } from '../repositories/connections';
import { pushToUser } from '../lib/websocket';
import { getGroupsByUser } from '../repositories/groups';

// Minimal shape of an API Gateway WebSocket Lambda event (avoids a dependency
// on @types/aws-lambda).
interface WsEvent {
  requestContext: { routeKey: string; connectionId: string };
  queryStringParameters?: Record<string, string> | null;
  body?: string | null;
}

interface WsResult {
  statusCode: number;
  body?: string;
}

// Maps a connection back to its user, then relays the coupon code to the
// recipients that are genuinely co-members of a group containing this coupon.
// Identity comes from the verified connection — never from the message body.
// Nothing is persisted: this is a pure ephemeral relay (Stage 1 toward P2P).
async function handleCouponTransfer(
  senderUserId: string,
  toUserIds: string[],
  couponId: string,
  code: string,
): Promise<void> {
  if (!couponId || !code || !Array.isArray(toUserIds) || toUserIds.length === 0) return;

  // Recipients allowed = members (other than the sender) of any group the sender
  // belongs to that contains this coupon.
  const senderGroups = await getGroupsByUser(senderUserId);
  const allowed = new Set<string>();
  for (const g of senderGroups) {
    if (g.coupon_id_list?.includes(couponId)) {
      for (const uid of g.user_id_list) {
        if (uid !== senderUserId) allowed.add(uid);
      }
    }
  }

  const recipients = toUserIds.filter(uid => allowed.has(uid));
  await Promise.all(
    recipients.map(uid =>
      pushToUser(uid, { event: 'coupon_transfer', coupon_id: couponId, code })
    )
  );
}

export async function wsHandler(event: WsEvent): Promise<WsResult> {
  const { routeKey, connectionId } = event.requestContext;

  switch (routeKey) {
    case '$connect': {
      const token = event.queryStringParameters?.token;
      if (!token) return { statusCode: 401, body: 'Missing token' };
      try {
        const payload = await verifier.verify(token);
        await addConnection(connectionId, payload.sub);
        return { statusCode: 200 };
      } catch {
        return { statusCode: 401, body: 'Invalid or expired token' };
      }
    }

    case '$disconnect': {
      await removeConnection(connectionId).catch(() => {});
      return { statusCode: 200 };
    }

    default: {
      // $default — identity comes from the already-authenticated connection,
      // not from the message body.
      let msg: any;
      try {
        msg = JSON.parse(event.body ?? '{}');
      } catch {
        return { statusCode: 400, body: 'Invalid JSON' };
      }

      if (msg.action === 'ping') return { statusCode: 200 };

      if (msg.action === 'coupon_transfer') {
        const senderUserId = await getUserIdByConnection(connectionId);
        if (!senderUserId) return { statusCode: 401, body: 'Unknown connection' };
        await handleCouponTransfer(senderUserId, msg.toUserIds, msg.coupon_id, msg.code);
        return { statusCode: 200 };
      }

      return { statusCode: 200 };
    }
  }
}
