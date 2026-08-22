import { PutCommand, DeleteCommand, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, CONNECTIONS_TABLE } from '../lib/dynamo';

// Maps an open WebSocket connection to the authenticated user. PK is
// connection_id (so $disconnect can delete by the only id it has); a GSI on
// user_id (user_id-index) lets us find every live socket for a user when pushing.
export interface Connection {
  connection_id: string;
  user_id: string;
  connected_at: string;
}

export async function addConnection(connectionId: string, userId: string): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: CONNECTIONS_TABLE,
    Item: {
      connection_id: connectionId,
      user_id: userId,
      connected_at: new Date().toISOString(),
    } as Connection,
  }));
}

export async function removeConnection(connectionId: string): Promise<void> {
  await ddb.send(new DeleteCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connection_id: connectionId },
  }));
}

// Reverse lookup used by the WebRTC signaling relay ($default route), which
// only has the sender's connection_id and needs to know who they are.
export async function getUserIdByConnectionId(connectionId: string): Promise<string | null> {
  const result = await ddb.send(new GetCommand({
    TableName: CONNECTIONS_TABLE,
    Key: { connection_id: connectionId },
  }));
  return (result.Item as Connection | undefined)?.user_id ?? null;
}

export async function getConnectionsForUser(userId: string): Promise<string[]> {
  const result = await ddb.send(new QueryCommand({
    TableName: CONNECTIONS_TABLE,
    IndexName: 'user_id-index',
    KeyConditionExpression: 'user_id = :uid',
    ExpressionAttributeValues: { ':uid': userId },
  }));
  return ((result.Items as Connection[]) ?? []).map(c => c.connection_id);
}
