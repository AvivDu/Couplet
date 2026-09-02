import React from 'react';
import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { WEBRTC_BRIDGE_HTML } from '../services/webrtcBridgeHtml';
import { setBridge, setBridgeReady, resetBridge, handleBridgeMessage } from '../services/webrtc';

// Hosts the hidden page that owns the real RTCPeerConnections (see
// services/webrtcBridgeHtml.ts). Mounted once at the app root so navigating
// between screens never tears down an in-flight transfer.
export default function WebRTCBridge() {
  const ref = React.useRef<WebView | null>(null);
  // Bumping the key forces a fresh WebView after a renderer crash.
  const [generation, setGeneration] = React.useState(0);

  React.useEffect(() => () => { setBridge(null); setBridgeReady(false); }, []);

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
      // baseUrl matters: it gives the inline page a real https origin, which
      // is what makes it a secure context (verified on-device — WebRTC is
      // unavailable from an opaque origin on some engines).
      source={{ html: WEBRTC_BRIDGE_HTML, baseUrl: 'https://localhost' }}
      // The page is self-contained and never navigates, so nothing beyond its
      // own origin should ever load. Coupon codes pass through this WebView;
      // keeping it sealed means a stray navigation can't carry one off-device.
      originWhitelist={['https://localhost']}
      onShouldStartLoadWithRequest={req => req.url.startsWith('https://localhost')}
      javaScriptEnabled
      domStorageEnabled
      // Required: without an onMessage handler react-native-webview does not
      // inject window.ReactNativeWebView, so the page could not talk back.
      onMessage={e => {
        // Fire-and-forget, but never let a rejection surface as an unhandled
        // promise (saveCouponCode touches AsyncStorage and can fail).
        handleBridgeMessage(e.nativeEvent.data).catch(err =>
          console.warn('[webrtc-bridge] message handling failed', err)
        );
      }}
      onContentProcessDidTerminate={remount}
      onRenderProcessGone={remount}
      onError={() => setBridgeReady(false)}
      // containerStyle is the one that matters: react-native-webview wraps
      // itself in a View hardcoded to flex:1, and `style` only reaches the
      // inner native view. Without this override that wrapper becomes a
      // flex sibling of the app content and eats half the screen.
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
