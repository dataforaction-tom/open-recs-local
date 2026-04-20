import type { StorageProvider } from './types';

type Entry = { bytes: Buffer; contentType?: string };

export function createFakeStorage(): StorageProvider {
  const map = new Map<string, Entry>();
  return {
    name: 'fake',
    async put(key, bytes, opts): Promise<void> {
      // exactOptionalPropertyTypes: only include contentType when actually provided
      const entry: Entry = opts?.contentType !== undefined
        ? { bytes, contentType: opts.contentType }
        : { bytes };
      map.set(key, entry);
    },
    async get(key): Promise<Buffer> {
      const entry = map.get(key);
      if (!entry) throw new Error(`fake storage: key not found: "${key}"`);
      return entry.bytes;
    },
    async exists(key): Promise<boolean> {
      return map.has(key);
    },
    async delete(key): Promise<void> {
      map.delete(key);
    },
    async signedUrl(key, _opts): Promise<string> {
      return `fake-storage://${key}`;
    },
  };
}
