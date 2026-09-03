// The page that runs inside the hidden WebView. This is where the actual
// WebRTC peer connections live — Expo Go can't load `react-native-webrtc`,
// but every WebView engine ships a full WebRTC stack, so the peer connection
// runs here and React Native drives it over a postMessage bridge.
//
// Plain browser JS (not TypeScript, not bundled) — it is injected as a string.
// Avoid backticks and ${} in here so it survives being embedded in a template
// literal.
//
// Protocol
//   RN  -> page : window.__bridge.handle(json) with { type: 'start'|'offer'|'answer'|'ice'|'cancel', ... }
//   page -> RN  : postMessage of { type: 'ready'|'signal'|'received'|'transferring'|'failed'|'delivered'|'log', ... }
//
// The coupon code only ever exists inside this page and on the data channel —
// it is never handed to the signaling messages, which carry SDP/ICE only. The
// same is true of the barcode/QR image: it is a coupon code in visual form, so
// it takes the identical path and never reaches the server.
//
// Data-channel framing (all JSON, in this order):
//   header  { coupon_id, code, has_image }   code may be null for image-only coupons
//   chunk   { img, i }                        base64 slice + its index, has_image only
//   trailer { img_end: true, n }              n = chunk count, for completeness checking
//   ack     { ack: true }                     recipient -> sharer, after RN has persisted

export const WEBRTC_BRIDGE_HTML = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>
    <script>
      window.__bridge = (function () {
        var ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
        var NEGOTIATION_TIMEOUT_MS = 15000;
        // Once the channel is open, negotiation is done and what remains is
        // bulk transfer, which legitimately takes longer than a handshake.
        // Re-armed to this on open so a slow image push is not killed by the
        // handshake budget. Must stay below RN's own watchdog (see webrtc.ts)
        // so the page is still the side that reports the failure.
        var TRANSFER_TIMEOUT_MS = 30000;
        // Chunk size for the base64 image. 16KB is the size every SCTP
        // implementation accepts without negotiation; the spec-guaranteed
        // floor is far below the 256KB some engines advertise, and exceeding
        // the peer's real limit kills the channel rather than erroring.
        var IMAGE_CHUNK = 16384;
        // Stop filling the send buffer past this and let SCTP drain. Without
        // backpressure, queueing every chunk in one synchronous loop overruns
        // the buffer and the channel closes mid-transfer.
        var BUFFER_HIGH = 262144;
        var PC = window.RTCPeerConnection || window.webkitRTCPeerConnection;

        var sessions = {};
        var orphanIce = {};

        function post(payload) {
          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          }
        }
        function log(message) { post({ type: 'log', message: String(message) }); }

        function cleanup(sid) {
          delete orphanIce[sid];
          var s = sessions[sid];
          if (!s) return;
          if (s.timer) clearTimeout(s.timer);
          try { if (s.pc) s.pc.close(); } catch (e) {}
          delete sessions[sid];
        }

        // Reports failure at most once per session, so a timeout racing a
        // 'failed' connection state cannot trigger two rescue requests.
        function fail(sid) {
          var s = sessions[sid];
          if (!s || s.settled) { cleanup(sid); return; }
          s.settled = true;
          cleanup(sid);
          post({ type: 'failed', sessionId: sid });
        }

        function settle(sid) {
          var s = sessions[sid];
          if (s) s.settled = true;
          cleanup(sid);
        }

        // Recipient-side expiry. The recipient never triggers the rescue path
        // (only the sharer holds the code), but RN still has to be told the
        // session is over or its callback entry would leak.
        function expire(sid) {
          cleanup(sid);
          post({ type: 'closed', sessionId: sid });
        }

        function makeSession(sid, pc, onTimeout) {
          var s = {
            pc: pc,
            // Recipient side only: kept so the ack can be sent once RN
            // confirms the code was persisted.
            channel: null,
            settled: false,
            remoteSet: false,
            // Sharer side only: an answer is being (or has been) applied —
            // set synchronously to reject duplicate answers from a recipient
            // signed in on multiple devices.
            answering: false,
            pending: [],
            // Recipient side only: the header's fields, held until the image
            // finishes arriving so code and image are handed to RN together
            // (RN persists both before acking - see ack() below).
            couponId: null,
            code: null,
            imgParts: null,
            // Sharer side only: true from the moment image chunks start
            // flowing until the trailer is queued. An ack arriving while this
            // is set means the peer settled without the image (see the ack
            // handler in start()).
            imagePending: false,
            onTimeout: onTimeout,
            timer: setTimeout(function () { onTimeout(sid); }, NEGOTIATION_TIMEOUT_MS)
          };
          sessions[sid] = s;
          return s;
        }

        // Replace a session's deadline without changing what expiry means for
        // that side (sharer fails and triggers rescue, recipient just closes).
        function rearm(sid, ms) {
          var s = sessions[sid];
          if (!s) return;
          if (s.timer) clearTimeout(s.timer);
          s.timer = setTimeout(function () { s.onTimeout(sid); }, ms);
        }

        // ICE can arrive before the session exists, and before the remote
        // description is applied; addIceCandidate rejects in both cases, so
        // candidates are held and flushed once the description lands.
        function flushIce(sid) {
          var s = sessions[sid];
          if (!s) return;
          s.remoteSet = true;
          var queued = s.pending.concat(orphanIce[sid] || []);
          s.pending = [];
          delete orphanIce[sid];
          for (var i = 0; i < queued.length; i++) {
            (function (cand) {
              try {
                s.pc.addIceCandidate(new RTCIceCandidate(cand)).catch(function () {});
              } catch (e) {}
            })(queued[i]);
          }
        }

        function wireIceOut(sid, pc, peerId) {
          pc.onicecandidate = function (e) {
            if (e.candidate) {
              post({
                type: 'signal',
                action: 'webrtc-ice-candidate',
                sessionId: sid,
                toUserId: peerId,
                candidate: e.candidate
              });
            }
          };
        }

        // Sharer: stream the base64 image out in chunks, pausing whenever the
        // send buffer fills. Written as a self-rescheduling pump rather than a
        // plain loop because bufferedAmount only drains between turns of the
        // event loop - a synchronous for-loop would never see it go down.
        function sendImage(sid, dc, b64) {
          var total = Math.ceil(b64.length / IMAGE_CHUNK);
          var i = 0;
          log('sharer: sending image, ' + b64.length + ' b64 chars in ' + total + ' chunks');
          var marked = sessions[sid];
          if (marked) marked.imagePending = true;
          function pump() {
            var s = sessions[sid];
            // Session gone (settled, cancelled, or failed) or channel closed:
            // stop pumping. Whatever ended it has already reported.
            if (!s || s.settled || dc.readyState !== 'open') return;
            while (i < total && dc.bufferedAmount < BUFFER_HIGH) {
              try {
                dc.send(JSON.stringify({ img: b64.substr(i * IMAGE_CHUNK, IMAGE_CHUNK), i: i }));
              } catch (err) {
                // A send that throws means the channel is unusable; let the
                // session time out into the rescue path rather than looping.
                log('sharer: image chunk ' + i + ' failed: ' + err);
                return;
              }
              i++;
            }
            if (i < total) { setTimeout(pump, 50); return; }
            try {
              dc.send(JSON.stringify({ img_end: true, n: total }));
              s.imagePending = false;
              log('sharer: image fully queued');
            } catch (err) { log('sharer: image trailer failed: ' + err); }
          }
          pump();
        }

        // Sharer: open the channel and push the code (and image) down it.
        function start(msg) {
          var sid = msg.sessionId;
          try {
            var pc = new PC({ iceServers: ICE_SERVERS });
            makeSession(sid, pc, fail);
            wireIceOut(sid, pc, msg.toUserId);

            pc.onconnectionstatechange = function () {
              if (pc.connectionState === 'failed') fail(sid);
            };

            log('sharer: negotiating with ' + msg.toUserId);
            pc.oniceconnectionstatechange = function () {
              log('sharer: ice state -> ' + pc.iceConnectionState);
            };

            var dc = pc.createDataChannel('coupon');
            dc.onopen = function () {
              // Do not close here: closing right after send can discard data
              // still buffered by SCTP. The recipient's ack is what confirms
              // delivery and tears the session down.
              log('sharer: data channel OPEN, sending header');
              dc.send(JSON.stringify({
                coupon_id: msg.couponId,
                code: msg.code || null,
                has_image: !!msg.image
              }));
              if (msg.image) {
                rearm(sid, TRANSFER_TIMEOUT_MS);
                sendImage(sid, dc, msg.image);
              }
            };
            dc.onmessage = function (e) {
              try {
                var parsed = JSON.parse(e.data);
                if (parsed && parsed.ack) {
                  var cur = sessions[sid];
                  if (cur && cur.imagePending) {
                    // The recipient acked while chunks were still going out.
                    // Nothing in this protocol does that - a peer that
                    // understands has_image waits for img_end - so this means
                    // the other device is running an older bundle that acks
                    // straight off the header. Settling here would abort the
                    // pump and lose the image while reporting success, so say
                    // so loudly instead of failing silently.
                    log('sharer: WARNING - ACK arrived mid-image. Peer is on an old build; image NOT delivered.');
                  }
                  log('sharer: ACK received - P2P transfer confirmed');
                  settle(sid);
                  post({ type: 'delivered', sessionId: sid });
                  try { dc.close(); } catch (err) {}
                }
              } catch (err) {}
            };

            pc.createOffer()
              .then(function (offer) {
                return pc.setLocalDescription(offer).then(function () { return offer; });
              })
              .then(function (offer) {
                post({
                  type: 'signal',
                  action: 'webrtc-offer',
                  sessionId: sid,
                  toUserId: msg.toUserId,
                  sdp: offer
                });
              })
              .catch(function (err) { log('start/offer failed: ' + err); fail(sid); });
          } catch (err) {
            log('start failed: ' + err);
            fail(sid);
          }
        }

        // Recipient: accept the offer, take the code off the channel, ack it.
        function offer(msg) {
          var sid = msg.sessionId;
          try {
            var pc = new PC({ iceServers: ICE_SERVERS });
            makeSession(sid, pc, expire);
            wireIceOut(sid, pc, msg.fromUserId);

            log('recipient: offer from ' + msg.fromUserId + ', answering');
            pc.oniceconnectionstatechange = function () {
              log('recipient: ice state -> ' + pc.iceConnectionState);
            };

            pc.ondatachannel = function (e) {
              var channel = e.channel;
              var s = sessions[sid];
              if (s) s.channel = channel;
              log('recipient: data channel opened by peer');
              channel.onmessage = function (evt) {
                try {
                  var parsed = JSON.parse(evt.data);
                  if (!parsed) return;
                  var cur = sessions[sid];
                  if (!cur) return;

                  // Image chunk: just accumulate. Indexed rather than appended
                  // because completeness is checked by index below - SCTP
                  // ordering is reliable here, but a dropped chunk must be
                  // detectable rather than silently producing a truncated file.
                  if (typeof parsed.img === 'string') {
                    if (cur.imgParts) cur.imgParts[parsed.i] = parsed.img;
                    return;
                  }

                  if (parsed.img_end) {
                    var parts = cur.imgParts || [];
                    var complete = parts.length === parsed.n;
                    for (var k = 0; complete && k < parsed.n; k++) {
                      if (typeof parts[k] !== 'string') complete = false;
                    }
                    if (!complete) {
                      // Hand RN nothing. No 'received' means no ack, the
                      // sharer times out, and the code lands via the rescue
                      // path - better than persisting half an image.
                      log('recipient: image incomplete, abandoning transfer');
                      return;
                    }
                    log('recipient: IMAGE RECEIVED over P2P for coupon ' + cur.couponId);
                    post({
                      type: 'received',
                      sessionId: sid,
                      couponId: cur.couponId,
                      code: cur.code,
                      image: parts.join('')
                    });
                    return;
                  }

                  // Header. A code-only coupon can be handed over immediately;
                  // one carrying an image waits for img_end so RN persists both
                  // before acking.
                  if (!parsed.coupon_id) return;
                  if (!parsed.code && !parsed.has_image) return;
                  cur.couponId = parsed.coupon_id;
                  cur.code = parsed.code || null;
                  if (parsed.has_image) {
                    cur.imgParts = [];
                    rearm(sid, TRANSFER_TIMEOUT_MS);
                    // RN sized its own watchdog for a handshake. Tell it an
                    // image is inbound so it extends to match, or it reclaims
                    // the session mid-transfer and the image arrives with no
                    // callback left to refresh the screen.
                    post({ type: 'transferring', sessionId: sid });
                    log('recipient: header received, awaiting image');
                    return;
                  }
                  log('recipient: CODE RECEIVED over P2P for coupon ' + parsed.coupon_id);
                  // Hand it to RN and STOP. The ack is only sent once RN
                  // confirms the code is actually persisted (see the 'ack'
                  // command) — acking here would settle the sharer before the
                  // write succeeded, so a failed write would lose the code
                  // with no rescue.
                  post({
                    type: 'received',
                    sessionId: sid,
                    couponId: parsed.coupon_id,
                    code: parsed.code
                  });
                } catch (err) { log('receive failed: ' + err); }
              };
            };

            pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
              .then(function () {
                flushIce(sid);
                return pc.createAnswer();
              })
              .then(function (answer) {
                return pc.setLocalDescription(answer).then(function () { return answer; });
              })
              .then(function (answer) {
                post({
                  type: 'signal',
                  action: 'webrtc-answer',
                  sessionId: sid,
                  toUserId: msg.fromUserId,
                  sdp: answer
                });
              })
              .catch(function (err) { log('offer handling failed: ' + err); cleanup(sid); });
          } catch (err) {
            log('offer failed: ' + err);
            cleanup(sid);
          }
        }

        function answer(msg) {
          var s = sessions[msg.sessionId];
          if (!s) return;
          // The offer is pushed to every live connection the recipient has, so
          // a recipient signed in on two devices answers twice with the same
          // session id. Applying the second throws (wrong signaling state) and
          // used to tear down the connection that was already working. First
          // answer wins; the other device's peer connection times out on its own.
          // The flag is set synchronously (not after setRemoteDescription
          // resolves, like remoteSet) so a second answer arriving inside that
          // promise's resolution window is still rejected.
          if (s.answering) { log('ignoring duplicate answer (recipient on multiple devices)'); return; }
          s.answering = true;
          try {
            s.pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
              .then(function () { flushIce(msg.sessionId); })
              .catch(function (err) { log('answer failed: ' + err); fail(msg.sessionId); });
          } catch (err) {
            log('answer failed: ' + err);
            fail(msg.sessionId);
          }
        }

        // RN confirms the received code is persisted; only now is it safe to
        // tell the sharer the transfer succeeded. If RN's write failed it
        // never sends this, the sharer's timeout fires, and the rescue path
        // stores the code server-side instead.
        function ack(msg) {
          var s = sessions[msg.sessionId];
          if (!s || !s.channel) return;
          // Send and leave the channel open: closing it (or tearing down the
          // peer connection via settle) right after send can discard data
          // still buffered by SCTP, losing the ack. The sharer closes the
          // channel once the ack lands, which is what settles us below; the
          // session timeout is the backstop if it never does.
          s.channel.onclose = function () { settle(msg.sessionId); };
          try { s.channel.send(JSON.stringify({ ack: true })); } catch (err) {}
        }

        function ice(msg) {
          if (!msg.candidate) return;
          var s = sessions[msg.sessionId];
          if (!s) {
            if (!orphanIce[msg.sessionId]) orphanIce[msg.sessionId] = [];
            orphanIce[msg.sessionId].push(msg.candidate);
            return;
          }
          if (!s.remoteSet) { s.pending.push(msg.candidate); return; }
          try {
            s.pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(function () {});
          } catch (err) {}
        }

        function handle(raw) {
          var msg;
          try { msg = JSON.parse(raw); } catch (e) { return; }
          if (!msg || !msg.type) return;
          if (msg.type === 'start') return start(msg);
          if (msg.type === 'offer') return offer(msg);
          if (msg.type === 'answer') return answer(msg);
          if (msg.type === 'ice') return ice(msg);
          if (msg.type === 'ack') return ack(msg);
          if (msg.type === 'cancel') return cleanup(msg.sessionId);
        }

        if (!PC) {
          post({ type: 'log', message: 'RTCPeerConnection unavailable in this WebView' });
        }
        post({ type: 'ready' });

        return { handle: handle };
      })();
      true;
    </script>
  </body>
</html>`;
