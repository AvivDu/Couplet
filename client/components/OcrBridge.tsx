import React from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { OCR_BRIDGE_HTML } from '../services/ocrBridgeHtml';
import { setBridge, setBridgeReady, resetBridge, handleBridgeMessage } from '../services/ocr';

// Hosts the hidden page that runs Tesseract.js OCR (see services/ocrBridgeHtml.ts).
//
// Deliberately NOT mounted at the app root like WebRTCBridge. OCR isn't
// needed on standby the way WebRTC signaling is (a P2P share can arrive at
// any time; a photo scan only happens when the user asks for one) - so the
// Add Coupon screen mounts this only for the duration of an active scan and
// unmounts it immediately after. That bounds how long two hidden WebViews
// are ever alive at once to the length of one scan, rather than the whole
// app lifetime.
//
// Otherwise a deliberate structural mirror of WebRTCBridge: own ref, own
// crash-remount, own 1x1 sizing, own origin lock. The two bridges share no
// module state (ocr.ts never imports webrtc.ts or vice versa) and each
// WebView's onMessage only ever reaches its own instance's handler, so
// running both at once - if a P2P transfer happens to land mid-scan - cannot
// cross-talk between them; the only real interaction is both doing real work
// on the same device at the same time.
export default function OcrBridge() {
  const ref = React.useRef<WebView | null>(null);
  // Bumping the key forces a fresh WebView after a renderer crash.
  const [generation, setGeneration] = React.useState(0);

  // resetBridge, not just setBridgeReady(false): unmount is this bridge's
  // NORMAL path (one scan, then gone), unlike WebRTCBridge which lives for
  // the whole app. Clearing readiness alone would strand any still-queued
  // command, and the next scan's page would flush it on 'ready' - burning a
  // full OCR pass on the previous photo, with a requestId nothing is
  // waiting for any more.
  React.useEffect(() => () => { resetBridge(); setBridge(null); }, []);

  const remount = React.useCallback(() => {
    resetBridge();
    setGeneration(g => g + 1);
  }, []);

  return (
    <WebView
      key={generation}
      ref={instance => {
        ref.current = instance;
        setBridge(instance);
      }}
      // baseUrl gives the inline page a real https origin. Loading
      // Tesseract's CDN script (an https:// subresource) from an https://
      // page is not mixed content, so this stays a secure context throughout.
      source={{ html: OCR_BRIDGE_HTML, baseUrl: 'https://localhost' }}
      // The page never intentionally navigates. This blocks it from ever
      // being redirected away from its own origin - it does not block the
      // Tesseract <script> subresource load, which is a fetch, not a
      // navigation (the WebRTC bridge's STUN/ICE traffic passes the same
      // kind of lock for the same reason).
      originWhitelist={['https://localhost']}
      onShouldStartLoadWithRequest={req => req.url.startsWith('https://localhost')}
      javaScriptEnabled
      domStorageEnabled
      // Required: without an onMessage handler react-native-webview does not
      // inject window.ReactNativeWebView, so the page could not talk back.
      onMessage={e => handleBridgeMessage(e.nativeEvent.data)}
      onContentProcessDidTerminate={remount}
      onRenderProcessGone={remount}
      onError={() => setBridgeReady(false)}
      // containerStyle is the one that matters: react-native-webview wraps
      // itself in a View hardcoded to flex:1, and `style` only reaches the
      // inner native view.
      containerStyle={styles.hiddenContainer}
      style={styles.hiddenWebView}
    />
  );
}

const styles = StyleSheet.create({
  // Absolute + offscreen takes it out of flex flow entirely (and out of reach
  // of touches). 1x1 rather than 0x0: some Android versions skip initializing
  // the renderer for a genuinely zero-sized WebView, killing the bridge.
  hiddenContainer: {
    position: 'absolute',
    flex: 0,
    width: 1,
    height: 1,
    top: -10,
    left: -10,
    opacity: 0,
    overflow: 'hidden',
  },
  hiddenWebView: { flex: 0, width: 1, height: 1, backgroundColor: 'transparent' },
});
