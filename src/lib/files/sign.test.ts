import { afterEach, describe, expect, it, vi } from 'vitest';
import { signFileToken, verifyFileToken } from './sign';

const SECRET = 'test-secret-with-enough-bytes-32+';

afterEach(() => {
  vi.useRealTimers();
});

describe('signFileToken / verifyFileToken', () => {
  it('round-trips a key', () => {
    const token = signFileToken(SECRET, { key: 'src/abc/page-1.png' });
    expect(verifyFileToken(SECRET, token)).toEqual({ key: 'src/abc/page-1.png' });
  });

  it('returns null when the payload is tampered with', () => {
    const token = signFileToken(SECRET, { key: 'src/abc/page-1.png' });
    const [payload, signature] = token.split('.');
    expect(payload).toBeTruthy();
    expect(signature).toBeTruthy();
    // Flip one byte of the payload while keeping the same length / shape.
    const tamperedPayload = payload!.slice(0, -1) + (payload!.endsWith('A') ? 'B' : 'A');
    const tampered = `${tamperedPayload}.${signature}`;
    expect(verifyFileToken(SECRET, tampered)).toBeNull();
  });

  it('returns null when the signature is tampered with', () => {
    const token = signFileToken(SECRET, { key: 'src/abc/page-1.png' });
    const [payload, signature] = token.split('.');
    const tampered = `${payload}.${signature!.slice(0, -1)}A`;
    expect(verifyFileToken(SECRET, tampered)).toBeNull();
  });

  it('returns null after the token expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T00:00:00Z'));
    const token = signFileToken(SECRET, { key: 'k', expiresInSeconds: 60 });
    expect(verifyFileToken(SECRET, token)).toEqual({ key: 'k' });

    vi.setSystemTime(new Date('2026-05-10T00:01:01Z'));
    expect(verifyFileToken(SECRET, token)).toBeNull();
  });

  it('returns null for malformed token strings', () => {
    expect(verifyFileToken(SECRET, '')).toBeNull();
    expect(verifyFileToken(SECRET, 'not-a-token')).toBeNull();
    expect(verifyFileToken(SECRET, 'a.b.c')).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = signFileToken(SECRET, { key: 'k' });
    expect(verifyFileToken('different-secret-also-32+chars-long', token)).toBeNull();
  });
});
