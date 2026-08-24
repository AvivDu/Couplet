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
  giftcard_url?: string | null;
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

// Redemption is deliberately NOT expressed as "write this absolute balance".
// A shared coupon has several people able to redeem it at once, and a blind
// SET loses updates: from ₪100, A redeeming ₪60 and B redeeming ₪50
// concurrently would both compute from the same stale start and one write
// would win, spending ₪110 of a ₪100 coupon. Sending the *amount* instead and
// letting DynamoDB apply it conditionally makes the whole thing one atomic op.
// (DynamoDB numbers are decimal, so this also avoids the float drift a
// client-side subtraction would introduce on money.)
export type RedeemResult =
  | { ok: true; coupon: Coupon }
  | { ok: false; reason: 'not_found' | 'no_balance' | 'insufficient' };

export async function redeemCouponAmount(id: string, amount: number): Promise<RedeemResult> {
  const existing = await getCouponById(id);
  if (!existing) return { ok: false, reason: 'not_found' };
  if (existing.balance == null) return { ok: false, reason: 'no_balance' };

  let coupon: Coupon;
  try {
    const result = await ddb.send(new UpdateCommand({
      TableName: COUPONS_TABLE,
      Key: { coupon_id: id },
      // Aliased because `balance` may collide with DynamoDB's reserved words.
      UpdateExpression: 'SET #bal = #bal - :amt',
      ConditionExpression: 'attribute_exists(coupon_id) AND #bal >= :amt',
      ExpressionAttributeNames: { '#bal': 'balance' },
      ExpressionAttributeValues: { ':amt': amount },
      ReturnValues: 'ALL_NEW',
    }));
    coupon = result.Attributes as Coupon;
  } catch (err: any) {
    // Someone else drained it first (or it never had enough) - the caller
    // reports this rather than silently overdrawing.
    if (err?.name === 'ConditionalCheckFailedException') return { ok: false, reason: 'insufficient' };
    throw err;
  }

  // Draining the balance completes the redemption. Safe as a follow-up write:
  // the balance is now 0, so any concurrent decrement fails its condition.
  if (coupon.balance === 0 && coupon.status !== 'used') {
    const marked = await markCouponUsed(id);
    return { ok: true, coupon: marked ?? coupon };
  }
  return { ok: true, coupon };
}

// Full redemption - zeroes a tracked balance and flips status. Idempotent, so
// a repeat call is harmless (callers guard the notification separately).
export async function markCouponUsed(id: string): Promise<Coupon | null> {
  const existing = await getCouponById(id);
  if (!existing) return null;
  const hasBalance = existing.balance != null;

  const result = await ddb.send(new UpdateCommand({
    TableName: COUPONS_TABLE,
    Key: { coupon_id: id },
    UpdateExpression: hasBalance ? 'SET #st = :used, #bal = :zero' : 'SET #st = :used',
    ExpressionAttributeNames: hasBalance
      ? { '#st': 'status', '#bal': 'balance' }
      : { '#st': 'status' },
    ExpressionAttributeValues: hasBalance
      ? { ':used': 'used', ':zero': 0 }
      : { ':used': 'used' },
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
