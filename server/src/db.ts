import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

// ── Interfaces ────────────────────────────────────────────────────────────

export interface User {
  user_id: string;
  email: string;
  username: string;
  password_hash: string;
  created_at: string;
}

export interface Coupon {
  coupon_id: string;
  owner_id: string;
  category: string;
  store_name: string;
  expiration_date: string | null;
  balance: number | null;
  status: string;
  created_at: string;
}

export interface Group {
  group_id: string;
  name: string;
  admin_user_id: string;
  user_id_list: string[];
  coupon_id_list: string[];
  created_at: string;
}

// ── DynamoDB client ───────────────────────────────────────────────────────

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
const ddb = DynamoDBDocumentClient.from(client);

const USERS_TABLE   = process.env.DYNAMODB_USERS_TABLE!;
const COUPONS_TABLE = process.env.DYNAMODB_COUPONS_TABLE!;
const GROUPS_TABLE  = process.env.DYNAMODB_GROUPS_TABLE!;

// ── DB functions ──────────────────────────────────────────────────────────

export const db = {
  // Users
  async findUserByEmail(email: string): Promise<User | null> {
    const result = await ddb.send(new ScanCommand({
      TableName: USERS_TABLE,
      FilterExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
    }));
    return (result.Items?.[0] as User) ?? null;
  },

  async findUserById(id: string): Promise<User | null> {
    const result = await ddb.send(new GetCommand({
      TableName: USERS_TABLE,
      Key: { user_id: id },
    }));
    return (result.Item as User) ?? null;
  },

  async insertUser(user: User): Promise<void> {
    await ddb.send(new PutCommand({ TableName: USERS_TABLE, Item: user }));
  },

  async findUsersByQuery(query: string): Promise<User[]> {
    const result = await ddb.send(new ScanCommand({ TableName: USERS_TABLE }));
    const q = query.toLowerCase();
    return (result.Items as User[] ?? [])
      .filter(u => u.email.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
      .slice(0, 10);
  },

  // Coupons
  async getCouponsByOwner(ownerId: string): Promise<Coupon[]> {
    const result = await ddb.send(new ScanCommand({
      TableName: COUPONS_TABLE,
      FilterExpression: 'owner_id = :ownerId',
      ExpressionAttributeValues: { ':ownerId': ownerId },
    }));
    return (result.Items as Coupon[] ?? [])
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async getCouponById(id: string): Promise<Coupon | null> {
    const result = await ddb.send(new GetCommand({
      TableName: COUPONS_TABLE,
      Key: { coupon_id: id },
    }));
    return (result.Item as Coupon) ?? null;
  },

  async insertCoupon(coupon: Coupon): Promise<void> {
    await ddb.send(new PutCommand({ TableName: COUPONS_TABLE, Item: coupon }));
  },

  async updateCoupon(id: string, ownerId: string, fields: Partial<Coupon>): Promise<Coupon | null> {
    const existing = await db.getCouponById(id);
    if (!existing || existing.owner_id !== ownerId) return null;

    const entries = Object.entries(fields).filter(([k]) => k !== 'coupon_id');
    if (entries.length === 0) return existing;

    const updateExpr = 'SET ' + entries.map((_, i) => `#f${i} = :v${i}`).join(', ');
    const exprNames: Record<string, string> = {};
    const exprValues: Record<string, unknown> = {};
    entries.forEach(([k, v], i) => { exprNames[`#f${i}`] = k; exprValues[`:v${i}`] = v; });

    const result = await ddb.send(new UpdateCommand({
      TableName: COUPONS_TABLE,
      Key: { coupon_id: id },
      UpdateExpression: updateExpr,
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
      ReturnValues: 'ALL_NEW',
    }));
    return result.Attributes as Coupon;
  },

  async deleteCoupon(id: string, ownerId: string): Promise<boolean> {
    const existing = await db.getCouponById(id);
    if (!existing || existing.owner_id !== ownerId) return false;
    await ddb.send(new DeleteCommand({ TableName: COUPONS_TABLE, Key: { coupon_id: id } }));
    return true;
  },

  // Groups
  async createGroup(group: Group): Promise<void> {
    await ddb.send(new PutCommand({ TableName: GROUPS_TABLE, Item: group }));
  },

  async getGroupsByUser(userId: string): Promise<Group[]> {
    const result = await ddb.send(new ScanCommand({
      TableName: GROUPS_TABLE,
      FilterExpression: 'contains(user_id_list, :userId)',
      ExpressionAttributeValues: { ':userId': userId },
    }));
    return (result.Items as Group[] ?? [])
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async getGroupById(id: string): Promise<Group | null> {
    const result = await ddb.send(new GetCommand({
      TableName: GROUPS_TABLE,
      Key: { group_id: id },
    }));
    return (result.Item as Group) ?? null;
  },

  async addMemberToGroup(groupId: string, userId: string): Promise<Group | null> {
    const group = await db.getGroupById(groupId);
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
  },

  async removeMemberFromGroup(groupId: string, userId: string, adminId: string): Promise<Group | null> {
    const group = await db.getGroupById(groupId);
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
  },

  async addCouponToGroup(groupId: string, couponId: string): Promise<Group | null> {
    const group = await db.getGroupById(groupId);
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
  },

  async removeCouponFromGroup(groupId: string, couponId: string): Promise<Group | null> {
    const group = await db.getGroupById(groupId);
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
  },

  async removeCouponsByOwnerFromGroup(groupId: string, ownerId: string): Promise<void> {
    const group = await db.getGroupById(groupId);
    if (!group) return;
    const couponChecks = await Promise.all(group.coupon_id_list.map(cid => db.getCouponById(cid)));
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
  },
};
