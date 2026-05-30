import { GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, USERS_TABLE } from '../lib/dynamo';

export interface User {
  user_id: string;
  email: string;
  username: string;
  password_hash: string;
  created_at: string;
  phone_number?: string;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await ddb.send(new ScanCommand({
    TableName: USERS_TABLE,
    FilterExpression: 'email = :email',
    ExpressionAttributeValues: { ':email': email },
  }));
  return (result.Items?.[0] as User) ?? null;
}

export async function findUserById(id: string): Promise<User | null> {
  const result = await ddb.send(new GetCommand({
    TableName: USERS_TABLE,
    Key: { user_id: id },
  }));
  return (result.Item as User) ?? null;
}

export async function insertUser(user: User): Promise<void> {
  await ddb.send(new PutCommand({ TableName: USERS_TABLE, Item: user }));
}

export async function findUsersByQuery(query: string): Promise<User[]> {
  const result = await ddb.send(new ScanCommand({ TableName: USERS_TABLE }));
  const q = query.toLowerCase();
  return (result.Items as User[] ?? [])
    .filter(u => u.email.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
    .slice(0, 10);
}

const normalizePhone = (phone: string) => phone.replace(/\D/g, '');

export async function findUserByPhone(phone: string): Promise<User | null> {
  const target = normalizePhone(phone);
  if (!target) return null;
  const result = await ddb.send(new ScanCommand({ TableName: USERS_TABLE }));
  return (result.Items as User[] ?? [])
    .find(u => u.phone_number && normalizePhone(u.phone_number) === target) ?? null;
}

export async function updateUserById(
  userId: string,
  updates: { username?: string; phone_number?: string }
): Promise<User | null> {
  const expressions: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, string> = {};
  if (updates.username !== undefined) {
    expressions.push('#un = :un'); names['#un'] = 'username'; values[':un'] = updates.username;
  }
  if (updates.phone_number !== undefined) {
    expressions.push('#ph = :ph'); names['#ph'] = 'phone_number'; values[':ph'] = updates.phone_number;
  }
  if (expressions.length === 0) return findUserById(userId);
  await ddb.send(new UpdateCommand({
    TableName: USERS_TABLE,
    Key: { user_id: userId },
    UpdateExpression: `SET ${expressions.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
  return findUserById(userId);
}
