import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFsStorage } from './fs';

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'fs-storage-test-'));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('createFsStorage', () => {
  it('round-trips a buffer under a nested key', async () => {
    const s = createFsStorage({ basePath: tmp });
    const bytes = Buffer.from('hello world');
    await s.put('sources/abc/original.pdf', bytes);
    expect(await s.exists('sources/abc/original.pdf')).toBe(true);
    const got = await s.get('sources/abc/original.pdf');
    expect(got.equals(bytes)).toBe(true);
  });

  it('throws a typed not-found error on missing keys', async () => {
    const s = createFsStorage({ basePath: tmp });
    await expect(s.get('nope.pdf')).rejects.toThrow(/key not found/);
  });

  it('rejects keys that escape the basePath via ../', async () => {
    const s = createFsStorage({ basePath: tmp });
    await expect(s.put('../escape.pdf', Buffer.from('x'))).rejects.toThrow(/escapes basePath/);
  });

  it('rejects absolute-path keys', async () => {
    const s = createFsStorage({ basePath: tmp });
    await expect(s.get('/etc/passwd')).rejects.toThrow(/escapes basePath/);
  });

  it('delete is a no-op on missing keys', async () => {
    const s = createFsStorage({ basePath: tmp });
    await expect(s.delete('not-there.pdf')).resolves.toBeUndefined();
  });

  it('exposes name=fs', () => {
    expect(createFsStorage({ basePath: tmp }).name).toBe('fs');
  });
});
