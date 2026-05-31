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

// Strip everything except digits so "050-123 4567" and "0501234567" compare equal.
const normalizePhone = (phone: string) => phone.replace(/\D/g, '');

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await ddb.send(new ScanCommand({
    TableName: USERS_TABLE,
    FilterExpression: 'email = :email',
    ExpressionAttributeValues: { ':email': email },
  }));
  return (result.Items?.[0] as User) ?? null;
}

export async function findUserByPhone(phone: string): Promise<User | null> {
  const target = normalizePhone(phone);
  if (!target) return null;
  // No FilterExpression: phone formats vary, so we normalize each item in code and compare.
  const result = await ddb.send(new ScanCommand({ TableName: USERS_TABLE }));
  const found = (result.Items as User[] ?? [])
    .find(u => u.phone_number && normalizePhone(u.phone_number) === target);
  return found ?? null;
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
  const qDigits = normalizePhone(query);
  return (result.Items as User[] ?? [])
    .filter(u =>
      u.email.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      (qDigits.length > 0 && !!u.phone_number && normalizePhone(u.phone_number).includes(qDigits))
    )
    .slice(0, 10);
}

export async function findUsersByPhones(phones: string[]): Promise<User[]> {
  if (phones.length === 0) return [];
  const result = await ddb.send(new ScanCommand({ TableName: USERS_TABLE }));
  const allUsers = result.Items as User[] ?? [];
  const targets = new Set(phones.map(p => p.replace(/\D/g, '')).filter(Boolean));
  return allUsers.filter(u => u.phone_number && targets.has(u.phone_number.replace(/\D/g, '')));
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
