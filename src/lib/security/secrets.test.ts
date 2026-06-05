import { describe, expect, it } from 'vitest';
import { encryptSecret, decryptSecret } from './secrets';

const SECRET = 'a-test-encryption-key-at-least-32-chars';

describe('secrets', () => {
  it('round-trips a value', () => {
    const cipher = encryptSecret(SECRET, 'sk-live-12345');
    expect(cipher).not.toContain('sk-live-12345');
    expect(decryptSecret(SECRET, cipher)).toBe('sk-live-12345');
  });

  it('produces a different ciphertext each call (random IV)', () => {
    const a = encryptSecret(SECRET, 'same');
    const b = encryptSecret(SECRET, 'same');
    expect(a).not.toBe(b);
    expect(decryptSecret(SECRET, a)).toBe('same');
    expect(decryptSecret(SECRET, b)).toBe('same');
  });

  it('throws when the ciphertext is tampered with', () => {
    const cipher = encryptSecret(SECRET, 'secret-value');
    const parts = cipher.split('.');
    // Flip a character in the ciphertext segment.
    const tamperedSegment = parts[2]!.startsWith('A')
      ? `B${parts[2]!.slice(1)}`
      : `A${parts[2]!.slice(1)}`;
    const tampered = `${parts[0]}.${parts[1]}.${tamperedSegment}`;
    expect(() => decryptSecret(SECRET, tampered)).toThrow();
  });

  it('throws when decrypted with the wrong key', () => {
    const cipher = encryptSecret(SECRET, 'secret-value');
    expect(() => decryptSecret('a-different-key-also-32-characters-x', cipher)).toThrow();
  });
});
