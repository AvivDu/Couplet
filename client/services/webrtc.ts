import { saveCouponCode } from '../storage/couponStorage';

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
  onFailure?: () => void;
  onReceived?: () => void;
}

const sessions = new Map<string, SessionCallbacks>();

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
  const inFlight = Array.from(sessions.values());
  sessions.clear();
  inFlight.forEach(cb => cb.onFailure?.());
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
      const cb = sessions.get(msg.sessionId);
      if (msg.couponId && msg.code) {
        await saveCouponCode(msg.couponId, msg.code);
        console.log('[p2p] code saved locally for coupon', msg.couponId, '(never touched the server)');
        cb?.onReceived?.();
      }
      sessions.delete(msg.sessionId);
      return;
    }

    case 'delivered':
    case 'closed':
      sessions.delete(msg.sessionId);
      return;

    case 'failed': {
      console.log('[p2p] session failed, falling back to encrypted rescue code');
      const cb = sessions.get(msg.sessionId);
      sessions.delete(msg.sessionId);
      cb?.onFailure?.();
      return;
    }

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
  code: string,
  onFailure: () => void
): Promise<void> {
  const sessionId = `${couponId}:${toUserId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  console.log('[p2p] opening P2P session to', toUserId, 'for coupon', couponId);
  sessions.set(sessionId, { sendSignal, onFailure });
  send({ type: 'start', sessionId, toUserId, couponId, code });
}

export async function handleOffer(
  sendSignal: SendSignal,
  msg: { session_id: string; from_user_id: string; sdp: any },
  onReceived: () => void
): Promise<void> {
  sessions.set(msg.session_id, { sendSignal, onReceived });
  send({ type: 'offer', sessionId: msg.session_id, fromUserId: msg.from_user_id, sdp: msg.sdp });
}

export async function handleAnswer(msg: { session_id: string; sdp: any }): Promise<void> {
  send({ type: 'answer', sessionId: msg.session_id, sdp: msg.sdp });
}

export async function handleIceCandidate(msg: { session_id: string; candidate: any }): Promise<void> {
  send({ type: 'ice', sessionId: msg.session_id, candidate: msg.candidate });
}

export function handleCancel(msg: { session_id: string }): void {
  sessions.delete(msg.session_id);
  send({ type: 'cancel', sessionId: msg.session_id });
}
