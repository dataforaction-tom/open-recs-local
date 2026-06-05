import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// AES-256-GCM. The 256-bit key is derived from the provided secret via SHA-256
// so any sufficiently long secret string works (mirrors how FILE_TOKEN_SECRET
// is used). Output format: base64(iv).base64(authTag).base64(ciphertext).
const IV_BYTES = 12; // 96-bit nonce, the GCM standard.

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptSecret(secret: string, plaintext: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(
    '.',
  );
}

export function decryptSecret(secret: string, payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) {
    throw new Error('invalid secret payload');
  }
  const [ivB64, authTagB64, ciphertextB64] = parts as [string, string, string];
  const key = deriveKey(secret);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  // .final() throws if the auth tag does not match (tampering / wrong key).
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
