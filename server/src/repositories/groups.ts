import { GetCommand, PutCommand, UpdateCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, GROUPS_TABLE } from '../lib/dynamo';
import { getCouponById } from './coupons';

export interface Group {
  group_id: string;
  name: string;
  admin_user_id: string;
  user_id_list: string[];
  coupon_id_list: string[];
  created_at: string;
}

export async function createGroup(group: Group): Promise<void> {
  await ddb.send(new PutCommand({ TableName: GROUPS_TABLE, Item: group }));
}

export async function getGroupsByUser(userId: string): Promise<Group[]> {
  const result = await ddb.send(new ScanCommand({
    TableName: GROUPS_TABLE,
    FilterExpression: 'contains(user_id_list, :userId)',
    ExpressionAttributeValues: { ':userId': userId },
  }));
  return (result.Items as Group[] ?? [])
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getGroupById(id: string): Promise<Group | null> {
  const result = await ddb.send(new GetCommand({
    TableName: GROUPS_TABLE,
    Key: { group_id: id },
  }));
  return (result.Item as Group) ?? null;
}

export async function addMemberToGroup(groupId: string, userId: string): Promise<Group | null> {
  const group = await getGroupById(groupId);
  if (!group) return null;
  if (group.user_id_list.includes(userId)) return group;
  const result = await ddb.send(new UpdateCommand({
    TableName: GROUPS_TABLE,
    Key: { group_id: groupId },
    UpdateExpression: 'SET user_id_list = list_append(user_id_list, :u)',
    ExpressionAttributeValues: { ':u': [userId] },
    ReturnValues: 'ALL_NEW',
  }));
  return result.Attributes as Group;
}

export async function removeMemberFromGroup(groupId: string, userId: string, adminId: string): Promise<Group | null> {
  const group = await getGroupById(groupId);
  if (!group || group.admin_user_id !== adminId) return null;
  const newList = group.user_id_list.filter(id => id !== userId);
  const result = await ddb.send(new UpdateCommand({
    TableName: GROUPS_TABLE,
    Key: { group_id: groupId },
    UpdateExpression: 'SET user_id_list = :list',
    ExpressionAttributeValues: { ':list': newList },
    ReturnValues: 'ALL_NEW',
  }));
  return result.Attributes as Group;
}

export async function addCouponToGroup(groupId: string, couponId: string): Promise<Group | null> {
  const group = await getGroupById(groupId);
  if (!group) return null;
  if (group.coupon_id_list.includes(couponId)) return group;
  const result = await ddb.send(new UpdateCommand({
    TableName: GROUPS_TABLE,
    Key: { group_id: groupId },
    UpdateExpression: 'SET coupon_id_list = list_append(coupon_id_list, :c)',
    ExpressionAttributeValues: { ':c': [couponId] },
    ReturnValues: 'ALL_NEW',
  }));
  return result.Attributes as Group;
}

export async function removeCouponFromGroup(groupId: string, couponId: string): Promise<Group | null> {
  const group = await getGroupById(groupId);
  if (!group) return null;
  const newList = group.coupon_id_list.filter(id => id !== couponId);
  const result = await ddb.send(new UpdateCommand({
    TableName: GROUPS_TABLE,
    Key: { group_id: groupId },
    UpdateExpression: 'SET coupon_id_list = :list',
    ExpressionAttributeValues: { ':list': newList },
    ReturnValues: 'ALL_NEW',
  }));
  return result.Attributes as Group;
}

export async function removeCouponsByOwnerFromGroup(groupId: string, ownerId: string): Promise<void> {
  const group = await getGroupById(groupId);
  if (!group) return;
  const couponChecks = await Promise.all(group.coupon_id_list.map(cid => getCouponById(cid)));
  const newList = group.coupon_id_list.filter((_, i) => {
    const c = couponChecks[i];
    return !c || c.owner_id !== ownerId;
  });
  await ddb.send(new UpdateCommand({
    TableName: GROUPS_TABLE,
    Key: { group_id: groupId },
    UpdateExpression: 'SET coupon_id_list = :list',
    ExpressionAttributeValues: { ':list': newList },
  }));
}
