import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { StorageProvider } from './types';

export type FsStorageConfig = {
  /** Base directory for storage. Created on first use if absent. */
  basePath: string;
};

/**
 * Local filesystem storage adapter. The dev server and the worker share the
 * same base directory on disk, so uploads written by `POST /api/sources`
 * are visible to the worker's `source.parse` handler — fixes the
 * cross-process gap the fake (in-memory Map) adapter has.
 *
 * Path safety: keys are interpreted relative to `basePath` and must not
 * escape it. Resolved paths are checked against the base before any fs op.
 *
 * `signedUrl` returns a `file://` URL. The app doesn't currently use
 * `storage.signedUrl` directly — the source viewer signs its own HMAC
 * tokens via `signFileToken` and reads the file through
 * `/api/files/[token]`, which calls `storage.get()`. The `file://` URL
 * is here for completeness / future use.
 */
export function createFsStorage(config: FsStorageConfig): StorageProvider {
  const base = path.resolve(config.basePath);

  function resolveInside(key: string): string {
    const resolved = path.resolve(base, key);
    const rel = path.relative(base, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`fs storage: key escapes basePath: "${key}"`);
    }
    return resolved;
  }

  return {
    name: 'fs',
    async put(key, bytes): Promise<void> {
      const dest = resolveInside(key);
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, bytes);
    },
    async get(key): Promise<Buffer> {
      const src = resolveInside(key);
      try {
        return await readFile(src);
      } catch (err) {
        if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
          throw new Error(`fs storage: key not found: "${key}"`);
        }
        throw err;
      }
    },
    async exists(key): Promise<boolean> {
      try {
        await stat(resolveInside(key));
        return true;
      } catch {
        return false;
      }
    },
    async delete(key): Promise<void> {
      try {
        await unlink(resolveInside(key));
      } catch (err) {
        if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') return;
        throw err;
      }
    },
    async signedUrl(key): Promise<string> {
      return `file://${resolveInside(key)}`;
    },
  };
}
