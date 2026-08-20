import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, GMAIL_CONNECTIONS_TABLE } from '../lib/dynamo';

export interface GmailCandidate {
  message_id: string;
  from: string;
  subject: string;
  date: string;
  created_at: string;
}

// Which Google OAuth client issued the stored refresh token — Google binds refresh
// tokens to the client that requested them, so scans must reuse the matching credentials.
export type OAuthClient = 'native' | 'web';

export interface GmailConnection {
  user_id: string;
  gmail_email: string;
  refresh_token_encrypted: string;
  oauth_client: OAuthClient;
  last_scan: string | null;
  created_at: string;
  candidates: GmailCandidate[];
}

// Bounds item size over months of re-scans — a personal inbox filtered to coupon
// keywords realistically never gets close to this, but it keeps the row small regardless.
const MAX_STORED_CANDIDATES = 500;

export async function getGmailConnection(userId: string): Promise<GmailConnection | null> {
  const result = await ddb.send(new GetCommand({
    TableName: GMAIL_CONNECTIONS_TABLE,
    Key: { user_id: userId },
  }));
  return (result.Item as GmailConnection) ?? null;
}

export async function saveGmailConnection(connection: GmailConnection): Promise<void> {
  await ddb.send(new PutCommand({ TableName: GMAIL_CONNECTIONS_TABLE, Item: connection }));
}

// Merges newly-found candidates into the stored list, keyed by message_id so
// re-scans overwrite in place instead of duplicating, and updates last_scan.
export async function addCandidatesAndUpdateLastScan(
  userId: string,
  existing: GmailCandidate[],
  newOnes: GmailCandidate[],
  lastScanIso: string
): Promise<GmailCandidate[]> {
  const byId = new Map<string, GmailCandidate>();
  for (const c of existing) byId.set(c.message_id, c);
  for (const c of newOnes) byId.set(c.message_id, c);

  const merged = [...byId.values()]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, MAX_STORED_CANDIDATES);

  await ddb.send(new UpdateCommand({
    TableName: GMAIL_CONNECTIONS_TABLE,
    Key: { user_id: userId },
    UpdateExpression: 'SET last_scan = :ls, candidates = :c',
    ExpressionAttributeValues: { ':ls': lastScanIso, ':c': merged },
  }));

  return merged;
}
