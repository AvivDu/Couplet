import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

// AES-256-GCM at the application layer. Learner Lab's fixed LabRole can't create
// AWS KMS keys, so the Gmail refresh token is encrypted here instead of via KMS -
// same "never stored in plaintext" guarantee, no extra AWS IAM permissions needed.
// Swap in real KMS if this ever moves to a full AWS account.

function loadKey(): Buffer {
  const raw = process.env.GMAIL_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('GMAIL_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))")');
  }
  return key;
}

// Output format: "<iv>:<authTag>:<ciphertext>", each base64.
export function encryptToken(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map(b => b.toString('base64')).join(':');
}

export function decryptToken(encoded: string): string {
  const key = loadKey();
  const [ivB64, tagB64, dataB64] = encoded.split(':');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted token');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return plaintext.toString('utf8');
}
