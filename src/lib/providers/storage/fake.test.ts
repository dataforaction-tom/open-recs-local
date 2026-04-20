import { describe, expect, it } from 'vitest';
import { createFakeStorage } from './fake';

describe('fake storage provider', () => {
  it('put then get returns the exact bytes', async () => {
    const s = createFakeStorage();
    const payload = Buffer.from('hello');
    await s.put('a/b.txt', payload);
    const out = await s.get('a/b.txt');
    expect(out.equals(payload)).toBe(true);
  });

  it('exists reflects put and delete', async () => {
    const s = createFakeStorage();
    expect(await s.exists('x')).toBe(false);
    await s.put('x', Buffer.from('1'));
    expect(await s.exists('x')).toBe(true);
    await s.delete('x');
    expect(await s.exists('x')).toBe(false);
  });

  it('get throws on a missing key', async () => {
    const s = createFakeStorage();
    await expect(s.get('missing')).rejects.toThrow('fake storage: key not found: "missing"');
  });

  it('signedUrl returns the fake-storage scheme', async () => {
    const s = createFakeStorage();
    const url = await s.signedUrl('some/key');
    expect(url).toBe('fake-storage://some/key');
  });
});
