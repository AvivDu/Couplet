import { getCouponCode, getCouponImage } from '../storage/couponStorage';
import { shareToGroup, rescueCode, type ShareResult } from './api';
import { startShareSession, type SendSignal } from './webrtc';

// What a group member will actually be able to use after this coupon is shared.
//
// A coupon carries its value in one of three places, and only two of them
// survive a share today:
//   - text code  -> delivered P2P (or via the encrypted server fallback)
//   - gift-card URL -> plain metadata, already synced to the server
//   - barcode/QR image -> local file:// only, NOT transferred yet
//
// Codes and images live solely on the device that created them, so a coupon
// added on another device (or after a reinstall/storage wipe) has metadata
// here but nothing to send. Without this check the share silently "succeeds"
// and the recipient opens an empty coupon.
export interface ShareableInfo {
  /** The local text code, if this device has one. */
  code: string | null;
  /** True when a barcode/QR image exists locally - it cannot be shared yet. */
  hasImage: boolean;
  /** False when the recipient would receive nothing usable. */
  willBeUsable: boolean;
}

export async function inspectShareable(
  couponId: string,
  giftcardUrl?: string | null
): Promise<ShareableInfo> {
  const [code, image] = await Promise.all([
    getCouponCode(couponId),
    getCouponImage(couponId),
  ]);
  return {
    code,
    hasImage: !!image,
    willBeUsable: !!code || !!giftcardUrl,
  };
}

// Explains, in the user's terms, why a share won't carry anything usable.
// The two causes need different messages because the user's remedy differs:
// an image is a known product limitation, a missing code is a "you're on the
// wrong device" problem they can actually act on.
export function unusableShareMessage(info: ShareableInfo): string {
  return info.hasImage
    ? "This coupon's barcode image can't be shared yet, so members will see its details but nothing they can scan."
    : "This coupon's code isn't stored on this device, so members will see its details but no usable code. Codes stay on the device where the coupon was added.";
}

// Pushes a coupon's code to every member of one group - the online/offline
// branching (P2P vs. encrypted server fallback, with a rescue-code write if
// P2P fails) is identical whether this is a first share or a later
// redelivery of an edited code, so both call sites share this rather than
// duplicating the branching logic.
export async function deliverCouponCode(
  sendSignal: SendSignal,
  groupId: string,
  couponId: string,
  code: string | null,
  opts?: { codeUpdated?: boolean }
): Promise<ShareResult> {
  const { data } = await shareToGroup(groupId, couponId, code, opts?.codeUpdated);
  if (code) {
    // Tolerate a server that predates online_recipient_ids: the share/update
    // itself already succeeded, so degrade to "no P2P targets" rather than
    // throwing and reporting a failure that didn't happen.
    (data.online_recipient_ids ?? []).forEach(uid =>
      startShareSession(sendSignal, uid, couponId, code, () => {
        // Last line of defence: P2P already failed, so if this also fails
        // the code reaches nobody. Log it - silently swallowing left the
        // loss untraceable.
        rescueCode(groupId, couponId, uid, code).catch(err =>
          console.warn('[share] rescue-code write failed for recipient', uid, err?.message ?? err)
        );
      })
    );
  }
  return data;
}
