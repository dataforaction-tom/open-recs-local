import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type DbClient } from '../db/client';
import { recommendations, sources } from '../db/schema';
import type { EmbeddingProvider } from '../providers/embedding/types';
import type { RepoContext } from '../repositories/types';
import { createQueryEmbeddingCache } from './query-embedding-cache';
import { searchRecommendations } from './search';

let pg: StartedPg;
let client: DbClient;

beforeAll(async () => {
  pg = await startPostgres();
  const migrated = await applyMigrations(pg.url);
  await migrated.sql.end();
  client = createDb(pg.url);
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function ctx(): RepoContext {
  return {
    db: client.db,
    auth: { user: { id: 'system' }, roles: ['admin'], isSystem: true },
  };
}

function vec(slot: number, value = 1): number[] {
  const v = new Array(768).fill(0);
  v[slot] = value;
  return v;
}

async function seedBadgerCorpus(prefix: string) {
  const [src] = await client.db
    .insert(sources)
    .values({ slug: `${prefix}-badger`, title: `${prefix}-badger` })
    .returning({ id: sources.id });

  await client.db.insert(recommendations).values([
    {
      sourceId: src!.id,
      slug: `${prefix}-a`,
      title: 'badger conservation plan',
      body: 'badger habitats and corridors',
      embedding: vec(0),
    },
    {
      sourceId: src!.id,
      slug: `${prefix}-b`,
      title: 'wildlife policy guidance',
      body: 'general policy text',
      embedding: vec(0, 0.5),
    },
    {
      sourceId: src!.id,
      slug: `${prefix}-c`,
      title: 'unrelated finance memo',
      body: 'fiscal year accounts',
      embedding: vec(7),
    },
  ]);
}

describe('searchRecommendations', () => {
  it('hybrid mode with cache reuses the embedding loader across identical queries', async () => {
    await seedBadgerCorpus('svc-1');
    const cache = createQueryEmbeddingCache({ ttlMs: 60_000, maxEntries: 8 });
    const embedSpy = vi.fn(async () => [vec(0)]);
    const provider: EmbeddingProvider = {
      name: 'fake',
      model: 'fake-m',
      dimensions: 768,
      embed: embedSpy,
    };

    const a = await searchRecommendations(
      { ctx: ctx(), q: 'badger', mode: 'hybrid' },
      { embedding: provider, cache },
    );
    const b = await searchRecommendations(
      { ctx: ctx(), q: 'badger', mode: 'hybrid' },
      { embedding: provider, cache },
    );

    expect(a[0]?.title).toBe('badger conservation plan');
    expect(b[0]?.title).toBe('badger conservation plan');
    expect(embedSpy).toHaveBeenCalledTimes(1);
    expect(typeof a[0]?.rrfScore).toBe('number');
  });

  it('keyword mode never calls the embedding provider', async () => {
    await seedBadgerCorpus('svc-2');
    const noEmbedSpy = vi.fn(async (): Promise<number[][]> => {
      throw new Error('should not be called');
    });
    const provider: EmbeddingProvider = {
      name: 'fake',
      model: 'fake-m',
      dimensions: 768,
      embed: noEmbedSpy,
    };

    const hits = await searchRecommendations(
      { ctx: ctx(), q: 'badger', mode: 'keyword' },
      { embedding: provider },
    );

    expect(hits[0]?.title).toBe('badger conservation plan');
    expect(noEmbedSpy).not.toHaveBeenCalled();
    expect(hits[0]?.rrfScore).toBeNull();
    expect(hits[0]?.vectorRank).toBeNull();
  });

  it('hybrid mode without embedding provider degrades to keyword and warns once', async () => {
    await seedBadgerCorpus('svc-3');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const hits = await searchRecommendations({ ctx: ctx(), q: 'badger', mode: 'hybrid' });

    expect(hits[0]?.title).toBe('badger conservation plan');
    expect(hits[0]?.rrfScore).toBeNull();
    expect(hits[0]?.vectorRank).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('hybrid mode passes filters through to the underlying RRF query', async () => {
    const [s1] = await client.db
      .insert(sources)
      .values({ slug: 'svc-4-s1', title: 'svc-4-s1' })
      .returning({ id: sources.id });
    const [s2] = await client.db
      .insert(sources)
      .values({ slug: 'svc-4-s2', title: 'svc-4-s2' })
      .returning({ id: sources.id });

    await client.db.insert(recommendations).values([
      {
        sourceId: s1!.id,
        slug: 'svc-4-k1',
        title: 'kingfisher in s1',
        body: 'kingfisher kingfisher',
        embedding: vec(0),
      },
      {
        sourceId: s2!.id,
        slug: 'svc-4-k2',
        title: 'kingfisher in s2',
        body: 'kingfisher kingfisher',
        embedding: vec(0),
      },
    ]);

    const provider: EmbeddingProvider = {
      name: 'fake',
      model: 'fake-m',
      dimensions: 768,
      embed: async () => [vec(0)],
    };

    const hits = await searchRecommendations(
      { ctx: ctx(), q: 'kingfisher', mode: 'hybrid', filters: { sourceId: s1!.id } },
      { embedding: provider },
    );

    expect(hits.map((h) => h.title)).toEqual(['kingfisher in s1']);
  });
});
