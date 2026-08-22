import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

// At-rest encryption for coupon codes persisted as a fallback (offline share,
// or a failed P2P negotiation) on a notification row. Key is a 32-byte
// base64 string in NOTIFICATION_CODE_KEY (generate via `openssl rand -base64 32`,
// set manually in Lambda config — this repo has no IaC).
const key = Buffer.from(process.env.NOTIFICATION_CODE_KEY ?? '', 'base64');

// Fail loudly and early rather than letting Node throw a bare "Invalid key
// length" from deep inside a share request.
function requireKey(): Buffer {
  if (key.length !== 32) {
    throw new Error(
      'NOTIFICATION_CODE_KEY is missing or not a 32-byte base64 key — ' +
      'generate one with `openssl rand -base64 32` and set it in the Lambda environment.'
    );
  }
  return key;
}

// AES-256-GCM: output is base64(iv[12] | authTag[16] | ciphertext).
export function encryptCode(code: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', requireKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decryptCode(encoded: string): string {
  const buf = Buffer.from(encoded, 'base64');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', requireKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// Read path for stored codes. Rows written before at-rest encryption landed
// hold PLAINTEXT codes, and decrypting those throws — so a failure here is
// treated as "legacy plaintext" and returned as-is rather than breaking the
// whole notifications fetch. Remove this fallback once no pre-encryption rows
// can remain (they carry no TTL, so only after they've been consumed/deleted).
export function decryptStoredCode(stored: string): string {
  try {
    return decryptCode(stored);
  } catch {
    return stored;
  }
}
