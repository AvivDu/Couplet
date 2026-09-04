# Couplet - Project Summary

**Team:** Aviv Duzy, Roni Kenigsberg, Doron Shen-Tzur
**Last updated:** 2026-08-26 (Integration of three feature branches: live redemption notifications + atomic redeems + coupon-code redelivery on edit; Cognito email verification, forgot-password, and the Gmail coupon scanner; General gift-card category and the sort/filter sheet overlay fix.)

A mobile coupon wallet app. Users store, manage, and share coupons with friends and family. Coupon codes/QR live only on the device - the server holds metadata only.

---

## Reference Docs

| Doc | Purpose |
|---|---|
| `CLAUDE.md` | Architecture, feature spec, DB schema, user flows |

---

## What's Done & Working

### Auth
- [x] Register with email, username, password via **AWS Cognito** (client calls Cognito directly)
- [x] Login with email + password → Cognito access token stored in `expo-secure-store`
- [x] Server verifies Cognito JWTs via `aws-jwt-verify` (no IAM credentials on server)
- [x] `POST /auth/sync` - creates user metadata record in DB after registration
- [x] `GET /auth/me` - returns user metadata on login
- [x] Auth guard: unauthenticated users redirected to Welcome screen
- [x] Logout clears token and redirects to auth flow
- [x] Password strength validation (8+ chars, uppercase, lowercase, number, symbol) with real-time match indicator
- [x] **Cross-device profile image sync** - on app startup, `AuthContext` background-fetches `GET /auth/me` so profile photos set on another device appear without re-login (stale-while-revalidate: cached avatar shown immediately, server value applied silently)
- [x] **Email verification at signup** - Cognito confirm-signup flow (client-direct, `amazon-cognito-identity-js`); account stays `UNCONFIRMED` until the emailed code is entered on the register screen; logging in on an unconfirmed account auto-resends the code and recovers into the same confirm step instead of dead-ending (`client/app/(auth)/login.tsx`, `register.tsx`, `client/components/ConfirmCodeStep.tsx`)

### Coupon Management (Client)
- [x] Add new coupon - name, code, category, expiration date, balance
- [x] Category selector - 8 rounded-square cards with Ionicons line-art icons; unselected shows category-color border, selected fills with pastel color
- [x] Native date picker via `@react-native-community/datetimepicker` - calendar dialog on Android, inline bottom-sheet on iOS (replaced custom 3-pill picker)
- [x] Add Coupon form auto-resets on every screen focus (`useFocusEffect`) - no stale data when returning to the tab
- [x] Coupon code stored locally in AsyncStorage (never sent to server)
- [x] Barcode/QR image stored locally in AsyncStorage via expo-image-picker (camera or photo library)
- [x] Coupon list on home screen with horizontal category scroll cards (replaced dropdown) - Ionicons icons, pastel active state
- [x] Sort button on home screen - Balance High→Low, Balance Low→High, Expiry Date; active sort shown in coral with inline clear; applies across all categories
- [x] Pull-to-refresh on coupon list
- [x] Coupon detail modal - view code, image, balance, expiry, status
- [x] Edit coupon (name, code, expiry, balance, category)
- [x] Delete coupon (removes metadata from server + code/image from local storage)
- [x] Redeem button marks coupon as `used`
- [x] Badge on card for `used` and `expired` coupons
- [x] **Balance formatting** - amounts shown with thousand separators (`₪1,500.00`) everywhere via `client/utils/format.ts`; Add/Edit/Redeem amount inputs apply live comma masking as the user types (raw value kept for parsing)
- [x] **Redeem modal UX** - tap-outside-to-dismiss + `KeyboardAvoidingView` so the keyboard never covers the amount field; same keyboard-avoidance + tap-to-dismiss applied to Add and Edit coupon forms; swipe-down on Edit returns to the detail screen

### Coupon Management (Server)
- [x] Coupon metadata synced to **AWS DynamoDB** (category, store_name, expiration_date, balance, status, giftcard_url)
- [x] GET, POST, PATCH, DELETE endpoints for coupons (owner-only, auth-protected)
- [x] Auth middleware protects all coupon routes

### Groups / Connections
- [x] Create a group (creator becomes admin automatically)
- [x] Group list screen (Groups tab) - shows group name, member count, coupon count, admin badge
- [x] Empty state: "No groups yet - Tap + to create your first group"
- [x] Pull-to-refresh on Groups list; list also auto-refreshes when GroupDetail modal closes
- [x] Group detail modal - full member list and shared coupons list
- [x] Add member by email or username (admin only), with live user search suggestions (debounced)
- [x] Remove member from group (admin only, can't remove admin) - confirmation alert
- [x] Removing a member also removes their shared coupons from the group
- [x] Share a coupon to a group (owner only) - bottom sheet group picker in CouponDetail
- [x] Revoke a coupon from a group (admin or coupon owner) - confirmation alert
- [x] Leave group (non-admin members) - confirmation alert, removes shared coupons
- [x] **Group invitation system** - admin invites by email/username → user added to `pending_user_ids`; invited user receives notification card with Accept/Decline buttons; Accept moves user to `user_id_list`; admin can cancel pending invites; pending members shown at 50% opacity with Pending badge in GroupDetail
- [x] **Notification bell** - header bell icon on My Coupons with unread badge; slide-up panel shows expiry alerts (within 7 days) and group invite cards; swipe left/right to dismiss; `GET /invitations` polled on each load
- [x] **Rename group** - admin-only; inline modal with current name pre-filled; `PUT /groups/:id/name`; updates local state on success; 403 for non-admins
- [x] **Delete group** - admin-only; centered confirmation modal with permanent-action warning; `DELETE /groups/:id`; navigates back to groups list on success; 403 for non-admins
- [x] **Group page redesign** (`app/group/[id].tsx`, WhatsApp-style) - header (group avatar + admin "Tap photo to edit"), `MEMBERS · n` label + horizontal members strip (admin-only "Add" chip, "You" ring, first names), prominent "Share a Coupon" button, "SHARED COUPONS (n)" header with filter button, and sender-attributed coupon cards (24px avatar + per-member accent-colored name; tag tile + brand/category/expiry; **Use coupon** reveals code via CouponDetail, **Revoke** for own coupons + admin trash on others'). Design handoff (spec + screenshots + reference) kept in `client/docs/design_handoff_group_page/`
- [x] **Coupon filter sheet** - bottom sheet to filter the shared-coupon feed by member and/or category (categories derived from the group's coupons); filter button inverts to coral when active; Clear resets
- [x] Group back button reliably returns to the Groups list (`router.replace('/(tabs)/connections')`) even when the screen was opened via a notification deep-link with no back stack

### Users / Profile
- [x] Search users by email or username - `GET /users/search?q=` (used for adding group members)
- [x] Editable profile (Edit Profile screen) - change username + phone number via `PATCH /auth/me` (phone uniqueness enforced, 409 on conflict)
- [x] **Server-side profile photo** - pick from camera/library, resized to 256×256 + JPEG-compressed client-side (`expo-image-manipulator`), uploaded as base64 data-URL via `PUT /auth/me/photo` (≤~400 KB) and stored on the User as `profile_image`; `GET /auth/me` returns it so it persists across devices/reinstalls (local AsyncStorage kept as offline fallback)
- [x] **Group member avatar sync** - group endpoints expose each member's `profile_image` as `image`; the group page renders real photos in the members strip, coupon sender rows, and members sheet (falls back to initials when unset)

### Design System
- [x] Pastel category color system - centralized in `client/constants/categories.ts`; applied to category cards, Add Coupon selector, and coupon card backgrounds
- [x] Warm cream (`#F5F0E6`) + coral (`#E8604C`) / salmon design throughout
- [x] Underline-style inputs (no box borders - `borderBottomWidth: 1.5, borderBottomColor: #C4B8A0`)
- [x] Pill-shaped buttons (`borderRadius: 30`, coral fill)
- [x] Category-colored solid cards for coupons (`borderRadius: 16`)
- [x] Bottom tab bar with 3 tabs: My Coupons · Add · Groups (cream bg, coral active)
- [x] Safe area handling - all screens use `SafeAreaView` from `react-native-safe-area-context` with `edges={['top']}` (fixes status bar overlap on Android punch-hole devices)
- [x] **Font scaling locked** - `components/rn.tsx` wrapper exports `Text`/`TextInput` with `allowFontScaling={false}` + `maxFontSizeMultiplier={1}`; all screens import from wrapper (React 19 compatible)
- [x] Category card labels use `numberOfLines={1}` to prevent wrapping at any font scale
- [x] **Branded C logo** - `logo-c.png` (transparent PNG) rendered via `CSymbol`; `CoupletLogo` composes C + "OUPLET" wordmark at small/medium/large sizes with optional tagline
- [x] **4-phase welcome animation** - Phase 1: large C centered (scale 2×); Phase 2: slides left + scales to 1× (550 ms); Phase 3: "OUPLET" types out letter-by-letter via `Animated.stagger`; Phase 4: tagline fades in → CTA button fades in
- [x] Welcome splash screen with ticket logo
- [x] Bottom sheet modals (Create Group, Date Picker, Share to Group) - slide-up with drag handle
- [x] Error messages - all forms show `Alert.alert` on failure (auth, coupon CRUD, group ops)
- [x] Loading states - `LoadingOverlay` on auth, `ActivityIndicator` on coupon save, add member, share to group
- [x] **Custom crop modal** (`ImageCropModal.tsx`) - full-screen free-form crop UI: draggable corner handles resize crop box to any dimension, center-drag moves it, rule-of-thirds grid overlay, `expo-image-manipulator` applies the crop in real image pixel coords; replaces the native fixed-square `allowsEditing` picker
- [x] **Dynamic barcode container** - uses `onLoad` aspect ratio + `maxHeight: 150` so the container wraps the cropped image proportionally (wide barcodes render ~94px tall; square QR codes cap at 150px); no fixed-height letterboxing
- [x] **Fullscreen barcode viewer** - tapping barcode in Coupon Detail opens a full-screen modal for easy store scanning; image editing restricted to Edit Coupon form only
- [x] **Dynamic gift card URL** - optional `giftcard_url` field on coupons; Add/Edit forms accept a URL as an alternative to code/image; Coupon Detail shows "Open Live Gift Card" button (taps `expo-web-browser`) instead of static image block when URL is set; server stores URL as metadata (invariant preserved)
- [x] Coupon search - live local filter by store name on home screen (search bar + clear button)
- [x] Expired coupon auto-update - on load, active coupons past expiry date are patched to `expired`
- [x] Token expiry handling - 401 interceptor in `api.ts` triggers `signOut` via `AuthContext`
- [x] Store locator ("Where to use") - finds nearby stores via Google Places, sorted by distance

### Infrastructure
- [x] Node.js + Express server
- [x] **AWS DynamoDB** via `@aws-sdk/lib-dynamodb` Document Client (Users, Coupons, Groups tables)
- [x] **AWS Cognito** for auth (User Pool: `us-east-1_gVgsfA5EG`, PreSignUp Lambda for auto-confirm)
- [x] **AWS Lambda** - server runs serverless via `serverless-http` wrapping Express. No EC2, no PM2, no Elastic IP. IAM role (`LabRole`) assigned directly to Lambda for AWS auth.
- [x] **AWS API Gateway HTTP API** (`couplet-api`) - permanent public URL `https://ij27gn1sg9.execute-api.us-east-1.amazonaws.com`, routes `ANY /{proxy+}` to Lambda. Auto-deploy enabled.
- [x] CORS enabled on server
- [x] `.env.example` files for both client and server
- [x] TypeScript on both client and server
- [x] `expo-secure-store` for token storage
- [x] `AsyncStorage` for coupon codes and images

---

## How to Run

### Each Lab Session (Backend)
Nothing to do - Lambda runs on-demand. No instance to start, no PM2, no SSH.
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
npm start
```
Scan the QR code with Expo Go. The app talks to the Lambda backend (via API Gateway) using `EXPO_PUBLIC_API_URL` in `client/.env` (gitignored).

P2P coupon transfer deliberately uses browser WebRTC inside a hidden WebView rather than `react-native-webrtc`, specifically so the project keeps running in Expo Go - the native module would force a custom dev client, which on iOS needs a Mac or a paid Apple Developer account. Verified on-device: `react-native-webview` is in Expo SDK 57's `bundledNativeModules.json` (13.16.1), and WebRTC works inside it (secure context via `baseUrl: 'https://localhost'`, SDP + ICE gathering confirmed). Install WebView with `npx expo install react-native-webview`, never plain `npm install`, so the SDK-pinned version is kept.

### Server env var for the coupon-code encryption key
`NOTIFICATION_CODE_KEY` - 32-byte base64 key used by `server/src/lib/codeCrypto.ts` to encrypt coupon codes at rest (offline-fallback + P2P-rescue notification rows). Generate once with `openssl rand -base64 32` and set it manually in the Lambda's environment variables (no IaC in this repo).

### Manual DynamoDB setup on the Notifications table
Both steps are console-only (no IaC in this repo):
1. **TTL** on the **`expires_at`** attribute. One attribute serves two retention rules: 72h while a row still carries an unconsumed `coupon_code`, 30 days otherwise. (Renamed from `code_expires_at`, which only ever covered code rows and left every other notification immortal.)
2. **GSI `user_id-created_at-index`** - partition key `user_id`, sort key `created_at`, projection **All**. The base table's sort key is a random `uuidv4`, so this index is the only way to get "newest first"; without it `getNotificationsForUser` falls back to reading the whole partition and logs `[notifications] GSI query failed`.

---

## Key File Map

```
client/
  app/
    (auth)/
      welcome.tsx         - 4-phase animated entry: C centers → slides + shrinks → types OUPLET → tagline → CTA
      login.tsx           - underline inputs + coral button
      register.tsx        - same, with password strength hint + match indicator
    (tabs)/
      _layout.tsx         - tab bar config (3 tabs: index, add, connections)
      index.tsx           - My Coupons: list, FAB, category filter, pull-to-refresh
      add.tsx             - Add Coupon: form + native date picker + live-masked balance input
      connections.tsx     - Groups: list, create group modal, opens GroupDetail
    group/
      [id].tsx            - Group page (redesigned): header, members strip, Share button, filter sheet, sender-attributed coupon cards
    edit-profile.tsx      - Edit Profile: username + phone + profile photo (resize/upload via PUT /auth/me/photo)
  components/
    CSymbol.tsx           - C icon from logo-c.png asset (size prop)
    CoupletLogo.tsx       - wordmark: CSymbol + "OUPLET" text, size/tagline props
    SplashScreen.tsx      - reusable fade-in/scale splash overlay (isLoading + onComplete)
    CouponCard.tsx        - solid-color card with badge for used/expired
    CouponDetail/         - coupon detail/edit (index + CouponDisplay, CouponEditForm, CouponHeader, DatePickerSheet); image picker, Share to Group, redeem modal
    GroupCard.tsx         - group summary card (name, member count, admin badge)
    GroupDetail.tsx       - members list + shared coupons + add/remove/revoke + pending invites
    NotificationPanel.tsx - slide-up notification panel (expiry alerts + group invite cards)
    rn.tsx                - Text/TextInput wrappers with font scaling locked (allowFontScaling=false)
    WebRTCBridge.tsx      - hidden 1x1 WebView hosting the P2P peer connections (root-mounted, crash-remounting)
  context/
    AuthContext.tsx       - token storage, user state, login/logout
  services/
    api.ts                - all HTTP calls (coupons + groups + user search + auth sync)
    cognito.ts            - Cognito signUp/signIn via amazon-cognito-identity-js
    webrtc.ts             - Stage-2 P2P bridge driver: session/callback map, injectJavaScript command channel
    webrtcBridgeHtml.ts   - inline WebView page holding the real RTCPeerConnections (ICE buffering, ack/timeout)
  storage/
    couponStorage.ts      - AsyncStorage helpers for codes, images, and local avatar fallback
  utils/
    format.ts             - money formatting: formatBalance + live input masking (formatAmountDisplay / parseAmountInput)

server/src/
  app.ts                  - Express app setup + route registration (shared by local + Lambda)
  index.ts                - local dev entry (listens on PORT via ts-node-dev)
  lambda.ts               - AWS Lambda entry; branches HTTP (serverless-http) vs WebSocket on requestContext
  lib/
    dynamo.ts             - DynamoDB Document Client + table-name config
    cognito.ts            - Cognito JWT verifier setup
    websocket.ts          - API Gateway Management client; pushToUser / code-stripping notify helpers
    codeCrypto.ts         - AES-256-GCM encrypt/decrypt for at-rest coupon codes (NOTIFICATION_CODE_KEY)
  middleware/
    auth.ts               - Cognito JWT verification via aws-jwt-verify
  repositories/           - per-entity DynamoDB data access (split from the old db.ts)
    users.ts              - users incl. phone_number + profile_image (setUserProfileImage)
    coupons.ts · groups.ts · notifications.ts · connections.ts
  routes/
    auth.ts               - POST /auth/sync, GET /auth/me, PATCH /auth/me (profile), PUT /auth/me/photo (profile image)
    coupons.ts            - CRUD for coupon metadata + POST /:id/redeem (owner) + GET /:id/groups (owner-only, which groups it's shared to) (auth-protected)
    groups.ts             - CRUD for groups + members + coupon sharing + invitations + POST /:id/coupons/:couponId/redeem (any member) + PUT /groups/:id/photo (auth-protected)
    invitations.ts        - GET /invitations (pending invites for current user)
    notifications.ts      - GET /notifications, mark-read, delete
    users.ts              - GET /users/search
  ws/
    handler.ts            - WebSocket $connect / $disconnect / $default (JWT auth, connection store, WebRTC signaling relay)
  services/
    crawler.ts            - store/coupon metadata crawler
    redemption.ts         - shared redeem logic for both redeem routes (atomic apply + coupon_used notify)
```

### Real-time Notifications & Coupon Relay (WebSocket)
- [x] **API Gateway WebSocket API** served by the same Lambda (handler branches HTTP vs WS on `requestContext.connectionId`)
- [x] `$connect` verifies the Cognito JWT (`?token=`) and stores the socket in **`Couplet-Connections`** (PK `connection_id`, GSI `user_id-index`); `$disconnect` removes it
- [x] `notifyUser()` inserts a notification **and** pushes it live to the user's sockets, **code-stripped** (coupon_code never in a WS notification payload)
- [x] Live delivery for `group_invite`, `group_share`, `coupon_revoked` - appears instantly while app is open, no refresh
- [x] Client `NotificationsProvider` owns the socket (AppState reconnect, exp. backoff, 5-min ping keepalive), renders a global in-app **banner**, exposes `revision` (drives home-screen live refresh)
- [x] **Clickable notifications** - tap a banner or panel row → deletes the notification + deep-links to `/group/[id]`
- [x] **Local OS notifications (Tier 2, `expo-notifications`)** - in-app banner when the app is on-screen, real system/tray notification (sound) when backgrounded/not focused; works in Expo Go (no dev build)
- [x] **Catch-up on resume** - returning to the app re-polls `GET /notifications`, fires OS notifications for items missed while suspended (capped 3 + summary), refreshes badge; cold-start baseline suppresses spam for pre-existing unread
- [x] **OS-notification tap routing** - opens the app, deletes the notification, deep-links to the group (same handler Tier 3 will reuse)
- [x] **Stage-2 coupon-code transfer (WebRTC)** - the share response includes `online_recipient_ids`; the sharer's client negotiates an `RTCPeerConnection`/`RTCDataChannel` per online recipient (`client/services/webrtc.ts`), with the server relaying only opaque SDP offer/answer + ICE candidates via the WS `$default` route (`webrtc-offer`/`webrtc-answer`/`webrtc-ice-candidate`/`webrtc-cancel`, `server/src/ws/handler.ts`) - the code itself never touches the server for online recipients. Offline recipients still get `coupon_code` persisted on their `group_share` notification, now AES-256-GCM encrypted at rest (`server/src/lib/codeCrypto.ts`) with a 72h TTL (`expires_at`); the same persistence path doubles as a rescue fallback (`POST /groups/:id/coupons/:couponId/rescue-code`) when a P2P negotiation to an online recipient fails (no TURN server - STUN only). Consumed codes are cleared immediately via `DELETE /notifications/:id/code`. The recipient saves the code **silently** - a single `group_share` notification is the only user-facing alert per shared coupon. The peer connections run inside a hidden 1×1 WebView mounted at the app root (`client/components/WebRTCBridge.tsx` + `client/services/webrtcBridgeHtml.ts`), driven over an `injectJavaScript`/`postMessage` bridge - this keeps the whole app on plain Expo Go, no native build required
- [x] **Live redemption notifications** - every redemption of a shared coupon tells everyone else who can see it, **whether the owner or a non-owner did it**: `coupon_used` ("*Store* coupon used up - *Name* used the last of it, nothing left") when it's finished, `coupon_partial_redeem` ("*Store* coupon partly used - *Name* redeemed ₪60.00, ₪40.00 left") otherwise. A partial redeem that drains the balance reports as finished - what matters to others is that it's gone, not which button did it. Both flow through the existing generic panel/banner/OS-notification rendering unchanged.
  - **Notification ordering (latent bug, predates this work).** The Notifications table is keyed `{user_id, notification_id}` and `notification_id` is a random `uuidv4`, so `ScanIndexForward: false, Limit: 50` never returned "the 50 newest" as its comment claimed - it returned the 50 highest random UUIDs. Past 50 notifications, rows were dropped arbitrarily, including `group_share` rows carrying an encrypted coupon-code fallback: recipients then found no code and a share silently arrived empty. Only surfaced once redemption notifications pushed test accounts past 50. Also fixed `markAllNotificationsRead`, which was only marking an arbitrary 50 read and could leave the unread badge stuck.
  - **Retention + ordering, done properly.** The first fix read the user's whole partition and sorted in memory - correct but wasteful, and it left the real problem untouched: **notifications were never deleted.** Only code-carrying rows expired; invites, shares, revokes and every redeem accumulated forever, which is what made reading a partition expensive to begin with. Two fixes, each needing a **manual console step** (see setup section above):
    - **TTL.** DynamoDB permits one TTL attribute per table, so `code_expires_at` became `expires_at` and serves both rules: 72h while a row carries an unconsumed code, 30 days as ordinary history. `clearNotificationCode` now *resets* the TTL to 30 days rather than removing the attribute - dropping it left the row immortal, which was the leak.
    - **GSI `user_id-created_at-index`.** `getNotificationsForUser` queries it directly for the newest 50, with a fallback to the full-partition scan (plus a `[notifications] GSI query failed` warning) so the index can be created or backfilled without breaking notifications. `rescueCode` deliberately stays on the **base table with `ConsistentRead`** - indexes are eventually consistent and cannot be read consistently, and it runs seconds after the row is written, so a lagging index would strand the code. `markAllNotificationsRead` likewise uses a server-side filter on the base table, since it needs completeness rather than ordering.
  - **Redeem-all could report a false success.** The partial path is protected by its atomic balance condition, but `markCouponUsed` is unconditional - redeeming all on an already-drained coupon "succeeded" having redeemed nothing. Now 409. Client-side, any rejected redeem closes the coupon detail and refreshes the list: a rejection means that screen's copy is stale, and leaving it open invites another attempt against the same stale numbers.
  - **Silent live refresh on edits.** Editing a shared coupon left other members' group screens stale. `pushCouponUpdated` sends a live-only `coupon_updated` WS event (via `pushToUser`) that just calls `bump()` - no notification row, no banner, no OS alert, and only when a group-visible field actually changed. An edit is a correction, not an event: the need is fresh data, not an interruption.
  - **Group screen gained pull-to-refresh**, and `fetchGroup` now logs failures even in silent mode. A silent background refresh that failed left the screen on stale data with nothing to indicate it - which presented exactly like a rendering bug ("the USED badge doesn't appear for the owner") when it was really a refresh that never landed.
  - **Fan-out is keyed by user, not by group.** A coupon shared to several groups with overlapping membership was notifying the same person once per group; `notifyCouponRecipients` now dedupes to one notification per person, with the first matching group supplying the deep-link. Copy lives in the service, fan-out in the repository.
  - **Non-owners previously had no server-side path to redeem at all** - `PATCH /coupons/:id` is owner-gated, and the group screen's redeem buttons were wired to a no-op / the owner-gated call, so a member tapping "Redeem" either did nothing or silently failed. Redemption is now its own operation on both sides: `POST /coupons/:id/redeem` (owner) and `POST /groups/:id/coupons/:couponId/redeem` (any group member), sharing `server/src/services/redemption.ts` - identical semantics and notifications, only authorization differs. `PATCH /coupons/:id` remains the general-purpose *edit* endpoint.
  - **Redemption is atomic, not an absolute write.** The body is `{redeem_all:true}` or `{amount:N}` - never a client-computed balance. Opening redemption to every group member makes concurrent redeems of one coupon realistic, and a blind `SET balance = :value` loses updates (₪100 coupon, A redeems ₪60 and B ₪50 at once → ₪110 spent). `redeemCouponAmount` (`server/src/repositories/coupons.ts`) uses `SET balance = balance - :amt` with `ConditionExpression balance >= :amt`, returning 409 on conflict. Side benefit: DynamoDB decimal arithmetic replaces the client's `parseFloat(x.toFixed(2))`, removing float drift on money.
  - **Notifications are awaited before `res.json()`.** On Lambda the execution environment freezes once the response returns, so fire-and-forget work started after it may never run - fatal for a feature whose entire point is the notification. Guarded on a genuine `→used` transition so a double-tap or retry can't re-notify everyone.
  - Client: `CouponDisplay`'s two redeem flows (full + partial) unified behind one `onRedeem` prop supplied by the parent screen, so My Coupons and the Group screen each pick the right endpoint; the server response is now the authority on the resulting balance/status. `NotificationsContext` exposes `bump()` so a screen can refresh-signal its own other mounted screens right after a local redeem - this also closed a pre-existing gap where redeeming in My Coupons never live-updated the group screen on the same device. Added a "USED" badge + disabled action button to the group feed, which had no status indicator at all.
  - **Owner-only controls hidden for non-owners.** `CouponDetail` is opened by non-owners from the group screen, but still showed Edit / Share to Group / Delete - the first two fail against owner-gated endpoints and Delete was wired to a no-op, so it looked destructive and silently did nothing. It now derives `isOwner` from `useAuth` and renders those three only for the owner.
  - **Edit-refresh missed the actor's own other screens.** `pushCouponUpdated` deliberately skips the actor (their editing screen already knows), but nothing else called `bump()` after a successful edit save - so an owner editing from My Coupons saw the Groups tab stay stale until a manual pull. Fixed by calling `bump()` in both places an edit can be saved from (`(tabs)/index.tsx`'s `handleUpdate`; the group screen's own `onUpdate`, which also now syncs `group.coupons` there, matching how redeem already does).
  - **Coupon *codes* going stale after an edit - a gap the metadata-refresh fix didn't cover.** Editing a coupon's code never touched the server at all (same invariant as the original share), so recipients who'd already received the old code had no way to learn a new one existed - `pushCouponUpdated`'s generic WS nudge can't carry it either, since that payload passes through the server. New `GET /coupons/:id/groups` (owner-only) tells the owner's client where the coupon is shared; `CouponEditForm` detects the code changed and calls `deliverCouponCode` (`client/services/couponSharing.ts` - factored out of what were two separate copies of the same P2P-kickoff logic, now the one place both the original share and this reuse) for each. `POST /groups/:id/coupons/:couponId` takes `code_updated: true`: online recipients get the new code purely via P2P, no DB row; offline recipients get a `coupon_code_sync` fallback row (encrypted, 72h TTL, same mechanics as `group_share`'s) marked `read: true` and explicitly excluded from ever becoming a banner/OS-notification/panel row (`dispatchServerNotification`'s type guard) - an edit is a correction, not an event, matching the metadata-refresh precedent. Consumption (index.tsx's `load()`, the group screen's `handleOpenCouponDetail`) treats it the same as `group_share`, except the group screen now checks unconditionally rather than only when no local code exists yet, since an update must overwrite a stale one.
  - **Over-redemption is blocked in the UI, not just punished after the fact.** Partial-redeem validation is derived from the input (never stored, so button and message can't drift): the Confirm button is disabled and an inline message states the ceiling (`That's more than the ₪X left on this coupon.`) instead of the old post-submit alert. The only silently-disabled state is "nothing typed yet". Partial redeem is hidden entirely for coupons with no tracked balance. The server check remains the actual enforcement - the client can't be trusted, and the 409 race (someone else drained it first) is still real.
- [x] Resilient: with `EXPO_PUBLIC_WS_URL` unset the socket no-ops and the app falls back to poll-on-focus
- Setup: create the `Couplet-Connections` table + GSI, a WebSocket API (routes `$connect`/`$disconnect`/`$default`, route selection `$request.body.action`) → same Lambda; set `DYNAMODB_CONNECTIONS_TABLE`, `WS_API_ID`/`WS_STAGE` (server) + `EXPO_PUBLIC_WS_URL` (client)

---

## Still To Do

### Core Features

- [x] **True P2P coupon transfer (Stage 2)** - done: WS is signaling-only, code travels via `RTCDataChannel`. Still TODO: relay the coupon **image** over the same channel; a TURN server (currently STUN-only, so P2P can fail behind symmetric/carrier-grade NAT - mitigated by the encrypted rescue-code fallback, not solved).
- [x] **Rescue-code lookup scans only recent notifications** - fixed, and the underlying cause turned out to be worse than described. See "Notification ordering" below: the 50-row window wasn't even chronological, so `rescueCode` was searching an arbitrary subset. It now searches the recipient's full history.
- [ ] **P2P transfer - untested scenarios.** Verified on real devices: same-WiFi P2P (full ICE→data-channel→ack, ack sent only after `saveCouponCode` persists - confirmed via log ordering), gift-card-link coupons now reach recipients (`giftcard_url` added to `GET /groups/:id`'s coupon mapping), the "Share anyway?" warning for coupons with no code/URL, and the offline/failed-P2P encrypted rescue fallback (confirmed via DynamoDB: correct ciphertext length, exact 72h TTL, decrypts correctly on read, row cleared on consumption). Also verified: `useRefreshOnNotification` (live screen refresh on notification, no tap needed) works for share and revoke. Still to verify:
  - **Cross-network P2P** - devices on different networks (e.g. one on cellular). All testing so far succeeded via local mDNS host candidates on the same WiFi; cross-network depends on STUN server-reflexive candidates, which is unconfirmed. If it fails, the encrypted rescue path already covers it - known NAT limitation, not a bug.
  - **Multiple simultaneous online recipients** - 3+ group members online at once, meaning the sharer's WebView opens multiple concurrent `RTCPeerConnection`s. Plausible but unproven.
  - **Which path produces a given rescue-code row** - confirmed the fallback works, but not yet distinguished "recipient detected offline immediately" from "the 25s RN-side watchdog timed out a stalled negotiation." Confirm via a non-empty `[share] online recipients: [...]` log followed by a `[p2p] session failed` line.
- [ ] **Expiration notifications** - Server should check expiration dates and fire push notifications before coupons expire via **AWS SNS** (Phase 3).
- [ ] **Coupon code type selector** - When adding a coupon, let users specify: text code / barcode / QR code, so the detail screen can render it appropriately.
- [ ] **Group admin transfer** - Allow admin to hand off the admin role to another member. Currently admin is fixed at creation.
### UI / UX

- [ ] **Group coupon count accuracy** - `coupon_id_list.length` may include revoked or deleted coupons. Ensure the count shown on GroupCard reflects only active shared coupons.

### Auth

- [ ] **Forgot password** - "Forgot password?" link on login screen → user enters email → Cognito sends reset code → user enters code + new password. Uses `forgotPassword()` + `confirmPassword()` from `amazon-cognito-identity-js`.
- [ ] **Change password** - Option in settings/profile for logged-in users to change their password. Uses `changePassword()` with old + new password (no email code needed).

### Security & Polish
- [ ] **Rate limiting** - Add `express-rate-limit` to auth endpoints to prevent brute-force.
- [ ] **Input validation on server** - Some routes lack validation (balance should be ≥ 0, status should be enum-checked). Add `zod` or `express-validator`.
- [x] **Production deploy** - Server running on Lambda via API Gateway at `https://ij27gn1sg9.execute-api.us-east-1.amazonaws.com`, client `EXPO_PUBLIC_API_URL` set.

### Gmail Coupon Scanner (Phase 1 - MVP)
- [x] `POST /gmail/scan` - refreshes the access token, runs `users.messages.list` with a keyword `q` filter (Hebrew + English coupon/voucher/promo/discount terms, `newer_than:30d` on first run then `after:<last_scan>`), fetches From/Subject/Date only for matches, upserts keyed by `user_id + message_id` so re-scans don't duplicate
- [x] `GET /gmail/candidates` - returns the stored list
- [x] Client: "Scan Gmail for Coupons" in the settings drawer → `client/app/gmail-scan.tsx` (Connect Gmail / Scan now; list now shows only candidates with a detected, not-yet-owned coupon code, as tappable draft cards - see auto-draft bullet below)
- [x] **Two coexisting connect flows**, both landing on the same `Couplet-GmailConnections` table (candidates live as a list field on the same row - simpler than a second table for the small volumes this feature sees; `oauth_client: 'native' | 'web'` records which Google OAuth client issued each stored refresh token, since Google rejects refreshing it with the other client's credentials):
  - **Browser bridge (works in plain Expo Go)** - `POST /gmail/connect/start` (`server/src/lib/oauthState.ts`) mints a signed, 10-min state token (HMAC-SHA256, reuses `GMAIL_TOKEN_ENCRYPTION_KEY`) and returns a ready-to-open Google consent URL; the client opens it via `WebBrowser.openBrowserAsync` (`client/services/gmail.ts` → `connectGmailViaBrowser`). Google redirects to the public `GET /gmail/callback` (registered before `router.use(authMiddleware)` in `server/src/routes/gmail.ts` so it stays unauthenticated - identifies the user via the state token instead of a session), which does the full token exchange server-side and renders a plain HTML result page (`server/src/lib/oauthResultPage.ts`). The client has no synchronous success signal, so `client/app/gmail-scan.tsx` re-checks `GET /gmail/status` on `useFocusEffect` *and* on an `AppState` `'active'` listener (mirroring the pattern in `NotificationsContext.tsx`) - covers both "tapped Done in the browser" and "switched back via the app-switcher."
  - **Native (needs a Dev Client build)** - the original PKCE flow, `POST /gmail/connect` with a custom `cuplet://oauth2redirect` scheme straight back into the app; unusable from Expo Go (can't own a custom URL scheme), kept for later. `client/eas.json` has a `development` build profile (`eas build --profile development --platform android`, cloud build, no local Android Studio/Xcode needed).
  - Requires a **second Google OAuth client** (Web application type - the existing Desktop-app client can't register a plain `https://` redirect URI) with its own `GOOGLE_WEB_CLIENT_ID`/`GOOGLE_WEB_CLIENT_SECRET`/`GOOGLE_WEB_REDIRECT_URI` env vars, alongside the existing native `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. `server/src/lib/googleOAuth.ts` now takes a `ClientCredentials` param (`credentialsFor('native' | 'web')`) instead of hardcoding one client.
- [x] **Auto-draft coupons from scanned emails** - `POST /gmail/scan` now also fetches the full message body per new candidate (`getMessageBody`, `format=full` - no new OAuth scope needed, `gmail.readonly` already covers it) and runs regex-based `extractCouponFields` (`server/src/lib/gmail.ts`) to best-effort pull `{code, store, amount, expiration}`. These draft fields are **transient only** - returned in the scan response but never written to `GmailConnection.candidates` in DynamoDB (the code-never-touches-the-server invariant applies here too). `POST /gmail/candidates/:messageId/extract` backfills drafts on demand for candidates without a fresh extraction (old candidates, post-reinstall), restricted to message IDs already in the caller's stored candidates. Client caches drafts + a permanent dismissed-set locally (`client/storage/gmailDraftStorage.ts`); `gmail-scan.tsx` shows a candidate as a tappable draft-coupon card only when a code was found *and* it doesn't match an already-saved local coupon code (`getLocalCouponCodes`, compares against `couponStorage.ts` codes - the only place a "duplicate" check can happen, since codes never sync to the server). Tapping confirms, then opens `/(tabs)/add` pre-filled via `fromGmail`/`messageId`/`code`/`store`/`category`/`expiration`/`amount` route params (`useLocalSearchParams`); the Add Coupon screen's focus-reset effect now only blanks the form when arriving *without* those params. Regex extraction is best-effort (Hebrew + English labeled patterns for code/amount/expiration, store guessed from the `From` header) - the user always reviews/edits before saving.
- [x] **Extraction robustness fixes** - `CODE_LABEL_PATTERNS` now accepts quoted codes (`code: "SAVE20"`) and natural phrasing (`the code is: X`) via a shared `CONNECTOR`/`QUOTE` fragment, and rejects a captured token that's pure lowercase letters (the bare `\bcode` fallback previously matched ordinary prose like "code below" → `below`; real codes carry a digit or an uppercase letter). `AMOUNT_PATTERNS` also recognizes the Hebrew "amount" label (`הסכום`/`סכום`), not just a number adjacent to `₪`/`$`/`שקל`.
- [x] **Email preview before creating** - tapping a candidate opens `GmailEmailPreview.tsx` (full-screen modal) instead of a blind confirm alert: shows sender/subject/date, the extracted fields, and the actual email body, fetched on demand via `GET /gmail/candidates/:messageId/body` (capped at 4000 chars, never persisted, same ownership check as `/extract`) - lets the user verify it's really a coupon before creating one. Candidates with no detected code are now shown too (a muted "No code found" card, manual-entry copy) instead of silently hidden - previously indistinguishable from "nothing found." "Not now" no longer permanently dismisses a candidate; permanent removal is a separate delete button on the row.
- [ ] Phase 2 (future): swap/augment the regex extraction with an LLM-based pass for higher accuracy across varied retailer formats - deferred for now (cost/latency/new dependency), regex chosen as the MVP approach.
- [ ] Phase 3: push notifications for new candidates found

### Future / Optional

- [ ] **Location-based suggestions** - Notify users of coupons they own when they enter a store that accepts them.
- [ ] **Digital wallet integration** - Export to Apple Wallet / Google Wallet.
- [ ] **Coupon history screen** - View past `used` and `expired` coupons separately from active ones.
- [ ] **Group invite link / QR** - Join a group via shareable link or QR code (instead of admin-only invitation).
- [x] **Real-time group updates** - Live via the WebSocket API (notifications + coupon relay) while the app is open. Remaining: live group membership/coupon-list updates on the group screen itself, and background/closed-app push (needs a dev build - not possible in Expo Go).
