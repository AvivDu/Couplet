import { GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, USERS_TABLE } from '../lib/dynamo';

export interface User {
  user_id: string;
  email: string;
  username: string;
  password_hash: string;
  created_at: string;
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
