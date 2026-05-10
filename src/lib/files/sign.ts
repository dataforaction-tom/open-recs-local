import { createHmac, timingSafeEqual } from 'node:crypto';

export type FileTokenPayload = {
  key: string;
  /** Unix epoch seconds at which the token stops being valid. */
  exp: number;
};

export type SignFileTokenOptions = {
  key: string;
  /** Seconds until expiry. Defaults to 5 minutes. */
  expiresInSeconds?: number;
};

const DEFAULT_TTL_SECONDS = 300;

function base64url(bytes: Buffer): string {
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(s: string): Buffer {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + ((4 - (s.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64');
}

function sign(secret: string, payload: string): string {
  return base64url(createHmac('sha256', secret).update(payload).digest());
}

/**
 * Signs a `{ key, exp }` payload with HMAC-SHA256 and returns
 * `<base64url-payload>.<base64url-signature>`. The token only encodes the
 * storage key — re-checking ownership at serve time is the route's job.
 */
export function signFileToken(secret: string, opts: SignFileTokenOptions): string {
  const exp = Math.floor(Date.now() / 1000) + (opts.expiresInSeconds ?? DEFAULT_TTL_SECONDS);
  const payload: FileTokenPayload = { key: opts.key, exp };
  const encodedPayload = base64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signature = sign(secret, encodedPayload);
  return `${encodedPayload}.${signature}`;
}

/**
 * Returns the token's payload (just `key`, since callers don't need the
 * timestamp) when the token is well-formed, untampered, and unexpired.
 * Returns null otherwise — never throws on malformed input.
 */
export function verifyFileToken(secret: string, token: string): { key: string } | null {
  if (typeof token !== 'string' || token.length === 0) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, providedSignature] = parts as [string, string];

  const expected = sign(secret, encodedPayload);
  const a = Buffer.from(expected);
  const b = Buffer.from(providedSignature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: FileTokenPayload;
  try {
    const json = fromBase64url(encodedPayload).toString('utf8');
    payload = JSON.parse(json) as FileTokenPayload;
  } catch {
    return null;
  }

  if (typeof payload.key !== 'string' || typeof payload.exp !== 'number') return null;
  if (Math.floor(Date.now() / 1000) >= payload.exp) return null;

  return { key: payload.key };
}
