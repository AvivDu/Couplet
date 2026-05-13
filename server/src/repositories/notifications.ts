import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { ddb, NOTIFICATIONS_TABLE } from '../lib/dynamo';

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
}

export async function insertNotification(
  notif: Omit<Notification, 'notification_id' | 'created_at'>
): Promise<Notification> {
  const item: Notification = {
    ...notif,
    notification_id: uuidv4(),
    created_at: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: NOTIFICATIONS_TABLE, Item: item }));
  return item;
}

export async function getNotificationsForUser(userId: string): Promise<Notification[]> {
  const result = await ddb.send(new QueryCommand({
    TableName: NOTIFICATIONS_TABLE,
    KeyConditionExpression: 'user_id = :uid',
    ExpressionAttributeValues: { ':uid': userId },
    ScanIndexForward: false,
    Limit: 50,
  }));
  return (result.Items as Notification[]) ?? [];
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
