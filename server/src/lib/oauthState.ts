import { createHmac, timingSafeEqual } from 'crypto';

// Proves a Google redirect back to /gmail/callback belongs to a specific logged-in
// user. Not classic session-bound CSRF state (the request that starts the flow and
// the request that completes it share no cookie/session) — the token itself is the
// credential: a signed assertion of "user X, valid until T" that only this server
// could have produced. Reuses GMAIL_TOKEN_ENCRYPTION_KEY as the HMAC key.

const STATE_TTL_MS = 10 * 60 * 1000;

function sign(payloadB64: string): string {
  return createHmac('sha256', process.env.GMAIL_TOKEN_ENCRYPTION_KEY!).update(payloadB64).digest('base64url');
}

export function createOAuthState(userId: string): string {
  const payloadB64 = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + STATE_TTL_MS })).toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyOAuthState(state: string): string | null {
  const [payloadB64, sig] = state.split('.');
  if (!payloadB64 || !sig) return null;

  const expectedSig = Buffer.from(sign(payloadB64));
  const actualSig = Buffer.from(sig);
  if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) return null;

  try {
    const { uid, exp } = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (typeof uid !== 'string' || typeof exp !== 'number' || Date.now() > exp) return null;
    return uid;
  } catch {
    return null;
  }
}
