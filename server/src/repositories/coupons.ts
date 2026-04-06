import { GetCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, COUPONS_TABLE } from '../lib/dynamo';

export interface Coupon {
  coupon_id: string;
  owner_id: string;
  category: string;
  store_name: string;
  expiration_date: string | null;
  balance: number | null;
  status: string;
  created_at: string;
  redeemable_stores?: string[];
}

export async function getCouponsByOwner(ownerId: string): Promise<Coupon[]> {
  const result = await ddb.send(new ScanCommand({
    TableName: COUPONS_TABLE,
    FilterExpression: 'owner_id = :ownerId',
    ExpressionAttributeValues: { ':ownerId': ownerId },
  }));
  return (result.Items as Coupon[] ?? [])
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function getCouponById(id: string): Promise<Coupon | null> {
  const result = await ddb.send(new GetCommand({
    TableName: COUPONS_TABLE,
    Key: { coupon_id: id },
  }));
  return (result.Item as Coupon) ?? null;
}

export async function insertCoupon(coupon: Coupon): Promise<void> {
  await ddb.send(new PutCommand({ TableName: COUPONS_TABLE, Item: coupon }));
}

export async function updateCoupon(id: string, ownerId: string, fields: Partial<Coupon>): Promise<Coupon | null> {
  const existing = await getCouponById(id);
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
}

export async function deleteCoupon(id: string, ownerId: string): Promise<boolean> {
  const existing = await getCouponById(id);
  if (!existing || existing.owner_id !== ownerId) return false;
  await ddb.send(new DeleteCommand({ TableName: COUPONS_TABLE, Key: { coupon_id: id } }));
  return true;
}
