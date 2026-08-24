import { getCouponById, redeemCouponAmount, markCouponUsed, type Coupon } from '../repositories/coupons';
import { notifyCouponRecipients } from '../repositories/groups';
import { findUserById } from '../repositories/users';

// Shared by the owner route (POST /coupons/:id/redeem) and the group-member
// route (POST /groups/:id/coupons/:couponId/redeem) so both apply identical
// semantics and fire identical notifications; only the authorization differs.
export type RedeemAction = { kind: 'all' } | { kind: 'amount'; amount: number };

export type RedeemOutcome =
  | { status: 200; coupon: Coupon }
  | { status: 400 | 404 | 409; error: string };

// Wire format is `{ redeem_all: true }` or `{ amount: <number > 0> }` -
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

// What actually happened to the coupon, which drives the wording people see.
export type RedemptionEvent =
  | { kind: 'full' }
  | { kind: 'partial'; amount: number; remaining: number };

function money(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Wording has to answer, at a glance: which coupon, who, and is there any
// value left? A shared coupon being *finished* is the consequential case, so
// it says so plainly rather than "marked as used".
function redemptionMessage(actorName: string, storeName: string, event: RedemptionEvent) {
  if (event.kind === 'full') {
    return {
      type: 'coupon_used',
      title: `${storeName} coupon used up`,
      body: `${actorName} used the last of it, there is nothing left.`,
    };
  }
  return {
    type: 'coupon_partial_redeem',
    title: `${storeName} coupon partly used`,
    body: `${actorName} redeemed ₪${money(event.amount)}, there is ₪${money(event.remaining)} left.`,
  };
}

// Tells everyone who can see this coupon (once each, via any group) what just
// happened to it.
//
// Awaited by callers rather than fire-and-forget: on Lambda the execution
// environment freezes once the response returns, so work kicked off after
// res.json() may never run. Failures are logged, never surfaced - the
// redemption itself has already committed.
export async function notifyCouponRedeemed(
  coupon: Coupon,
  actorUserId: string,
  event: RedemptionEvent
): Promise<void> {
  try {
    const actor = await findUserById(actorUserId);
    const message = redemptionMessage(actor?.username ?? 'A member', coupon.store_name, event);
    await notifyCouponRecipients(coupon.coupon_id, actorUserId, message);
  } catch (err: any) {
    console.error('[coupon-redeemed] notifying recipients failed:', err?.stack ?? err);
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
    // markCouponUsed is unconditional, so without this an already-drained
    // coupon would report a successful redemption of nothing - the partial
    // path is protected by its balance condition, this one wasn't.
    if (wasAlreadyUsed) {
      return { status: 409, error: 'This coupon has already been fully used.' };
    }
    const marked = await markCouponUsed(couponId);
    if (!marked) return { status: 404, error: 'Coupon not found' };
    coupon = marked;
  } else {
    const result = await redeemCouponAmount(couponId, action.amount);
    if (!result.ok) {
      if (result.reason === 'not_found') return { status: 404, error: 'Coupon not found' };
      if (result.reason === 'no_balance') return { status: 400, error: 'This coupon has no balance to redeem' };
      return { status: 409, error: 'Not enough balance left - someone may have just redeemed it' };
    }
    coupon = result.coupon;
  }

  // A partial redeem that drains the balance is reported as 'full' - what
  // matters to everyone else is that the coupon is finished, not which button
  // finished it. wasAlreadyUsed stops a repeat call from re-notifying.
  if (coupon.status === 'used') {
    if (!wasAlreadyUsed) await notifyCouponRedeemed(coupon, actorUserId, { kind: 'full' });
  } else if (action.kind === 'amount') {
    await notifyCouponRedeemed(coupon, actorUserId, {
      kind: 'partial',
      amount: action.amount,
      remaining: coupon.balance ?? 0,
    });
  }

  return { status: 200, coupon };
}
