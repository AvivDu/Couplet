// On-device OCR for a photographed coupon, driven through a hidden WebView -
// same trick as services/webrtc.ts (Expo Go can't load a native OCR module,
// but a WebView engine can run Tesseract.js), but a fully separate bridge and
// module. This never imports from or shares state with webrtc.ts: that
// module is a hard singleton (one `bridge`, one `queued` array, one sessions
// map) built assuming exactly one WebView exists, so a second bridge needs
// its own copy of the same shape rather than trying to parameterize it.
//
// Unlike the WebRTC bridge, this one is not mounted at the app root - the
// hosting <OcrBridge /> (components/OcrBridge.tsx) is mounted only for the
// duration of an active scan, by the Add Coupon screen. Recognition is a
// plain request/response (one photo in, one text-or-error out), not a
// long-lived session, so there is no persistent connection to keep alive
// between scans.

export interface BridgeHandle {
  injectJavaScript: (script: string) => void;
}

interface PendingRequest {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
  watchdog: ReturnType<typeof setTimeout>;
}

// Both sit above the page's own budget for the matching phase (90s init /
// 45s recognition, see ocrBridgeHtml.ts) so in normal operation the page
// always reports first. These exist only for what the page cannot report
// itself: a command still queued because the bridge never became ready, a
// silently dead renderer, or JS suspended by backgrounding.
//
// Split in two for the same reason the page splits its own: this one starts
// counting before the page has even loaded, so a single budget tight enough
// to be useful for recognition would fire during a first-ever scan's CDN
// download - reporting a hang that was really just a slow connection.
const INIT_WATCHDOG_MS = 120000;
const RECOGNIZE_WATCHDOG_MS = 60000;

let bridge: BridgeHandle | null = null;
let bridgeReady = false;
// Commands issued before the page finishes loading (and, on a first-ever
// scan, before Tesseract's own assets finish downloading) would be lost
// otherwise - held here and flushed on the page's 'ready' message.
let queued: string[] = [];
const pending = new Map<string, PendingRequest>();

function deliver(commandJson: string) {
  if (!bridge || !bridgeReady) {
    queued.push(commandJson);
    return;
  }
  // Double-encode, same reason as the WebRTC bridge: the outer JSON.stringify
  // turns the payload into a correctly escaped JS string literal so nothing
  // in the image data can break out of the injected script.
  bridge.injectJavaScript(`window.__ocrBridge.handle(${JSON.stringify(commandJson)}); true;`);
}

function failPending(requestId: string, reason: string) {
  const p = pending.get(requestId);
  if (!p) return;
  clearTimeout(p.watchdog);
  pending.delete(requestId);
  p.reject(new Error(reason));
}

// --- wiring called by the hosting WebView component ---------------------

export function setBridge(handle: BridgeHandle | null) {
  bridge = handle;
}

export function setBridgeReady(ready: boolean) {
  bridgeReady = ready;
  if (!ready) return;
  const toSend = queued;
  queued = [];
  toSend.forEach(deliver);
}

// The WebView's renderer process died: any pending recognition died with it.
// Reject immediately rather than waiting out its watchdog.
export function resetBridge() {
  bridgeReady = false;
  queued = [];
  Array.from(pending.keys()).forEach(id => failPending(id, 'bridge reset'));
}

// Messages coming back out of the WebView page. Synchronous, unlike
// webrtc.ts's handler - resolving/rejecting a pending promise needs no
// AsyncStorage write in between.
export function handleBridgeMessage(raw: string): void {
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return; }

  switch (msg.type) {
    case 'ready':
      setBridgeReady(true);
      return;

    case 'started': {
      // Engine is up; what remains is the OCR pass itself. Swap the
      // cold-start leash for the tighter recognition one, so a genuine hang
      // after this point isn't sitting behind a two-minute timeout.
      const p = pending.get(msg.requestId);
      if (!p) return;
      clearTimeout(p.watchdog);
      p.watchdog = setTimeout(
        () => failPending(msg.requestId, 'bridge never reported back'),
        RECOGNIZE_WATCHDOG_MS
      );
      return;
    }

    case 'result': {
      const p = pending.get(msg.requestId);
      if (!p) return;
      clearTimeout(p.watchdog);
      pending.delete(msg.requestId);
      p.resolve(msg.text ?? '');
      return;
    }

    case 'error':
      failPending(msg.requestId, msg.message ?? 'recognition failed');
      return;

    case 'log':
      // WebView console output doesn't reach Metro, so the page routes it here.
      console.log('[ocr-bridge]', msg.message);
      return;
  }
}

// --- public API -----------------------------------------------------------

// Recognizes text in a base64 JPEG (no data: prefix). Resolves with an empty
// string - never null or undefined - when Tesseract found nothing; callers
// already treat "no fields extracted" as a normal outcome, same as Quick
// Add's paste-and-analyze.
export function recognizeText(imageBase64: string, langs = 'eng+heb'): Promise<string> {
  const requestId = `ocr:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    pending.set(requestId, {
      resolve,
      reject,
      watchdog: setTimeout(() => failPending(requestId, 'bridge never reported back'), INIT_WATCHDOG_MS),
    });
    deliver(JSON.stringify({ type: 'recognize', requestId, image: imageBase64, langs }));
  });
}
