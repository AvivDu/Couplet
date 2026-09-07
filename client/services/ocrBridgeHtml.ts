// The page that runs inside the hidden OCR WebView. Tesseract.js is a
// CPU/WASM-only OCR engine (no WebGPU dependency), which is why it can run
// here at all - MediaPipe's on-device LLM runtime was investigated first and
// ruled out because its web build hard-requires WebGPU, which neither
// Android WebView nor iOS WKWebView expose.
//
// Plain browser JS (not TypeScript, not bundled) - it is injected as a
// string. Avoid backticks and ${} in here so it survives being embedded in a
// template literal.
//
// Protocol
//   RN  -> page : window.__ocrBridge.handle(json) with { type: 'recognize', requestId, image, langs }
//                 image = base64 JPEG, no data: prefix. langs = e.g. 'eng+heb'.
//   page -> RN  : postMessage of { type: 'ready'|'started'|'result'|'error'|'log', ... }
//                 'started' = engine loaded, OCR pass beginning (RN re-arms on it)
//
// This is a plain request/response, unlike the WebRTC bridge's long-lived
// sessions - one photo in, one recognized-text (or error) out, no ongoing
// connection to manage.
//
// Tesseract.js itself, plus its WASM core and per-language trained-data
// files, load from its own CDN on first use and are cached by the WebView
// after that - generic library assets, unrelated to any photographed coupon.
// The photo and the recognized text never leave this page except back to RN.

export const OCR_BRIDGE_HTML = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <script src="https://cdn.jsdelivr.net/npm/tesseract.js@6.0.0/dist/tesseract.min.js"></script>
  </head>
  <body>
    <script>
      window.__ocrBridge = (function () {
        // Two phases with separate budgets, because on a first-ever scan the
        // download dominates and on every later scan it is ~free. Folding
        // both into one timer meant either killing a legitimate cold-start
        // download or giving a warm recognition an absurd leash. Each stays
        // below RN's corresponding watchdog (see ocr.ts) so the page is still
        // the side that reports the failure in normal operation.
        var INIT_TIMEOUT_MS = 90000;      // createWorker: CDN fetch + worker startup
        var RECOGNIZE_TIMEOUT_MS = 45000; // the OCR pass itself, worker already up

        function post(payload) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          }
        }
        function log(message) { post({ type: 'log', message: String(message) }); }

        function recognize(msg) {
          var requestId = msg.requestId;
          if (!window.Tesseract) {
            post({ type: 'error', requestId: requestId, message: 'Tesseract failed to load (no network on first use?)' });
            return;
          }

          var settled = false;
          var worker = null;
          var timer = null;

          function disposeWorker() {
            if (!worker) return;
            var w = worker;
            worker = null;
            try { w.terminate(); } catch (e) {}
          }

          // Every terminal path goes through here, so a late rejection after
          // a timeout cannot post a second message for the same request.
          function finish(payload) {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            disposeWorker();
            post(payload);
          }

          function arm(ms, reason) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () {
              finish({ type: 'error', requestId: requestId, message: reason });
            }, ms);
          }

          var dataUrl = 'data:image/jpeg;base64,' + msg.image;
          var langs = msg.langs || 'eng+heb';
          log('recognizing (' + langs + '), ' + msg.image.length + ' b64 chars');
          arm(INIT_TIMEOUT_MS, 'timed out loading the OCR engine');

          // v6 takes the language list in createWorker; the old
          // Tesseract.recognize(image, langs) convenience call is deprecated
          // and no longer honours a langs argument there.
          window.Tesseract.createWorker(langs)
            .then(function (w) {
              // Timed out while the engine was still loading - the request is
              // already reported, so just don't leak the worker.
              if (settled) { try { w.terminate(); } catch (e) {} return null; }
              worker = w;
              arm(RECOGNIZE_TIMEOUT_MS, 'recognition timed out');
              // Everything up to here was download + startup, which on a
              // first-ever scan is most of the wall time. Tell RN so it can
              // swap its own watchdog to the recognition-only budget.
              post({ type: 'started', requestId: requestId });
              return w.recognize(dataUrl);
            })
            .then(function (result) {
              if (!result || settled) return;
              var text = (result.data && result.data.text) || '';
              log('recognized ' + text.length + ' chars');
              finish({ type: 'result', requestId: requestId, text: text });
            })
            .catch(function (err) {
              finish({ type: 'error', requestId: requestId, message: String((err && err.message) || err) });
            });
        }

        function handle(raw) {
          var msg;
          try { msg = JSON.parse(raw); } catch (e) { return; }
          if (!msg || msg.type !== 'recognize') return;
          recognize(msg);
        }

        if (!window.Tesseract) {
          log('Tesseract script tag present but window.Tesseract not yet defined at page-ready time');
        }
        post({ type: 'ready' });

        return { handle: handle };
      })();
      true;
    </script>
  </body>
</html>`;
