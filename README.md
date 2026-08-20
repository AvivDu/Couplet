# Couplet

A mobile coupon wallet app. Users store, manage, and share coupons — coupon codes, QR codes, and barcodes are stored only on the user's device. The server manages metadata, groups, and authentication but never handles sensitive coupon data.

**Team:** Aviv Duzy, Roni Kenigsberg, Doron Shen-Tzur

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile client | React Native (Expo) |
| Backend | Node.js + Express, deployed on AWS Lambda via `serverless-http` |
| API Gateway | AWS API Gateway HTTP API (REST) + WebSocket API (real-time) |
| Database | AWS DynamoDB |
| Auth | AWS Cognito |
| Notifications | Live over the API Gateway **WebSocket API** while the app is open + **local OS notifications** (`expo-notifications`); remote push when closed (AWS SNS) is planned (needs a dev build) |
| Store locator | Google Places API ("Where to use") |

---

## Project Structure

```
Couplet/
├── client/                                      # React Native (Expo) mobile app
├── server/                                      # Node.js + Express backend (runs on AWS Lambda)
├── Specification & Design Document - Couplet.pdf
├── CLAUDE.md                                    # Architecture, data model, feature spec (for contributors)
└── PROJECT_SUMMARY.md                           # Progress log and feature status
```

---

## How to Run

### Client

**Prerequisites:** Node.js, Expo Go installed on your mobile device.

1. Install dependencies:
   ```bash
   cd client
   npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   ```
   Fill in the following values in `client/.env`:
   | Variable | Description |
   |---|---|
   | `EXPO_PUBLIC_API_URL` | Base URL of the deployed backend (HTTP API) |
   | `EXPO_PUBLIC_COGNITO_USER_POOL_ID` | AWS Cognito User Pool ID |
   | `EXPO_PUBLIC_COGNITO_CLIENT_ID` | AWS Cognito App Client ID |
   | `EXPO_PUBLIC_WS_URL` | WebSocket API URL for live notifications + coupon relay (optional — app falls back to poll-on-focus if unset) |

3. Start the development server:
   ```bash
   npx expo start
   ```
   Scan the QR code with Expo Go on your device.

---

### Server

The production server runs on **AWS Lambda** — no instance to manage. After code changes, build and upload a new deployment package via the AWS Lambda console (see `PROJECT_SUMMARY.md` for the exact steps).

**For local development:**

1. Install dependencies:
   ```bash
   cd server
   npm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   ```
   Fill in the following values in `server/.env`:
   | Variable | Description |
   |---|---|
   | `AWS_REGION` | AWS region (e.g. `us-east-1`) |
   | `COGNITO_USER_POOL_ID` | AWS Cognito User Pool ID |
   | `COGNITO_CLIENT_ID` | AWS Cognito App Client ID |
   | `AWS_ACCESS_KEY_ID` | AWS credentials |
   | `AWS_SECRET_ACCESS_KEY` | AWS credentials |
   | `AWS_SESSION_TOKEN` | AWS session token (Learner Lab) |
   | `DYNAMODB_USERS_TABLE` | DynamoDB table name for users |
   | `DYNAMODB_COUPONS_TABLE` | DynamoDB table name for coupons |
   | `DYNAMODB_GROUPS_TABLE` | DynamoDB table name for groups |
   | `DYNAMODB_NOTIFICATIONS_TABLE` | DynamoDB table name for notifications |
   | `DYNAMODB_CONNECTIONS_TABLE` | DynamoDB table for WebSocket connections (PK `connection_id`, GSI `user_id-index`) |
   | `WS_API_ID` + `WS_STAGE` | WebSocket API ID + stage (used to build the push endpoint); or set `WS_API_ENDPOINT` directly |
   | `PORT` | Local server port (default: `3000`) |
   | `GOOGLE_PLACES_API_KEY` | Google Places API key (for store locator) |

3. Run the server:
   ```bash
   npm run dev       # hot-reload via ts-node-dev
   # or
   npm run build && npm start   # compile then run
   ```

---

## Gmail Coupon Scanner (Phase 1 — MVP)

Lets a user connect their Gmail account and scan their inbox for emails that might contain a coupon. Shows a plain list (sender, subject, date) — it does **not** read the coupon code itself or send notifications; those are later phases.

**Two coexisting ways to connect**, both ending at the same backend logic (token exchange, encrypted storage, scanning):
- **Browser bridge (works in plain Expo Go)** — tapping "Connect Gmail" opens the phone's normal browser to Google's login page. Google redirects back to a plain `https://` page on our own backend (not into the app — Expo Go can't catch a custom-scheme redirect), which finishes the connection server-side and shows a "you can close this tab" page. You switch back to the app manually; it picks up the completed connection on its own.
- **Native (needs a Dev Client build)** — the original PKCE flow with a custom `cuplet://` redirect straight back into the app. Only usable from a Dev Client build, not Expo Go — kept for whenever the team does pick that up.

Google binds a refresh token to whichever OAuth client requested it, so each stored connection records which of the two it came from (`oauth_client: 'native' | 'web'`) and scans always refresh with the matching credentials.

### Checklist to get this running (do these in order) — browser-bridge / Expo Go path

1. **Google Cloud Console** — confirm the exact deployed API Gateway URL first (AWS Console → API Gateway → your API → Invoke URL), then create a **new, second** OAuth client: APIs & Services → Credentials → Create Credentials → OAuth client ID → **Web application** type (the existing "Desktop app" client can't register a plain `https://` redirect URI — only Web application clients can). Add `<invoke-url>/gmail/callback` as an Authorized redirect URI. Note the new client ID + secret.
2. **AWS Console** — create one DynamoDB table: `Couplet-GmailConnections`, partition key `user_id` (String). (Full field list under Schema below — DynamoDB is schemaless beyond the key, so nothing else needs defining up front.)
3. **Generate an encryption key** — run `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and save the output. (This one key both encrypts stored refresh tokens and signs the short-lived proof used by the browser-bridge redirect — no second key needed.)
4. **Fill in `server/.env`** (copy from `server/.env.example` if you haven't) and, when deploying, the same values as Lambda environment variables (same pattern as `GOOGLE_PLACES_API_KEY`): `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_WEB_CLIENT_SECRET` (from step 1), `GOOGLE_WEB_REDIRECT_URI` (the URL from step 1), `GMAIL_TOKEN_ENCRYPTION_KEY` (from step 3), `DYNAMODB_GMAIL_CONNECTIONS_TABLE=Couplet-GmailConnections`.
5. **Build + redeploy the Lambda** — `cd server && npm run build`, then (PowerShell) `Compress-Archive -Path dist, node_modules -DestinationPath lambda.zip -Force`, then Lambda Console → Code → Upload from → .zip file. This part **must** be redeployed for real — `/gmail/callback` is reached directly by Google over the public internet, so this flow can't be tested against a local `npm run dev` server.
6. **Test**: reload the app in Expo Go → drawer → "Scan Gmail for Coupons" → Connect Gmail → finish Google's consent screen in the browser that opens → switch back to the app (either the browser's own back button or the app-switcher both work) → the button should show "Connected: `<email>`" → Scan now.

<details>
<summary>Optional: the native Dev Client path instead</summary>

1. Google Cloud Console — APIs & Services → Credentials → your (Desktop app) OAuth client → Authorized redirect URIs → add `cuplet://oauth2redirect`.
2. Fill in `server/.env` / Lambda env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
3. Fill in `client/.env`: `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (same client ID, no secret — safe to embed on the device).
4. One-time cloud build:
   ```bash
   cd client
   npm install -g eas-cli        # skip if already installed
   eas login                     # free Expo account — sign up if you don't have one
   eas build --profile development --platform android
   ```
   Takes ~10–15 min in the cloud, no Android Studio needed. When it finishes, scan the QR code it prints (or open the link on your phone) to install the `.apk`. From then on, run `npx expo start --dev-client` and open the app from that installed build instead of Expo Go — everything else in the app works from it exactly the same as before.
5. Test from the dev-client build → drawer → "Scan Gmail for Coupons" → Connect Gmail → Scan now.
</details>

### Reference: env vars and schema

| Variable | Where | Used by |
|---|---|---|
| `GOOGLE_WEB_CLIENT_ID` / `GOOGLE_WEB_CLIENT_SECRET` / `GOOGLE_WEB_REDIRECT_URI` | server only | Browser-bridge (Expo Go) flow |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | server + client (`EXPO_PUBLIC_GOOGLE_CLIENT_ID`) | Native (Dev Client) flow only |
| `GMAIL_TOKEN_ENCRYPTION_KEY` | server only | Both — encrypts stored refresh tokens (app-level AES-256-GCM, not AWS KMS — Learner Lab's fixed `LabRole` can't create KMS keys) and signs the browser-bridge's state token |
| `DYNAMODB_GMAIL_CONNECTIONS_TABLE` | server only | Both |

**Table schema** — `Couplet-GmailConnections`, PK `user_id` (String). Fields: `gmail_email`, `refresh_token_encrypted`, `oauth_client` (`'native'` or `'web'` — which OAuth client issued the stored refresh token, since Google won't let you refresh it with the other one's credentials), `last_scan`, `created_at`, `candidates` (list of `{message_id, from, subject, date, created_at}` — kept on the same row since one user's coupon-filtered inbox is small; each scan merges in new ones keyed by `message_id` so nothing duplicates).

### New files

**Backend:**
- `server/src/lib/tokenCrypto.ts` — AES-256-GCM encrypt/decrypt for refresh tokens.
- `server/src/lib/googleOAuth.ts` — exchanges auth codes for tokens and refreshes access tokens for either OAuth client; builds the browser-bridge's Google consent URL.
- `server/src/lib/oauthState.ts` — signs/verifies the short-lived token proving a Google redirect belongs to a specific logged-in user (browser-bridge flow only).
- `server/src/lib/oauthResultPage.ts` — the plain HTML "connected" / "cancelled" / "expired" pages shown in the browser after the redirect.
- `server/src/lib/gmail.ts` — Gmail API wrapper: builds the search query, lists candidate message IDs, fetches From/Subject/Date only.
- `server/src/repositories/gmailConnections.ts` — DynamoDB access for the one table.
- `server/src/routes/gmail.ts` — `GET /gmail/callback` (public), `POST /gmail/connect/start`, `GET /gmail/status`, `POST /gmail/connect`, `POST /gmail/scan`, `GET /gmail/candidates`.

**Client:**
- `client/services/gmail.ts` — triggers either connect flow and calls the endpoints above.
- `client/app/gmail-scan.tsx` — the Connect/Scan screen and candidate list, reachable from the settings drawer ("Scan Gmail for Coupons").

## Project Specification

[Design & Specification Document](./Specification%20%26%20Design%20Document%20-%20Couplet.pdf)
