import { verifier } from '../lib/cognito';
import { addConnection, removeConnection } from '../repositories/connections';

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
      // $default — only keepalive pings are expected. Coupon codes are relayed
      // server-side from the share endpoint (routes/groups.ts), never sent by
      // clients over the socket.
      let msg: any;
      try {
        msg = JSON.parse(event.body ?? '{}');
      } catch {
        return { statusCode: 400, body: 'Invalid JSON' };
      }
      if (msg.action === 'ping') return { statusCode: 200 };
      return { statusCode: 200 };
    }
  }
}
