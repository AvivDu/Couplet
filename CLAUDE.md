# Couplet
React Native coupon wallet — aggregates coupons from multiple sources, supports P2P sharing.

## Architecture
Hybrid: client-server (auth/metadata/notifications) + P2P (coupon transfer).
**Security invariant: coupon codes, QR codes, barcodes are NEVER stored on or transmitted through the server. Server holds metadata only. Enforce this in all code.**
Server coordinates P2P sessions but never relays coupon data.

## Tech Stack
| Layer | Tech |
|---|---|
| Mobile | React Native |
| Backend | Node.js + Express |
| Auth | AWS Cognito (issues JWTs for all API calls) |
| Notifications | AWS SNS |
| P2P | WebRTC (TBD) |
| Database | AWS DynamoDB (TBD) |

## Data Model
**Server — Users:** `user_id, email, user_name, password_hash, created_at, coupon_id_list`
**Server — Coupon (metadata only):** `coupon_id, owner_id, category, redeemable_stores, expiration_date, balance, status`
**Server — Group:** `group_id, user_id_list, coupon_id_list, admin_user_id`
**Client local storage:** coupon code / QR / barcode, owner identifier, sharing permissions

## Features
1. Auth — register/login via Cognito, JWT on all requests
2. Coupon storage — codes stored locally, metadata synced to server
3. Coupon management — add/view/update, filter by category or expiry, status: `active/expired/used`
4. Expiry notifications — server monitors metadata, pushes via AWS SNS, never accesses codes
5. Redemption — local only, client sends `used` status to server, notifies group if balance zero
6. Groups & P2P sharing — server manages groups/permissions, coupon data goes device-to-device
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
