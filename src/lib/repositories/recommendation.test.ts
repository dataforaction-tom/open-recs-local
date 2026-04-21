import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type Db, type DbClient } from '../db/client';
import type { Role } from '../providers/auth/types';
import { recommendations, sources } from '../db/schema';
import { searchRecommendationsKeyword } from './recommendation';
import type { RepoContext } from './types';

let pg: StartedPg;
let client: DbClient;

function ctxSystem(db: Db): RepoContext {
  return { db, auth: { user: { id: randomUUID() }, roles: ['admin'], isSystem: true } };
}
function ctxUser(db: Db, userId: string, roles: Role[] = ['viewer']): RepoContext {
  return { db, auth: { user: { id: userId }, roles, isSystem: false } };
}

/**
 * Seed a public source + one rec. We insert recs directly rather than going
 * through the pipeline — `tsv` is `GENERATED ALWAYS AS STORED` so insert is
 * enough to populate the search column.
 */
async function seedRec(args: {
  sourceTitle: string;
  sourceSlug: string;
  recSlug: string;
  title: string;
  body: string;
  isPrivate?: boolean;
  ownerUserId?: string | null;
}): Promise<{ sourceId: string; recId: string }> {
  const [src] = await client.db
    .insert(sources)
    .values({
      slug: args.sourceSlug,
      title: args.sourceTitle,
      isPrivate: args.isPrivate ?? false,
      ownerUserId: args.ownerUserId ?? null,
    })
    .returning({ id: sources.id });
  if (!src) throw new Error('seedRec: no source row');
  const [rec] = await client.db
    .insert(recommendations)
    .values({ sourceId: src.id, slug: args.recSlug, title: args.title, body: args.body })
    .returning({ id: recommendations.id });
  if (!rec) throw new Error('seedRec: no rec row');
  return { sourceId: src.id, recId: rec.id };
}

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
  client = createDb(pg.url);
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

describe('searchRecommendationsKeyword', () => {
  it('returns matching recs ranked so title hits outrank body-only hits', async () => {
    // `badger` in the title should outrank `badger` buried deep in a body.
    await seedRec({
      sourceSlug: 'rank-src-title',
      sourceTitle: 'Rank Source Title',
      recSlug: 'rank-rec-title',
      title: 'Protect the badger population',
      body: 'A general recommendation about wildlife conservation.',
    });
    await seedRec({
      sourceSlug: 'rank-src-body',
      sourceTitle: 'Rank Source Body',
      recSlug: 'rank-rec-body',
      title: 'General wildlife policy guidance',
      body:
        'This recommendation covers rural land use, farm subsidies, woodland ' +
        'management, hedgerow protection, river health, and occasionally the ' +
        'conservation status of a local badger colony under threat.',
    });

    const hits = await searchRecommendationsKeyword(ctxSystem(client.db), 'badger');
    expect(hits.length).toBeGreaterThanOrEqual(2);
    const titles = hits.map((hit) => hit.title);
    expect(titles).toContain('Protect the badger population');
    expect(titles).toContain('General wildlife policy guidance');
    // Title-hit rank should be >= body-hit rank. Shorter document with the
    // term in the title wins on cover density.
    const titleHit = hits.find((hit) => hit.title === 'Protect the badger population')!;
    const bodyHit = hits.find((hit) => hit.title === 'General wildlife policy guidance')!;
    expect(titleHit.rank).toBeGreaterThan(bodyHit.rank);
  });

  it('produces a snippet containing the matched term (with <b> markers)', async () => {
    await seedRec({
      sourceSlug: 'snippet-src',
      sourceTitle: 'Snippet Source',
      recSlug: 'snippet-rec',
      title: 'Improve hedgehog habitat corridors',
      body: 'Councils should ensure hedgehog-friendly gardens and road crossings.',
    });
    const hits = await searchRecommendationsKeyword(ctxSystem(client.db), 'hedgehog');
    const hit = hits.find((candidate) => candidate.title.includes('hedgehog'));
    expect(hit).toBeDefined();
    // `ts_headline` wraps matches in <b>...</b> by default.
    expect(hit!.snippet.toLowerCase()).toContain('hedgehog');
    expect(hit!.snippet).toMatch(/<b>/i);
  });

  it('respects the limit argument', async () => {
    // Seed 6 recs that all match `otter`.
    for (let idx = 0; idx < 6; idx += 1) {
      await seedRec({
        sourceSlug: `limit-src-${idx}`,
        sourceTitle: `Limit Source ${idx}`,
        recSlug: `limit-rec-${idx}`,
        title: `Otter protection plan ${idx}`,
        body: 'Waterway otter recovery body text.',
      });
    }
    const hits = await searchRecommendationsKeyword(ctxSystem(client.db), 'otter', 3);
    expect(hits).toHaveLength(3);
  });

  it('hides private-source recs from other users, shows them to the owner and to system', async () => {
    const ownerId = randomUUID();
    await seedRec({
      sourceSlug: 'priv-src',
      sourceTitle: 'Private Source',
      recSlug: 'priv-rec',
      title: 'Confidential kingfisher monitoring',
      body: 'Private fieldwork notes about a kingfisher breeding site.',
      isPrivate: true,
      ownerUserId: ownerId,
    });

    const other = ctxUser(client.db, randomUUID(), ['viewer']);
    const owner = ctxUser(client.db, ownerId, ['viewer']);

    const otherHits = await searchRecommendationsKeyword(other, 'kingfisher');
    expect(otherHits).toHaveLength(0);

    const ownerHits = await searchRecommendationsKeyword(owner, 'kingfisher');
    expect(ownerHits.map((hit) => hit.title)).toContain('Confidential kingfisher monitoring');

    const sysHits = await searchRecommendationsKeyword(ctxSystem(client.db), 'kingfisher');
    expect(sysHits.map((hit) => hit.title)).toContain('Confidential kingfisher monitoring');
  });

  it('returns an empty array when nothing matches', async () => {
    const hits = await searchRecommendationsKeyword(
      ctxSystem(client.db),
      'zzzzzzzzunlikelytermxyz',
    );
    expect(hits).toEqual([]);
  });
});
