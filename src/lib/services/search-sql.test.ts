import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type DbClient } from '../db/client';
import { recommendations, sources } from '../db/schema';
import type { RepoContext } from '../repositories/types';
import { runRecommendationsKeyword, runRecommendationsRrf } from './search-sql';

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

describe('runRecommendationsRrf', () => {
  it('ranks the row that wins on BOTH keyword and vector at the top', async () => {
    const [src] = await client.db
      .insert(sources)
      .values({ slug: 'rrf-both', title: 'rrf-both' })
      .returning({ id: sources.id });

    await client.db.insert(recommendations).values([
      {
        sourceId: src!.id,
        slug: 'rrf-both-a',
        title: 'badger conservation plan',
        body: 'badger habitats and corridors',
        embedding: vec(0),
      },
      {
        sourceId: src!.id,
        slug: 'rrf-both-b',
        title: 'wildlife policy guidance',
        body: 'general policy text',
        embedding: vec(0, 0.5),
      },
      {
        sourceId: src!.id,
        slug: 'rrf-both-c',
        title: 'unrelated finance memo',
        body: 'fiscal year accounts',
        embedding: vec(7),
      },
    ]);

    const hits = await runRecommendationsRrf(ctx(), {
      q: 'badger',
      queryEmbedding: vec(0),
      limit: 10,
    });

    expect(hits[0]?.title).toBe('badger conservation plan');
    const titles = hits.map((h) => h.title);
    const badgerIdx = titles.indexOf('badger conservation plan');
    const financeIdx = titles.indexOf('unrelated finance memo');
    expect(badgerIdx).toBeLessThan(financeIdx);
    expect(hits[0]?.rrfScore).toBeGreaterThan(0);
    expect(hits[0]?.keywordRank).toBe(1);
  });

  it('still ranks vector-only matches above non-matches', async () => {
    const [src] = await client.db
      .insert(sources)
      .values({ slug: 'rrf-vec', title: 'rrf-vec' })
      .returning({ id: sources.id });

    await client.db.insert(recommendations).values([
      {
        sourceId: src!.id,
        slug: 'rrf-vec-a',
        title: 'A',
        body: 'A',
        embedding: vec(3),
      },
      {
        sourceId: src!.id,
        slug: 'rrf-vec-b',
        title: 'B',
        body: 'B',
        embedding: vec(7),
      },
    ]);

    const hits = await runRecommendationsRrf(ctx(), {
      q: 'qqqzzznevermatch',
      queryEmbedding: vec(3),
      limit: 10,
    });

    expect(hits[0]?.title).toBe('A');
    expect(hits[0]?.keywordRank).toBeNull();
    expect(hits[0]?.vectorRank).toBe(1);
  });

  it('respects a sourceId filter inside both CTEs', async () => {
    const [s1] = await client.db
      .insert(sources)
      .values({ slug: 'rrf-f1', title: 'rrf-f1' })
      .returning({ id: sources.id });
    const [s2] = await client.db
      .insert(sources)
      .values({ slug: 'rrf-f2', title: 'rrf-f2' })
      .returning({ id: sources.id });

    await client.db.insert(recommendations).values([
      {
        sourceId: s1!.id,
        slug: 'rrf-f1-k',
        title: 'kingfisher in s1',
        body: 'kingfisher kingfisher',
        embedding: vec(0),
      },
      {
        sourceId: s2!.id,
        slug: 'rrf-f2-k',
        title: 'kingfisher in s2',
        body: 'kingfisher kingfisher',
        embedding: vec(0),
      },
    ]);

    const hits = await runRecommendationsRrf(ctx(), {
      q: 'kingfisher',
      queryEmbedding: vec(0),
      limit: 10,
      filters: { sourceId: s1!.id },
    });

    expect(hits.map((h) => h.title)).toEqual(['kingfisher in s1']);
  });
});

describe('runRecommendationsKeyword', () => {
  it('returns null rrfScore and vectorRank, populates keywordRank', async () => {
    const [src] = await client.db
      .insert(sources)
      .values({ slug: 'kw-only', title: 'kw-only' })
      .returning({ id: sources.id });

    await client.db.insert(recommendations).values([
      {
        sourceId: src!.id,
        slug: 'kw-only-a',
        title: 'auditor rotation guidance',
        body: 'rotate external auditors regularly',
        embedding: vec(0),
      },
      {
        sourceId: src!.id,
        slug: 'kw-only-b',
        title: 'unrelated note',
        body: 'completely different topic',
        embedding: vec(7),
      },
    ]);

    const hits = await runRecommendationsKeyword(ctx(), {
      q: 'auditor',
      limit: 10,
    });

    expect(hits[0]?.title).toBe('auditor rotation guidance');
    expect(hits[0]?.rrfScore).toBeNull();
    expect(hits[0]?.vectorRank).toBeNull();
    expect(hits[0]?.keywordRank).toBe(1);
    expect(hits.map((h) => h.title)).not.toContain('unrelated note');
  });
});
