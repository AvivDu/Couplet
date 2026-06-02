# Couplet
React Native coupon wallet — aggregates coupons from multiple sources, supports P2P sharing.

## Architecture
Hybrid: client-server (auth/metadata/notifications) + P2P (coupon transfer).
**Security invariant: coupon codes, QR codes, barcodes are NEVER stored on or transmitted through the server. Server holds metadata only. Enforce this in all code.**
Server coordinates P2P sessions but never relays coupon data.
**Coupon-code transfer staging:** Stage 1 (current) — on share, the server checks each recipient's live connections: online members get the code pushed live via `pushToUser` (`coupon_transfer`, never persisted); the code is stored on the group_share notification ONLY for offline members, as a fallback (TODO(P2P) in `server/src/routes/groups.ts`). Stage 2 (future, needs dev build) — WebRTC data channel, WS becomes signaling-only. Never add coupon_code to WS notification payloads (`notifyUser` strips it).

## Tech Stack
| Layer | Tech |
|---|---|
| Mobile | React Native |
| Backend | Node.js + Express on **AWS Lambda** (serverless, via `serverless-http`) |
| API Gateway | AWS API Gateway HTTP API — public URL, routes all requests to Lambda |
| Auth | AWS Cognito (issues JWTs for all API calls) |
| Notifications | In-app + live via API Gateway **WebSocket** (push token / SNS not usable in Expo Go) |
| Real-time | API Gateway **WebSocket API** + Lambda — live notifications + ephemeral coupon relay; `Couplet-Connections` table (PK `connection_id`, GSI `user_id-index`) |
| P2P | WebRTC (Stage 2, TBD — needs dev build) — signaling reuses the WebSocket API |
| Database | AWS DynamoDB |

## Data Model
**Server — Users:** `user_id, email, user_name, password_hash, created_at, coupon_id_list`
**Server — Coupon (metadata only):** `coupon_id, owner_id, category, redeemable_stores, expiration_date, balance, status, giftcard_url`
**Server — Group:** `group_id, name, user_id_list, pending_user_ids, coupon_id_list, admin_user_id, image` (image = small base64 data-URL avatar ~256px, shared with all members; admin-set via `PUT /groups/:id/photo`)
**Client local storage:** coupon code / QR / barcode, owner identifier, sharing permissions

## Features
1. Auth — register/login via Cognito, JWT on all requests
2. Coupon storage — codes stored locally, metadata synced to server
3. Coupon management — add/view/update, filter by category or expiry, status: `active/expired/used`; optional `giftcard_url` for dynamic web-link gift cards (e.g. BuyMe) — opens in-app browser via `expo-web-browser`; server stores URL as metadata (not a coupon code — invariant preserved)
4. Notifications — live over WebSocket while app open (group_invite/group_share/coupon_revoked pushed via `notifyUser`); in-app banner when on-screen, **local OS notification** (`expo-notifications`, works in Expo Go) when app backgrounded/not focused; catch-up poll on resume fires OS notifications for items missed while suspended (baseline-suppressed on cold start); clickable rows + OS-notification taps delete + deep-link to `/group/[id]`. Expiry alerts still client-generated. True remote push when app closed needs a dev build (Tier 3 — foundations in place).
5. Redemption — local only, client sends `used` status to server, notifies group if balance zero
6. Groups & P2P sharing — server manages groups/permissions; coupon code delivered Stage-1 via ephemeral WebSocket `coupon_transfer` relay (authorized by group co-membership, never stored); invitation flow: admin invites → pending_user_ids → invitee accepts/declines via notification panel; admin can rename or delete the group (403 for non-admins)
7. Search — client queries server by store → server returns coupon IDs → client filters locally

## Screens
Login/Register · Home (coupon list, search, filters) · Coupon Detail (QR/barcode, balance, expiry) · Add Coupon · Connections (groups list) · Group Coupons

## Git Rules
- Never commit directly to `main`. All work on `feature/<name>` or `fix/<name>` branches.
- Sync with main before starting work and before opening a PR.
- Prefer PRs over direct merges — 3-person team, give teammates review window.
- Commit at meaningful milestones: working feature, bug fix, complete refactor. Never commit broken or mixed-concern changes.
- Commit format: `type: short description` — types: `feat` `fix` `refactor` `chore`
- High-conflict files — coordinate with teammates before touching: `client/services/api.ts`, `client/app/(tabs)/_layout.tsx`, `client/package.json`, `server/package.json`

## Claude Rules
- Suggest a commit after each meaningful completed change (new component, new route, bug fix, refactor).
- When architecture, tech decisions, schema, or features change, update this file immediately.
- Update `PROJECT_SUMMARY.md` when meaningful progress is made (new feature complete, significant refactor, tech decision finalized).
- Keep this file directive and token-minimal: no prose explanations, no bash blocks, no rationale. Directives only.
