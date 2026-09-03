import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { getCouponCode, getCouponImage } from '../storage/couponStorage';
import { shareToGroup, rescueCode, type ShareResult } from './api';
import { startShareSession, type SendSignal } from './webrtc';

// What a group member will actually be able to use after this coupon is shared.
//
// A coupon carries its value in one of three places, and only two of them
// survive a share today:
//   - text code  -> delivered P2P (or via the encrypted server fallback)
//   - gift-card URL -> plain metadata, already synced to the server
//   - barcode/QR image -> delivered P2P only, to members who are online now
//
// Codes and images live solely on the device that created them, so a coupon
// added on another device (or after a reinstall/storage wipe) has metadata
// here but nothing to send. Without this check the share silently "succeeds"
// and the recipient opens an empty coupon.
export interface ShareableInfo {
  /** The local text code, if this device has one. */
  code: string | null;
  /** True when a barcode/QR image exists locally. */
  hasImage: boolean;
  /** False when the recipient would receive nothing usable. */
  willBeUsable: boolean;
  /**
   * The image is the only thing of value here. Worth flagging separately
   * because an image has no offline fallback: unlike a code, it cannot be
   * parked encrypted on the server (it IS the barcode, so the invariant
   * forbids it), so offline members get nothing until a later re-share.
   */
  imageOnly: boolean;
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
    willBeUsable: !!code || !!giftcardUrl || !!image,
    imageOnly: !!image && !code && !giftcardUrl,
  };
}

// The confirmation to show before sharing, or null when the share needs no
// warning at all. One function rather than a boolean plus a message, so a
// caller cannot show the wrong text for the situation it is in.
export function shareWarning(info: ShareableInfo): string | null {
  if (!info.willBeUsable) {
    return "This coupon's code isn't stored on this device, so members will see its details but no usable code. Codes stay on the device where the coupon was added.";
  }
  if (info.imageOnly) {
    // Not a defect to fix, but the one case where delivery is genuinely
    // partial - so the user is told before sharing rather than left to
    // discover it when a member says they got nothing.
    return "This coupon's value is its barcode image, which transfers device-to-device. Members who are offline right now won't receive it - share again when they're online.";
  }
  return null;
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

  // Encoded once for the whole group rather than per recipient - it is the
  // expensive part of the share, and every session sends identical bytes.
  const image = await encodeCouponImageForTransfer(couponId);

  if (code || image) {
    // Tolerate a server that predates online_recipient_ids: the share/update
    // itself already succeeded, so degrade to "no P2P targets" rather than
    // throwing and reporting a failure that didn't happen.
    (data.online_recipient_ids ?? []).forEach(uid =>
      startShareSession(sendSignal, uid, couponId, code, () => {
        // Last line of defence: P2P already failed, so if this also fails
        // the code reaches nobody. Log it - silently swallowing left the
        // loss untraceable.
        //
        // Only the code can be rescued. An image has no server-side fallback
        // by design (it is the barcode itself), so a failed negotiation loses
        // it until the next share - which is what shareWarning() warns about.
        if (!code) return;
        rescueCode(groupId, couponId, uid, code).catch(err =>
          console.warn('[share] rescue-code write failed for recipient', uid, err?.message ?? err)
        );
      }, image)
    );
  }
  return data;
}

// A barcode/QR needs enough horizontal resolution to stay scannable, so this
// is far larger than the ~256px used for avatars - but still bounded, because
// the encoded string is chunked across a data channel and then held in
// AsyncStorage on the receiving device.
const MAX_TRANSFER_WIDTH = 1000;
const TRANSFER_COMPRESS = 0.7;
const DATA_URL_PREFIX = 'data:image/jpeg;base64,';

/**
 * Reads this coupon's local barcode/QR image and returns it as bare base64
 * JPEG (no data: prefix), or null if there is none.
 *
 * Uses expo-image-manipulator, which is already a dependency - deliberately,
 * so this needs no addition to client/package.json (a high-conflict file).
 * Encoding failures resolve to null rather than throwing: a share that
 * delivers the code but not the image is far better than one that aborts.
 */
export async function encodeCouponImageForTransfer(couponId: string): Promise<string | null> {
  const uri = await getCouponImage(couponId);
  if (!uri) return null;

  // Already a received image: it was downscaled and encoded by whoever shared
  // it first, so re-encoding would only lose quality on every hop.
  if (uri.startsWith(DATA_URL_PREFIX)) return uri.slice(DATA_URL_PREFIX.length);

  try {
    // Decode once purely to learn the real dimensions. Image.getSize was doing
    // this and failing silently on some local URIs - and a failed lookup meant
    // the resize was skipped entirely, pushing a full-resolution phone photo
    // down the data channel. ImageRef reports width directly off the decoded
    // image, so the downscale decision can no longer be quietly skipped.
    const source = await ImageManipulator.manipulate(uri).renderAsync();
    const ctx = ImageManipulator.manipulate(source);
    // Only ever downscale. Enlarging a small barcode adds bytes without
    // adding detail, and the transfer cost is paid per recipient.
    if (source.width > MAX_TRANSFER_WIDTH) ctx.resize({ width: MAX_TRANSFER_WIDTH });
    const ref = await ctx.renderAsync();
    const out = await ref.saveAsync({ compress: TRANSFER_COMPRESS, format: SaveFormat.JPEG, base64: true });
    if (!out.base64) throw new Error('image encode produced no base64');
    console.log(
      `[share] barcode image ${source.width}x${source.height} -> ${ref.width}x${ref.height},`,
      out.base64.length, 'b64 chars'
    );
    return out.base64;
  } catch (err: any) {
    console.warn('[share] could not encode barcode image', err?.message ?? err);
    return null;
  }
}
