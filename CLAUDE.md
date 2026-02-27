# Couplet - Coupon Wallet

A mobile application that manages all user coupons and discounts from multiple sources in one platform.

**Team:** Aviv Duzy, Roni Kenigsberg, Doron Shen-Tzur

---

## Architecture

Hybrid network model: **Client-Server** for auth/metadata/notifications + **Peer-to-Peer** for direct coupon sharing.

### Core Security Principle
Sensitive coupon data (codes, barcodes, QR codes) is **NEVER stored on the server**. It lives only on the user's device. The server holds non-sensitive metadata only (category, expiration date, status).

```
Client (React Native)
  ├── Local Storage  → coupon codes, QR/barcodes, owner ID, sharing permissions
  └── Network layer → HTTP to server, P2P to other clients

Server (Node.js + Express)
  ├── Auth (AWS Cognito)
  ├── Coupon metadata (no codes)
  ├── Group management
  ├── Notification scheduling (FCM)
  └── P2P peer discovery & session coordination
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native |
| Backend | Node.js with Express |
| Authentication | AWS Cognito |
| Push Notifications | Firebase Cloud Messaging (FCM) |
| P2P Communication | TBD (WebRTC is the leading candidate) |
| Database | TBD |

---

## Core Features

### 1. User Authentication
- Register and login via AWS Cognito
- Cognito issues JWT tokens used for all server API calls

### 2. Coupon Storage & Retrieval
- Coupon codes/barcodes/QR stored in **local device storage**
- Client syncs **metadata only** to the server on add/update
- Server stores: `coupon_id`, `owner_id`, `category`, `redeemable_stores`, `expiration_date`, `balance`, `status`

### 3. Coupon Management
- Add, view, update coupons
- Filter and sort by category or expiration date
- Coupon status: `active` / `expired` / `used`

### 4. Expiration Notifications
- Server monitors metadata expiration dates
- Sends FCM push notifications to relevant clients
- Server never accesses the actual coupon code during this process

### 5. Coupon Redemption
- Redemption happens **locally on the device**
- Client sends status update (`used`) to the server
- If balance reaches zero: coupon moves to history, group members are notified

### 6. Sharing Groups & P2P Coupon Transfer
- Users create named sharing groups (e.g., "Family", "Work")
- Connection requests sent and approved via the server
- Coupon data transferred **directly device-to-device** via P2P (server coordinates but does not relay data)
- Each coupon has a clear owner — the user who added it
- Owner can revoke coupon from a group at any time
- Removing a user from a group revokes their access and removes their owned coupons from the group

### 7. Search
- Search by user, by coupon, or by group
- Client sends store/search query to server → server returns matching metadata IDs → client filters local coupons by those IDs

---

## Database Schema (Server-Side)

### Users
```
user_id, email, user_name, password_hash, created_at, coupon_id_list
```

### Coupon (metadata only)
```
coupon_id, owner_id, category, redeemable_stores, expiration_date, balance, status
```

### Group
```
group_id, user_id_list, coupon_id_list, admin_user_id
```

### Client-Side Local Storage
```
coupon code / QR / barcode
coupon owner identifier
local sharing permissions
```

---

## User Flow (Network Perspective)

1. Client authenticates with AWS Cognito → receives JWT token
2. Client loads coupon data from local storage
3. Client syncs coupon metadata with the server
4. For coupon sharing: clients establish a P2P connection (server coordinates)
5. Coupon transferred directly device-to-device
6. Server updates metadata only

---

## Key Sequence Flows

| Sequence | Description |
|---|---|
| Add Coupon | Store code locally → send metadata to server |
| Create Group | Server stores group + assigns admin → sends invitations |
| Share Coupon | Server verifies permissions → coordinates P2P → data goes device-to-device |
| Expiration Notification | Server checks metadata → FCM push to clients |
| Coupon Redemption | Local redeem → send status update to server → notify group |
| Manage Group Members | Client sends update → server updates membership + revokes/grants coupon access |
| Search by Store | Client → server (store ID) → server returns matching coupon IDs → client filters local data |

---

## Optional Features (Future Scope)

- Location-based coupon suggestions when entering a commercial area
- Digital wallet integration

---

## Screens (Wireframes Defined)

- Login / Register screen
- Home / Coupon List screen (with search bar and category filters)
- Coupon Details screen (shows QR/barcode, balance, expiry)
- Add Coupon screen (manual input: code, description, expiry, balance)
- Connections screen (My Sharing Groups list)
- Group Coupon screen (coupons shared within a group)
