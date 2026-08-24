import { getCouponById, redeemCouponAmount, markCouponUsed, type Coupon } from '../repositories/coupons';
import { notifyGroupsCouponUsed } from '../repositories/groups';
import { findUserById } from '../repositories/users';

// Shared by the owner route (POST /coupons/:id/redeem) and the group-member
// route (POST /groups/:id/coupons/:couponId/redeem) so both apply identical
// semantics and fire identical notifications; only the authorization differs.
export type RedeemAction = { kind: 'all' } | { kind: 'amount'; amount: number };

export type RedeemOutcome =
  | { status: 200; coupon: Coupon }
  | { status: 400 | 404 | 409; error: string };

// Wire format is `{ redeem_all: true }` or `{ amount: <number > 0> }` —
// deliberately an amount, never an absolute balance. See redeemCouponAmount.
export function parseRedeemAction(body: any): RedeemAction | { error: string } {
  const { redeem_all, amount } = body ?? {};
  if (redeem_all === true) return { kind: 'all' };
  if (amount !== undefined) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return { error: 'amount must be a number greater than 0' };
    }
    return { kind: 'amount', amount };
  }
  return { error: 'Provide redeem_all: true or a positive amount' };
}

// Notifies every group the coupon is shared to (minus the actor) on a genuine
// transition into 'used'. The wasAlreadyUsed guard stops a repeat call
// (double-tap, client retry) from re-notifying everyone.
//
// Awaited by callers rather than fire-and-forget: on Lambda the execution
// environment freezes once the response returns, so work kicked off after
// res.json() may never run. Failures are logged, never surfaced — the
// redemption itself has already committed.
export async function notifyIfNewlyUsed(
  coupon: Coupon,
  wasAlreadyUsed: boolean,
  actorUserId: string
): Promise<void> {
  if (coupon.status !== 'used' || wasAlreadyUsed) return;
  try {
    const actor = await findUserById(actorUserId);
    await notifyGroupsCouponUsed(coupon.coupon_id, actorUserId, actor?.username ?? 'A member', coupon.store_name);
  } catch (err: any) {
    console.error('[coupon-used] notifying groups failed:', err?.stack ?? err);
  }
}

export async function applyRedemption(
  couponId: string,
  actorUserId: string,
  action: RedeemAction
): Promise<RedeemOutcome> {
  const before = await getCouponById(couponId);
  if (!before) return { status: 404, error: 'Coupon not found' };
  const wasAlreadyUsed = before.status === 'used';

  let coupon: Coupon;
  if (action.kind === 'all') {
    const marked = await markCouponUsed(couponId);
    if (!marked) return { status: 404, error: 'Coupon not found' };
    coupon = marked;
  } else {
    const result = await redeemCouponAmount(couponId, action.amount);
    if (!result.ok) {
      if (result.reason === 'not_found') return { status: 404, error: 'Coupon not found' };
      if (result.reason === 'no_balance') return { status: 400, error: 'This coupon has no balance to redeem' };
      return { status: 409, error: 'Not enough balance left — someone may have just redeemed it' };
    }
    coupon = result.coupon;
  }

  await notifyIfNewlyUsed(coupon, wasAlreadyUsed, actorUserId);
  return { status: 200, coupon };
}
