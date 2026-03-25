# Couplet — Project Summary

**Team:** Aviv Duzy, Roni Kenigsberg, Doron Shen-Tzur
**Last updated:** 2026-03-21

A mobile coupon wallet app. Users store, manage, and share coupons with friends and family. Coupon codes/QR live only on the device — the server holds metadata only.

---

## Reference Docs

| Doc | Purpose |
|---|---|
| `CLAUDE.md` | Architecture, feature spec, DB schema, user flows |
| `TRACK_B_GROUPS_FEATURE.md` | Full Groups feature design + developer handoff (server routes, client screens, build order, verification checklist) |

---

## What's Done & Working

### Auth
- [x] Register with email, username, password via **AWS Cognito** (client calls Cognito directly)
- [x] Login with email + password → Cognito access token stored in `expo-secure-store`
- [x] Server verifies Cognito JWTs via `aws-jwt-verify` (no IAM credentials on server)
- [x] `POST /auth/sync` — creates user metadata record in DB after registration
- [x] `GET /auth/me` — returns user metadata on login
- [x] Auth guard: unauthenticated users redirected to Welcome screen
- [x] Logout clears token and redirects to auth flow
- [x] Password strength validation (8+ chars, uppercase, lowercase, number, symbol) with real-time match indicator

### Coupon Management (Client)
- [x] Add new coupon — name, code, category, expiration date, balance
- [x] Category selector with 8 colored circles (Food, Fashion, Groceries, Electronics, Beauty, Travel, Sport, Other)
- [x] Custom 3-pill date picker (Year / Month / Day) — bottom sheet modal, no native DatePicker dependency
- [x] Coupon code stored locally in AsyncStorage (never sent to server)
- [x] Barcode/QR image stored locally in AsyncStorage via expo-image-picker (camera or photo library)
- [x] Coupon list on home screen with category filter dropdown
- [x] Pull-to-refresh on coupon list
- [x] Coupon detail modal — view code, image, balance, expiry, status
- [x] Edit coupon (name, code, expiry, balance, category) — same 3-pill date picker as Add screen
- [x] Delete coupon (removes metadata from server + code/image from local storage)
- [x] Redeem button marks coupon as `used`
- [x] Badge on card for `used` and `expired` coupons
- [x] "About" modal accessible from the Add screen (app version, team credits)

### Coupon Management (Server)
- [x] Coupon metadata synced to **AWS DynamoDB** (category, store_name, expiration_date, balance, status)
- [x] GET, POST, PATCH, DELETE endpoints for coupons (owner-only, auth-protected)
- [x] Auth middleware protects all coupon routes

### Groups / Connections
- [x] Create a group (creator becomes admin automatically)
- [x] Group list screen (Groups tab) — shows group name, member count, coupon count, admin badge
- [x] Empty state: "No groups yet — Tap + to create your first group"
- [x] Pull-to-refresh on Groups list; list also auto-refreshes when GroupDetail modal closes
- [x] Group detail modal — full member list and shared coupons list
- [x] Add member by email or username (admin only), with live user search suggestions (debounced)
- [x] Remove member from group (admin only, can't remove admin) — confirmation alert
- [x] Removing a member also removes their shared coupons from the group
- [x] Share a coupon to a group (owner only) — bottom sheet group picker in CouponDetail
- [x] Revoke a coupon from a group (admin or coupon owner) — confirmation alert

### Users
- [x] Search users by email or username — `GET /users/search?q=` (used for adding group members)

### Design System
- [x] Warm cream (`#F5F0E6`) + coral (`#E8604C`) / salmon design throughout
- [x] Underline-style inputs (no box borders — `borderBottomWidth: 1.5, borderBottomColor: #C4B8A0`)
- [x] Pill-shaped buttons (`borderRadius: 30`, coral fill)
- [x] Category-colored solid cards for coupons (`borderRadius: 16`)
- [x] Bottom tab bar with 3 tabs: My Coupons · Add · Groups (cream bg, coral active)
- [x] Safe area handling, no native headers (all screens manage their own top area with `SafeAreaView`)
- [x] Welcome splash screen with ticket logo
- [x] Bottom sheet modals (Create Group, Date Picker, Share to Group) — slide-up with drag handle

### Infrastructure
- [x] Node.js + Express server
- [x] **AWS DynamoDB** via `@aws-sdk/lib-dynamodb` Document Client (Users, Coupons, Groups tables)
- [x] **AWS Cognito** for auth (User Pool: `us-east-1_gVgsfA5EG`, PreSignUp Lambda for auto-confirm)
- ⚠️ **Learner Lab credentials expire every 4 hours.** At the start of each lab session, go to Vocareum → AWS Details → Show, and update `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_SESSION_TOKEN` in `server/.env`. Without this the server cannot reach DynamoDB.
- [x] CORS enabled on server
- [x] `.env.example` files for both client and server
- [x] TypeScript on both client and server
- [x] `expo-secure-store` for token storage
- [x] `AsyncStorage` for coupon codes and images

---

## Key File Map

```
client/
  app/
    (auth)/
      welcome.tsx         — splash, logo, CTA
      login.tsx           — underline inputs + coral button
      register.tsx        — same, with password strength hint + match indicator
    (tabs)/
      _layout.tsx         — tab bar config (3 tabs: index, add, connections)
      index.tsx           — My Coupons: list, FAB, category filter, pull-to-refresh
      add.tsx             — Add Coupon: form + 3-pill date picker + About modal
      connections.tsx     — Groups: list, create group modal, opens GroupDetail
  components/
    CouponCard.tsx        — solid-color card with badge for used/expired
    CouponDetail.tsx      — detail/edit modal + image picker + Share to Group picker
    GroupCard.tsx         — group summary card (name, member count, admin badge)
    GroupDetail.tsx       — members list + shared coupons + add/remove/revoke
  context/
    AuthContext.tsx       — token storage, user state, login/logout
  services/
    api.ts                — all HTTP calls (coupons + groups + user search + auth sync)
    cognito.ts            — Cognito signUp/signIn via amazon-cognito-identity-js
  storage/
    couponStorage.ts      — AsyncStorage helpers for codes and images

server/src/
  index.ts                — Express app setup, route registration
  db.ts                   — DynamoDB Document Client + all db helper functions
  middleware/
    auth.ts               — Cognito JWT verification via aws-jwt-verify
  routes/
    auth.ts               — POST /auth/sync, GET /auth/me
    coupons.ts            — CRUD for coupon metadata (auth-protected)
    groups.ts             — CRUD for groups + members + coupon sharing (auth-protected)
    users.ts              — GET /users/search
```

---

## Still To Do

### Core Features

- [ ] **P2P coupon transfer** — Share the actual coupon code (and image) directly device-to-device via WebRTC. Currently group members only see *metadata* (store name, category, expiry). The secret code never leaves the owner's device. This is needed before sharing is truly useful end-to-end.
- [ ] **Expiration notifications** — Server should check expiration dates and fire push notifications before coupons expire via **AWS SNS** (Phase 3).
- [ ] **Coupon code type selector** — When adding a coupon, let users specify: text code / barcode / QR code, so the detail screen can render it appropriately.
- [ ] **Group admin transfer** — Allow admin to hand off the admin role to another member. Currently admin is fixed at creation.
- [ ] **Leave group** — Let non-admin members leave a group themselves. Currently only admin can remove members.

### UI / UX

- [ ] **Error messages** — Most forms log errors to console but show no visible feedback. Add inline error text or a toast/alert for auth failures, network errors, share failures, etc.
- [ ] **Loading states** — Several async actions (add coupon, share to group, add member) lack a loading indicator. Disable buttons / show spinner while in-flight.
- [ ] **Image display in coupon detail** — Upload is wired up and saved locally; the detail view needs to render the saved image as the barcode/QR visual rather than just an upload button.
- [ ] **Coupon search** — Home screen has a search bar placeholder, but it isn't connected. Wire it up: query the server, get back matching coupon IDs, filter the local list.
- [ ] **Expired coupon auto-update** — Status stays `active` until manually changed. Add a check (client-side on load, or server cron) to flip status to `expired` automatically.
- [ ] **Group coupon count accuracy** — `coupon_id_list.length` may include revoked or deleted coupons. Ensure the count shown on GroupCard reflects only active shared coupons.

### Auth

- [ ] **Forgot password** — "Forgot password?" link on login screen → user enters email → Cognito sends reset code → user enters code + new password. Uses `forgotPassword()` + `confirmPassword()` from `amazon-cognito-identity-js`.
- [ ] **Change password** — Option in settings/profile for logged-in users to change their password. Uses `changePassword()` with old + new password (no email code needed).

### Security & Polish

- [ ] **Token expiry handling** — Cognito access tokens expire in 1 hour. Add 401 catch-all in the API client to redirect to login instead of silent failure.
- [ ] **Rate limiting** — Add `express-rate-limit` to auth endpoints to prevent brute-force.
- [ ] **Input validation on server** — Some routes lack validation (balance should be ≥ 0, status should be enum-checked). Add `zod` or `express-validator`.
- [ ] **Production deploy** — Server needs hosting, and client `EXPO_PUBLIC_API_URL` updated.

### Future / Optional

- [ ] **Location-based suggestions** — Notify users of coupons they own when they enter a store that accepts them.
- [ ] **Digital wallet integration** — Export to Apple Wallet / Google Wallet.
- [ ] **Coupon history screen** — View past `used` and `expired` coupons separately from active ones.
- [ ] **Group invite link / QR** — Join a group via shareable link or QR code (instead of admin-only invitation).
- [ ] **Real-time group updates** — Groups currently refresh only on focus/pull. WebSocket or push-based updates would improve UX when multiple users are active.
