import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQueryEmbeddingCache, defaultQueryEmbeddingCache } from './query-embedding-cache';

afterEach(() => {
  vi.useRealTimers();
});

describe('query embedding cache', () => {
  it('returns the cached vector on hit, only invokes the loader once', async () => {
    const cache = createQueryEmbeddingCache({ ttlMs: 60_000, maxEntries: 8 });
    const loader = vi.fn(async () => [0.1, 0.2, 0.3]);

    const a = await cache.get('m', 'hello', loader);
    const b = await cache.get('m', 'hello', loader);

    expect(a).toEqual([0.1, 0.2, 0.3]);
    expect(b).toEqual(a);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('expires entries after ttlMs', async () => {
    vi.useFakeTimers();
    const cache = createQueryEmbeddingCache({ ttlMs: 1_000, maxEntries: 8 });
    const loader = vi.fn(async () => [0.4]);

    await cache.get('m', 'q', loader);
    vi.advanceTimersByTime(1_500);
    await cache.get('m', 'q', loader);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('evicts the oldest entry when full', async () => {
    const cache = createQueryEmbeddingCache({ ttlMs: 60_000, maxEntries: 2 });

    await cache.get('m', 'a', async () => [1]);
    await cache.get('m', 'b', async () => [2]);
    await cache.get('m', 'c', async () => [3]);

    const reload = vi.fn(async () => [99]);
    const value = await cache.get('m', 'a', reload);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(value).toEqual([99]);
  });

  it('keys by model name as well as query text', async () => {
    const cache = createQueryEmbeddingCache({ ttlMs: 60_000, maxEntries: 8 });

    await cache.get('m1', 'q', async () => [1]);
    const loader = vi.fn(async () => [2]);
    const v = await cache.get('m2', 'q', loader);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(v).toEqual([2]);
  });

  it('exports a module-level default cache singleton', () => {
    expect(defaultQueryEmbeddingCache).toBeDefined();
    expect(typeof defaultQueryEmbeddingCache.get).toBe('function');
  });
});
