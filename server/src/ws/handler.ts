import { verifier } from '../lib/cognito';
import { addConnection, removeConnection, getUserIdByConnectionId } from '../repositories/connections';
import { pushToUser } from '../lib/websocket';

// WebRTC signaling actions relayed opaquely between two users' connections —
// the server never inspects sdp/candidate contents, just forwards them.
const SIGNAL_ACTIONS = new Set([
  'webrtc-offer',
  'webrtc-answer',
  'webrtc-ice-candidate',
  'webrtc-cancel',
]);

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
      // $default — keepalive pings, plus a strict WebRTC signaling relay
      // (SDP offers/answers, ICE candidates). Coupon codes never travel over
      // this socket; the relay only forwards opaque signaling payloads
      // between two users' connections.
      let msg: any;
      try {
        msg = JSON.parse(event.body ?? '{}');
      } catch {
        return { statusCode: 400, body: 'Invalid JSON' };
      }
      if (msg.action === 'ping') return { statusCode: 200 };

      if (SIGNAL_ACTIONS.has(msg.action)) {
        const { session_id, to_user_id, sdp, candidate } = msg;
        if (!session_id || !to_user_id) {
          return { statusCode: 400, body: 'Missing session_id/to_user_id' };
        }
        const fromUserId = await getUserIdByConnectionId(connectionId);
        if (!fromUserId) return { statusCode: 401, body: 'Unknown connection' };
        await pushToUser(to_user_id, { event: msg.action, session_id, from_user_id: fromUserId, sdp, candidate });
        return { statusCode: 200 };
      }

      return { statusCode: 200 };
    }
  }
}
