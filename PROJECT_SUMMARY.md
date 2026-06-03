# Couplet — Project Summary

**Team:** Aviv Duzy, Roni Kenigsberg, Doron Shen-Tzur
**Last updated:** 2026-06-03 (Android UI polish — SafeAreaView + font scaling fix; cross-device profile image sync on startup)

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
- [x] **Cross-device profile image sync** — on app startup, `AuthContext` background-fetches `GET /auth/me` so profile photos set on another device appear without re-login (stale-while-revalidate: cached avatar shown immediately, server value applied silently)

### Coupon Management (Client)
- [x] Add new coupon — name, code, category, expiration date, balance
- [x] Category selector — 8 rounded-square cards with Ionicons line-art icons; unselected shows category-color border, selected fills with pastel color
- [x] Native date picker via `@react-native-community/datetimepicker` — calendar dialog on Android, inline bottom-sheet on iOS (replaced custom 3-pill picker)
- [x] Add Coupon form auto-resets on every screen focus (`useFocusEffect`) — no stale data when returning to the tab
- [x] Coupon code stored locally in AsyncStorage (never sent to server)
- [x] Barcode/QR image stored locally in AsyncStorage via expo-image-picker (camera or photo library)
- [x] Coupon list on home screen with horizontal category scroll cards (replaced dropdown) — Ionicons icons, pastel active state
- [x] Sort button on home screen — Balance High→Low, Balance Low→High, Expiry Date; active sort shown in coral with inline clear; applies across all categories
- [x] Pull-to-refresh on coupon list
- [x] Coupon detail modal — view code, image, balance, expiry, status
- [x] Edit coupon (name, code, expiry, balance, category)
- [x] Delete coupon (removes metadata from server + code/image from local storage)
- [x] Redeem button marks coupon as `used`
- [x] Badge on card for `used` and `expired` coupons
- [x] "About" modal accessible from the Add screen (app version, team credits)

### Coupon Management (Server)
- [x] Coupon metadata synced to **AWS DynamoDB** (category, store_name, expiration_date, balance, status, giftcard_url)
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
- [x] Leave group (non-admin members) — confirmation alert, removes shared coupons
- [x] **Group invitation system** — admin invites by email/username → user added to `pending_user_ids`; invited user receives notification card with Accept/Decline buttons; Accept moves user to `user_id_list`; admin can cancel pending invites; pending members shown at 50% opacity with Pending badge in GroupDetail
- [x] **Notification bell** — header bell icon on My Coupons with unread badge; slide-up panel shows expiry alerts (within 7 days) and group invite cards; swipe left/right to dismiss; `GET /invitations` polled on each load
- [x] **Rename group** — admin-only; inline modal with current name pre-filled; `PUT /groups/:id/name`; updates local state on success; 403 for non-admins
- [x] **Delete group** — admin-only; centered confirmation modal with permanent-action warning; `DELETE /groups/:id`; navigates back to groups list on success; 403 for non-admins
- [x] **Group page redesign** (`app/group/[id].tsx`, WhatsApp-style) — header (group avatar + admin "Tap photo to edit"), `MEMBERS · n` label + horizontal members strip (admin-only "Add" chip, "You" ring, first names), prominent "Share a Coupon" button, "SHARED COUPONS (n)" header with filter button, and sender-attributed coupon cards (24px avatar + per-member accent-colored name; tag tile + brand/category/expiry; **Use coupon** reveals code via CouponDetail, **Revoke** for own coupons + admin trash on others'). Design handoff (spec + screenshots + reference) kept in `client/docs/design_handoff_group_page/`
- [x] **Coupon filter sheet** — bottom sheet to filter the shared-coupon feed by member and/or category (categories derived from the group's coupons); filter button inverts to coral when active; Clear resets

### Users
- [x] Search users by email or username — `GET /users/search?q=` (used for adding group members)

### Design System
- [x] Pastel category color system — centralized in `client/constants/categories.ts`; applied to category cards, Add Coupon selector, and coupon card backgrounds
- [x] Warm cream (`#F5F0E6`) + coral (`#E8604C`) / salmon design throughout
- [x] Underline-style inputs (no box borders — `borderBottomWidth: 1.5, borderBottomColor: #C4B8A0`)
- [x] Pill-shaped buttons (`borderRadius: 30`, coral fill)
- [x] Category-colored solid cards for coupons (`borderRadius: 16`)
- [x] Bottom tab bar with 3 tabs: My Coupons · Add · Groups (cream bg, coral active)
- [x] Safe area handling, no native headers (all screens manage their own top area with `SafeAreaView`)
- [x] **Branded C logo** — `logo-c.png` (transparent PNG) rendered via `CSymbol`; `CoupletLogo` composes C + "OUPLET" wordmark at small/medium/large sizes with optional tagline
- [x] **4-phase welcome animation** — Phase 1: large C centered (scale 2×); Phase 2: slides left + scales to 1× (550 ms); Phase 3: "OUPLET" types out letter-by-letter via `Animated.stagger`; Phase 4: tagline fades in → CTA button fades in
- [x] Welcome splash screen with ticket logo
- [x] Bottom sheet modals (Create Group, Date Picker, Share to Group) — slide-up with drag handle
- [x] Error messages — all forms show `Alert.alert` on failure (auth, coupon CRUD, group ops)
- [x] Loading states — `LoadingOverlay` on auth, `ActivityIndicator` on coupon save, add member, share to group
- [x] **Custom crop modal** (`ImageCropModal.tsx`) — full-screen free-form crop UI: draggable corner handles resize crop box to any dimension, center-drag moves it, rule-of-thirds grid overlay, `expo-image-manipulator` applies the crop in real image pixel coords; replaces the native fixed-square `allowsEditing` picker
- [x] **Dynamic barcode container** — uses `onLoad` aspect ratio + `maxHeight: 150` so the container wraps the cropped image proportionally (wide barcodes render ~94px tall; square QR codes cap at 150px); no fixed-height letterboxing
- [x] **Fullscreen barcode viewer** — tapping barcode in Coupon Detail opens a full-screen modal for easy store scanning; image editing restricted to Edit Coupon form only
- [x] **Dynamic gift card URL** — optional `giftcard_url` field on coupons; Add/Edit forms accept a URL as an alternative to code/image; Coupon Detail shows "Open Live Gift Card" button (taps `expo-web-browser`) instead of static image block when URL is set; server stores URL as metadata (invariant preserved)
- [x] Coupon search — live local filter by store name on home screen (search bar + clear button)
- [x] Expired coupon auto-update — on load, active coupons past expiry date are patched to `expired`
- [x] Token expiry handling — 401 interceptor in `api.ts` triggers `signOut` via `AuthContext`
- [x] Store locator ("Where to use") — finds nearby stores via Google Places, sorted by distance

### Infrastructure
- [x] Node.js + Express server
- [x] **AWS DynamoDB** via `@aws-sdk/lib-dynamodb` Document Client (Users, Coupons, Groups tables)
- [x] **AWS Cognito** for auth (User Pool: `us-east-1_gVgsfA5EG`, PreSignUp Lambda for auto-confirm)
- [x] **AWS Lambda** — server runs serverless via `serverless-http` wrapping Express. No EC2, no PM2, no Elastic IP. IAM role (`LabRole`) assigned directly to Lambda for AWS auth.
- [x] **AWS API Gateway HTTP API** (`couplet-api`) — permanent public URL `https://ij27gn1sg9.execute-api.us-east-1.amazonaws.com`, routes `ANY /{proxy+}` to Lambda. Auto-deploy enabled.
- [x] CORS enabled on server
- [x] `.env.example` files for both client and server
- [x] TypeScript on both client and server
- [x] `expo-secure-store` for token storage
- [x] `AsyncStorage` for coupon codes and images

---

## How to Run

### Each Lab Session (Backend)
Nothing to do — Lambda runs on-demand. No instance to start, no PM2, no SSH.
Just start the Learner Lab session so AWS credentials are active for DynamoDB/Cognito access.

### Update Server After Code Changes
```bash
cd server
npm run build
Compress-Archive -Path dist, node_modules -DestinationPath lambda.zip -Force
```
Then go to **Lambda → couplet-server → Upload from → .zip file** and upload `lambda.zip`.

### Run the Client (Development)
```bash
cd client
npx expo start
```
Scan the QR code with Expo Go. The app talks to the Lambda backend (via API Gateway) using `EXPO_PUBLIC_API_URL` in `client/.env` (gitignored).

---

## Key File Map

```
client/
  app/
    (auth)/
      welcome.tsx         — 4-phase animated entry: C centers → slides + shrinks → types OUPLET → tagline → CTA
      login.tsx           — underline inputs + coral button
      register.tsx        — same, with password strength hint + match indicator
    (tabs)/
      _layout.tsx         — tab bar config (3 tabs: index, add, connections)
      index.tsx           — My Coupons: list, FAB, category filter, pull-to-refresh
      add.tsx             — Add Coupon: form + 3-pill date picker + About modal
      connections.tsx     — Groups: list, create group modal, opens GroupDetail
    group/
      [id].tsx            — Group page (redesigned): header, members strip, Share button, filter sheet, sender-attributed coupon cards
  components/
    CSymbol.tsx           — C icon from logo-c.png asset (size prop)
    CoupletLogo.tsx       — wordmark: CSymbol + "OUPLET" text, size/tagline props
    SplashScreen.tsx      — reusable fade-in/scale splash overlay (isLoading + onComplete)
    CouponCard.tsx        — solid-color card with badge for used/expired
    CouponDetail.tsx      — detail/edit modal + image picker + Share to Group picker
    GroupCard.tsx         — group summary card (name, member count, admin badge)
    GroupDetail.tsx       — members list + shared coupons + add/remove/revoke + pending invites
    NotificationPanel.tsx — slide-up notification panel (expiry alerts + group invite cards)
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
    groups.ts             — CRUD for groups + members + coupon sharing + invitation routes (auth-protected)
    invitations.ts        — GET /invitations (pending invites for current user)
    users.ts              — GET /users/search
```

### Real-time Notifications & Coupon Relay (WebSocket)
- [x] **API Gateway WebSocket API** served by the same Lambda (handler branches HTTP vs WS on `requestContext.connectionId`)
- [x] `$connect` verifies the Cognito JWT (`?token=`) and stores the socket in **`Couplet-Connections`** (PK `connection_id`, GSI `user_id-index`); `$disconnect` removes it
- [x] `notifyUser()` inserts a notification **and** pushes it live to the user's sockets, **code-stripped** (coupon_code never in a WS notification payload)
- [x] Live delivery for `group_invite`, `group_share`, `coupon_revoked` — appears instantly while app is open, no refresh
- [x] Client `NotificationsProvider` owns the socket (AppState reconnect, exp. backoff, 5-min ping keepalive), renders a global in-app **banner**, exposes `revision` (drives home-screen live refresh)
- [x] **Clickable notifications** — tap a banner or panel row → deletes the notification + deep-links to `/group/[id]`
- [x] **Local OS notifications (Tier 2, `expo-notifications`)** — in-app banner when the app is on-screen, real system/tray notification (sound) when backgrounded/not focused; works in Expo Go (no dev build)
- [x] **Catch-up on resume** — returning to the app re-polls `GET /notifications`, fires OS notifications for items missed while suspended (capped 3 + summary), refreshes badge; cold-start baseline suppresses spam for pre-existing unread
- [x] **OS-notification tap routing** — opens the app, deletes the notification, deep-links to the group (same handler Tier 3 will reuse)
- [x] **Stage-1 coupon-code transfer** — the **server** relays the code on share: per-recipient it pushes `coupon_transfer` live to online members (stored nothing) and persists `coupon_code` **only for offline members** (TODO-marked fallback). The recipient saves the code **silently** — a single `group_share` notification is the only user-facing alert per shared coupon. Removed entirely at Stage 2 (WebRTC)
- [x] Resilient: with `EXPO_PUBLIC_WS_URL` unset the socket no-ops and the app falls back to poll-on-focus
- Setup: create the `Couplet-Connections` table + GSI, a WebSocket API (routes `$connect`/`$disconnect`/`$default`, route selection `$request.body.action`) → same Lambda; set `DYNAMODB_CONNECTIONS_TABLE`, `WS_API_ID`/`WS_STAGE` (server) + `EXPO_PUBLIC_WS_URL` (client)

---

## Still To Do

### Core Features

- [ ] **True P2P coupon transfer (Stage 2)** — Stage 1 is done: the code is relayed ephemerally over the WebSocket (never stored), delivered live when both devices are online. Stage 2 replaces the relay with a **WebRTC data channel** so the code never transits the server at all (WS becomes signaling-only). Requires leaving Expo Go for a dev build (`react-native-webrtc` + STUN/TURN). Also still TODO: relay the coupon **image**, and offline store-and-forward.
- [ ] **Expiration notifications** — Server should check expiration dates and fire push notifications before coupons expire via **AWS SNS** (Phase 3).
- [ ] **Coupon code type selector** — When adding a coupon, let users specify: text code / barcode / QR code, so the detail screen can render it appropriately.
- [ ] **Group admin transfer** — Allow admin to hand off the admin role to another member. Currently admin is fixed at creation.
### UI / UX

- [ ] **Group coupon count accuracy** — `coupon_id_list.length` may include revoked or deleted coupons. Ensure the count shown on GroupCard reflects only active shared coupons.

### Auth

- [ ] **Forgot password** — "Forgot password?" link on login screen → user enters email → Cognito sends reset code → user enters code + new password. Uses `forgotPassword()` + `confirmPassword()` from `amazon-cognito-identity-js`.
- [ ] **Change password** — Option in settings/profile for logged-in users to change their password. Uses `changePassword()` with old + new password (no email code needed).

### Security & Polish
- [ ] **Rate limiting** — Add `express-rate-limit` to auth endpoints to prevent brute-force.
- [ ] **Input validation on server** — Some routes lack validation (balance should be ≥ 0, status should be enum-checked). Add `zod` or `express-validator`.
- [x] **Production deploy** — Server running on Lambda via API Gateway at `https://ij27gn1sg9.execute-api.us-east-1.amazonaws.com`, client `EXPO_PUBLIC_API_URL` set.

### Future / Optional

- [ ] **Location-based suggestions** — Notify users of coupons they own when they enter a store that accepts them.
- [ ] **Digital wallet integration** — Export to Apple Wallet / Google Wallet.
- [ ] **Coupon history screen** — View past `used` and `expired` coupons separately from active ones.
- [ ] **Group invite link / QR** — Join a group via shareable link or QR code (instead of admin-only invitation).
- [x] **Real-time group updates** — Live via the WebSocket API (notifications + coupon relay) while the app is open. Remaining: live group membership/coupon-list updates on the group screen itself, and background/closed-app push (needs a dev build — not possible in Expo Go).
