import { saveCouponCode, saveCouponImage } from '../storage/couponStorage';

// Stage 2 P2P coupon-code delivery, driven through a hidden WebView.
//
// Expo Go cannot load `react-native-webrtc` (a native module needing a custom
// dev client), but WebView engines ship a full WebRTC stack — so the actual
// RTCPeerConnection lives in the page in `webrtcBridgeHtml.ts` and this module
// drives it. The server relays only opaque SDP/ICE; the coupon code travels
// solely over the data channel.
//
// This module's exported surface is deliberately identical to the earlier
// native implementation, so NotificationsContext and the share call sites are
// unaffected by the swap.
//
// No TURN server is available, so negotiation can fail behind restrictive
// NATs; callers pass an onFailure that falls back to the server-side
// rescue-code endpoint.

export type SendSignal = (payload: Record<string, unknown>) => void;

// Minimal surface we need from the WebView instance, so this module doesn't
// depend on react-native-webview's types (it stays a plain service module).
export interface BridgeHandle {
  injectJavaScript: (script: string) => void;
}

interface SessionCallbacks {
  sendSignal: SendSignal;
  peerId: string;
  onFailure?: () => void;
  onReceived?: () => void;
  watchdog?: ReturnType<typeof setTimeout>;
}

// Longer than the page's own 15s negotiation timeout, so in normal operation
// the page always reports first and this never fires. It exists for the cases
// the page CANNOT report: commands still queued because the bridge never
// became ready, a silently dead renderer, or JS suspended by backgrounding.
// Without it a stalled session would never fail, so the rescue fallback would
// never run and the recipient would silently never receive the code.
const WATCHDOG_MS = 25000;

// A chunked image transfer legitimately outlives a bare handshake, so its
// sessions get a longer leash. Both values stay above the page's own timeout
// for that phase (15s negotiation / 30s transfer) so in normal operation the
// page still reports first and this stays a backstop.
const IMAGE_WATCHDOG_MS = 45000;

const sessions = new Map<string, SessionCallbacks>();

// Removes a session and disarms its watchdog. Returns it so callers can run
// whatever callback the terminal state calls for.
function clearSession(sessionId: string): SessionCallbacks | undefined {
  const cb = sessions.get(sessionId);
  if (cb?.watchdog) clearTimeout(cb.watchdog);
  sessions.delete(sessionId);
  return cb;
}

// Terminal failure for one session: tell the peer to stop waiting, then hand
// the caller its fallback (the encrypted rescue-code write).
function failSession(sessionId: string, reason: string) {
  const cb = clearSession(sessionId);
  if (!cb) return;
  console.log(`[p2p] session failed (${reason})`, cb.onFailure ? '— falling back to encrypted rescue code' : '');
  if (cb.peerId) {
    cb.sendSignal({ action: 'webrtc-cancel', session_id: sessionId, to_user_id: cb.peerId });
  }
  cb.onFailure?.();
}

let bridge: BridgeHandle | null = null;
let bridgeReady = false;
// Commands issued before the page finishes loading would be lost, so they are
// held here and flushed on the page's 'ready' message.
let queued: string[] = [];

function deliver(commandJson: string) {
  if (!bridge || !bridgeReady) {
    queued.push(commandJson);
    return;
  }
  // Double-encode: the inner JSON.stringify produces the payload, the outer
  // one turns it into a correctly escaped JS string literal. Interpolating the
  // payload directly would let a coupon code containing a quote or backslash
  // break out of the script.
  bridge.injectJavaScript(`window.__bridge.handle(${JSON.stringify(commandJson)}); true;`);
}

function send(command: Record<string, unknown>) {
  deliver(JSON.stringify(command));
}

// --- wiring called by the hosting WebView component ---------------------

export function setBridge(handle: BridgeHandle | null) {
  bridge = handle;
}

export function setBridgeReady(ready: boolean) {
  bridgeReady = ready;
  if (!ready) return;
  const pending = queued;
  queued = [];
  pending.forEach(deliver);
}

// The WebView's renderer process died: every in-flight peer connection died
// with it. Fail the sharer-side sessions so they take the rescue path rather
// than hanging until their (now unreachable) timeouts.
export function resetBridge() {
  bridgeReady = false;
  queued = [];
  Array.from(sessions.keys()).forEach(id => failSession(id, 'bridge reset'));
}

// Messages coming back out of the WebView page.
export async function handleBridgeMessage(raw: string): Promise<void> {
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return; }

  switch (msg.type) {
    case 'ready':
      setBridgeReady(true);
      return;

    case 'signal': {
      // Page produced an SDP/ICE frame — hand it to the socket. Never contains
      // the coupon code.
      const cb = sessions.get(msg.sessionId);
      cb?.sendSignal({
        action: msg.action,
        session_id: msg.sessionId,
        to_user_id: msg.toUserId,
        ...(msg.sdp ? { sdp: msg.sdp } : {}),
        ...(msg.candidate ? { candidate: msg.candidate } : {}),
      });
      return;
    }

    case 'received': {
      // An image-only coupon arrives with no code, so neither field alone is
      // required — only that at least one of them is present.
      if (!msg.couponId || (!msg.code && !msg.image)) return;
      // Persist BEFORE acking. If this throws, no ack goes out, the sharer's
      // negotiation times out, and the code is stored via the rescue path —
      // which is what we want. Acking first would settle the sharer against a
      // write that never landed.
      if (msg.code) await saveCouponCode(msg.couponId, msg.code);
      if (msg.image) {
        // Stored as a data URL rather than a file: AsyncStorage is the only
        // store this app has (no expo-file-system), and <Image source={{uri}}>
        // renders a data URL identically to the file:// URI a locally-added
        // coupon holds — so every read path works unchanged.
        await saveCouponImage(msg.couponId, `data:image/jpeg;base64,${msg.image}`);
      }
      console.log(
        '[p2p] saved locally for coupon', msg.couponId,
        `(code: ${!!msg.code}, image: ${!!msg.image}) — never touched the server`
      );
      send({ type: 'ack', sessionId: msg.sessionId });
      const cb = clearSession(msg.sessionId);
      cb?.onReceived?.();
      return;
    }

    case 'transferring': {
      // Recipient side: the page has read a header announcing an inbound
      // image. This watchdog was sized for a handshake, so extend it to the
      // transfer budget - otherwise it reclaims the session before the image
      // lands, and the 'received' that follows has no onReceived left to
      // refresh the screen with. Reclaiming (not failing) is still the right
      // expiry here: only the sharer holds the code, so only the sharer can
      // trigger the rescue write.
      const cb = sessions.get(msg.sessionId);
      if (!cb) return;
      if (cb.watchdog) clearTimeout(cb.watchdog);
      cb.watchdog = setTimeout(() => clearSession(msg.sessionId), IMAGE_WATCHDOG_MS);
      return;
    }

    case 'delivered':
    case 'closed':
      clearSession(msg.sessionId);
      return;

    case 'failed':
      failSession(msg.sessionId, 'peer connection failed');
      return;

    case 'log':
      // WebView console output doesn't reach Metro, so the page routes it here.
      console.log('[webrtc-bridge]', msg.message);
      return;
  }
}

// --- public API (unchanged from the native implementation) --------------

export async function startShareSession(
  sendSignal: SendSignal,
  toUserId: string,
  couponId: string,
  code: string | null,
  onFailure: () => void,
  // Base64 JPEG (no data: prefix) of the coupon's barcode/QR, when this device
  // has one. Travels the same data channel as the code and for the same
  // reason: an image of a barcode IS the coupon code, so it must never be
  // relayed through the server.
  image?: string | null
): Promise<void> {
  const sessionId = `${couponId}:${toUserId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  console.log('[p2p] opening P2P session to', toUserId, 'for coupon', couponId, image ? '(with image)' : '');
  sessions.set(sessionId, {
    sendSignal,
    peerId: toUserId,
    onFailure,
    watchdog: setTimeout(
      () => failSession(sessionId, 'bridge never reported back'),
      image ? IMAGE_WATCHDOG_MS : WATCHDOG_MS
    ),
  });
  send({ type: 'start', sessionId, toUserId, couponId, code, image: image ?? null });
}

export async function handleOffer(
  sendSignal: SendSignal,
  msg: { session_id: string; from_user_id: string; sdp: any },
  onReceived: () => void
): Promise<void> {
  // No onFailure here: only the sharer holds the code, so only the sharer can
  // fall back to the rescue write. The watchdog just reclaims the map entry.
  sessions.set(msg.session_id, {
    sendSignal,
    peerId: msg.from_user_id,
    onReceived,
    watchdog: setTimeout(() => clearSession(msg.session_id), WATCHDOG_MS),
  });
  send({ type: 'offer', sessionId: msg.session_id, fromUserId: msg.from_user_id, sdp: msg.sdp });
}

export async function handleAnswer(msg: { session_id: string; sdp: any }): Promise<void> {
  send({ type: 'answer', sessionId: msg.session_id, sdp: msg.sdp });
}

export async function handleIceCandidate(msg: { session_id: string; candidate: any }): Promise<void> {
  send({ type: 'ice', sessionId: msg.session_id, candidate: msg.candidate });
}

// Peer gave up on this negotiation (see failSession, which emits it). Tear the
// local half down immediately instead of holding a dead RTCPeerConnection
// until its own timeout expires.
export function handleCancel(msg: { session_id: string }): void {
  clearSession(msg.session_id);
  send({ type: 'cancel', sessionId: msg.session_id });
}
