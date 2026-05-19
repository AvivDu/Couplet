# Couplet

A mobile coupon wallet app. Users store, manage, and share coupons — coupon codes, QR codes, and barcodes are stored only on the user's device. The server manages metadata, groups, and authentication but never handles sensitive coupon data.

**Team:** Aviv Duzy, Roni Kenigsberg, Doron Shen-Tzur

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile client | React Native (Expo) |
| Backend | Node.js + Express, deployed on AWS Lambda via `serverless-http` |
| API Gateway | AWS API Gateway HTTP API |
| Database | AWS DynamoDB |
| Auth | AWS Cognito |
| Notifications | AWS SNS |

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
   | `EXPO_PUBLIC_API_URL` | Base URL of the deployed backend |
   | `EXPO_PUBLIC_COGNITO_USER_POOL_ID` | AWS Cognito User Pool ID |
   | `EXPO_PUBLIC_COGNITO_CLIENT_ID` | AWS Cognito App Client ID |

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
   | `PORT` | Local server port (default: `3000`) |
   | `GOOGLE_PLACES_API_KEY` | Google Places API key (for store locator) |

3. Run the server:
   ```bash
   npm run dev       # hot-reload via ts-node-dev
   # or
   npm run build && npm start   # compile then run
   ```

---

## Project Specification

[Design & Specification Document](./Specification%20%26%20Design%20Document%20-%20Couplet.pdf)
