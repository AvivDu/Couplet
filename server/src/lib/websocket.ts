import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import { getConnectionsForUser, removeConnection } from '../repositories/connections';

// Management endpoint for the WebSocket API used to push messages to connected
// clients: https://{WS_API_ID}.execute-api.{region}.amazonaws.com/{stage}
// Prefer an explicit WS_API_ENDPOINT, otherwise build it from WS_API_ID/WS_STAGE.
const region = process.env.AWS_REGION ?? 'us-east-1';
const endpoint =
  process.env.WS_API_ENDPOINT ??
  `https://${process.env.WS_API_ID}.execute-api.${region}.amazonaws.com/${process.env.WS_STAGE ?? 'prod'}`;

const client = new ApiGatewayManagementApiClient({ region, endpoint });

// Push a payload to a single connection. Returns false if the socket is gone
// (410) so callers can prune it; never throws.
async function postToConnection(connectionId: string, payload: unknown): Promise<boolean> {
  try {
    await client.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(payload)),
    }));
    return true;
  } catch (err: any) {
    if (err?.name === 'GoneException' || err?.$metadata?.httpStatusCode === 410) {
      await removeConnection(connectionId).catch(() => {});
    } else {
      console.error('[ws] postToConnection failed for %s: %s', connectionId, err?.message ?? err);
    }
    return false;
  }
}

// Push a payload to every live socket of a user. Wrapped so a delivery failure
// never breaks the originating HTTP request.
export async function pushToUser(userId: string, payload: unknown): Promise<void> {
  try {
    const connectionIds = await getConnectionsForUser(userId);
    await Promise.all(connectionIds.map(id => postToConnection(id, payload)));
  } catch (err: any) {
    console.error('[ws] pushToUser failed for %s: %s', userId, err?.message ?? err);
  }
}
