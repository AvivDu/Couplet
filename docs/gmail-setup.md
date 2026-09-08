# Gmail Coupon Scanner - Setup

Setup guide for the Gmail scanner feature. For what the feature does from a user's point of view, see the [README](../README.md#scan-your-inbox).

The scanner connects a user's Gmail account, searches it with a keyword query (never a full-inbox download), and pulls candidate coupon emails. For each new candidate it also fetches the message body and runs regex extraction to best-effort pull a coupon code, store, amount and expiration, which pre-fill a draft coupon the user reviews before saving.

Extracted fields are returned in the API response only - they are **never written to the database**, in keeping with the rule that coupon codes don't live on the server.

---

## Two ways to connect

Both end at the same backend logic (token exchange, encrypted storage, scanning):

- **Browser bridge - works in plain Expo Go.** Tapping "Connect Gmail" opens the phone's normal browser at Google's login page. Google redirects back to a plain `https://` page on our own backend (not into the app - Expo Go can't own a custom-scheme redirect), which finishes the connection server-side and shows a "you can close this tab" page. Switching back to the app picks up the completed connection automatically.
- **Native - requires a Dev Client build.** A PKCE flow with a custom `cuplet://` redirect straight back into the app. Available for teams building a Dev Client; the browser bridge is the path that works out of the box.

Google binds a refresh token to whichever OAuth client requested it, so each stored connection records which one it came from (`oauth_client: 'native' | 'web'`) and scans always refresh with the matching credentials.

---

## Setup - browser-bridge / Expo Go path

Do these in order.

1. **Google Cloud Console** - confirm the exact deployed API Gateway URL first (AWS Console → API Gateway → your API → Invoke URL), then create a **new, second** OAuth client: APIs & Services → Credentials → Create Credentials → OAuth client ID → **Web application** type. (A "Desktop app" client can't register a plain `https://` redirect URI - only Web application clients can.) Add `<invoke-url>/gmail/callback` as an Authorized redirect URI. Note the new client ID + secret.

2. **AWS Console** - create one DynamoDB table: `Couplet-GmailConnections`, partition key `user_id` (String). DynamoDB is schemaless beyond the key, so nothing else needs defining up front - see [Table schema](#table-schema) for the fields it will hold.

3. **Generate an encryption key:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
   This one key both encrypts stored refresh tokens and signs the short-lived proof used by the browser-bridge redirect - no second key needed.

4. **Fill in `server/.env`** (copy from `server/.env.example` if you haven't) and, when deploying, set the same values as Lambda environment variables:
   - `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_WEB_CLIENT_SECRET` (from step 1)
   - `GOOGLE_WEB_REDIRECT_URI` (the redirect URI from step 1)
   - `GMAIL_TOKEN_ENCRYPTION_KEY` (from step 3)
   - `DYNAMODB_GMAIL_CONNECTIONS_TABLE=Couplet-GmailConnections`

5. **Build + redeploy the Lambda:**
   ```bash
   cd server && npm run build
   ```
   Then (PowerShell) `Compress-Archive -Path dist, node_modules -DestinationPath lambda.zip -Force`, and upload it in the Lambda Console → Code → Upload from → .zip file.

   This step **must** be deployed for real: `/gmail/callback` is reached directly by Google over the public internet, so this flow can't be tested against a local `npm run dev` server.

6. **Test:** reload the app in Expo Go → drawer → "Scan Gmail for Coupons" → Connect Gmail → finish Google's consent screen in the browser that opens → switch back to the app (the browser's back button or the app-switcher both work) → the button should show "Connected: `<email>`" → Scan now.

---

<details>
<summary>Setup - native Dev Client path instead</summary>

1. Google Cloud Console - APIs & Services → Credentials → your (Desktop app) OAuth client → Authorized redirect URIs → add `cuplet://oauth2redirect`.
2. Fill in `server/.env` / Lambda env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
3. Fill in `client/.env`: `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (same client ID, no secret - safe to embed on the device).
4. One-time cloud build:
   ```bash
   cd client
   npm install -g eas-cli        # skip if already installed
   eas login                     # free Expo account
   eas build --profile development --platform android
   ```
   Takes ~10-15 min in the cloud, no Android Studio needed. When it finishes, scan the QR code it prints (or open the link on your phone) to install the `.apk`. From then on run `npx expo start --dev-client` and open the app from that installed build instead of Expo Go.
5. Test from the dev-client build → drawer → "Scan Gmail for Coupons" → Connect Gmail → Scan now.

</details>

---

## Reference

### Environment variables

| Variable | Where | Used by |
|---|---|---|
| `GOOGLE_WEB_CLIENT_ID` / `GOOGLE_WEB_CLIENT_SECRET` / `GOOGLE_WEB_REDIRECT_URI` | server only | Browser-bridge (Expo Go) flow |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | server + client (`EXPO_PUBLIC_GOOGLE_CLIENT_ID`) | Native (Dev Client) flow only |
| `GMAIL_TOKEN_ENCRYPTION_KEY` | server only | Both - AES-256-GCM encryption of stored refresh tokens (`server/src/lib/tokenCrypto.ts`) and signing of the browser-bridge state token |
| `DYNAMODB_GMAIL_CONNECTIONS_TABLE` | server only | Both |

### Table schema

`Couplet-GmailConnections`, PK `user_id` (String):

| Field | Notes |
|---|---|
| `gmail_email` | The connected account |
| `refresh_token_encrypted` | AES-256-GCM ciphertext, never stored in plaintext |
| `oauth_client` | `'native'` or `'web'` - which OAuth client issued the stored refresh token, since Google rejects refreshing it with the other one's credentials |
| `last_scan` | Timestamp; scans after the first use it to narrow the query |
| `created_at` | Connection timestamp |
| `candidates` | List of `{message_id, from, subject, date, created_at}` - headers only. Kept on the same row since one user's coupon-filtered inbox is small; each scan merges new ones keyed by `message_id` so re-scans don't duplicate |

### API routes

All under `server/src/routes/gmail.ts`. Every route except the callback requires authentication.

| Route | Purpose |
|---|---|
| `GET /gmail/callback` | Public - Google's redirect target for the browser-bridge flow; identifies the user via the signed state token, not a session |
| `POST /gmail/connect/start` | Mints the state token and returns the Google consent URL |
| `GET /gmail/status` | Whether the caller has a connection, and which address |
| `POST /gmail/connect` | Native flow only - exchanges a PKCE auth code for tokens server-side |
| `POST /gmail/scan` | Refreshes the access token, runs the keyword search, merges new candidate headers, and returns transient draft fields for new candidates |
| `GET /gmail/candidates` | The stored candidate list |
| `POST /gmail/candidates/:messageId/extract` | Re-runs extraction on demand for a candidate the client has no cached draft for |
| `GET /gmail/candidates/:messageId/body` | The raw email body, capped at 4000 chars, fetched on demand so the user can read the source email before creating a coupon |

The last two are restricted to message IDs already present in the caller's own stored candidates.
