import { getCouponCode, getCouponImage } from '../storage/couponStorage';

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
  /** True when a barcode/QR image exists locally — it cannot be shared yet. */
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
