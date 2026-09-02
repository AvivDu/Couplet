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
//   page -> RN  : postMessage of { type: 'ready'|'signal'|'received'|'failed'|'delivered'|'log', ... }
//
// The coupon code only ever exists inside this page and on the data channel —
// it is never handed to the signaling messages, which carry SDP/ICE only.

export const WEBRTC_BRIDGE_HTML = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>
    <script>
      window.__bridge = (function () {
        var ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
        var NEGOTIATION_TIMEOUT_MS = 15000;
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
            timer: setTimeout(function () { onTimeout(sid); }, NEGOTIATION_TIMEOUT_MS)
          };
          sessions[sid] = s;
          return s;
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

        // Sharer: open the channel and push the code down it.
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
              log('sharer: data channel OPEN, sending code');
              dc.send(JSON.stringify({ coupon_id: msg.couponId, code: msg.code }));
            };
            dc.onmessage = function (e) {
              try {
                var parsed = JSON.parse(e.data);
                if (parsed && parsed.ack) {
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
                  if (!parsed || !parsed.coupon_id || !parsed.code) return;
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
