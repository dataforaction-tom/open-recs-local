import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type Db, type DbClient } from '../db/client';
import type { Role } from '../providers/auth/types';
import { recommendations, sources } from '../db/schema';
import { seedUser } from '../../../tests/helpers/seed-user';
import {
  findRecommendationById,
  findSimilarRecommendations,
  searchRecommendationsKeyword,
} from './recommendation';
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
    const ownerId = await seedUser(client.db);
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

function vec(slot: number, value = 1): number[] {
  const v = new Array(768).fill(0);
  v[slot] = value;
  return v;
}

// Builds a vector that points along axis `primary` with a small tilt toward
// axis `tilt` (magnitude `tiltAmount`). Larger tilt → more cosine distance
// from a pure-axis vector. Useful for engineering deterministic distance
// ordering when self is a single-axis vector.
function tilted(primary: number, tilt: number, tiltAmount: number): number[] {
  const v = new Array(768).fill(0);
  v[primary] = 1;
  v[tilt] = tiltAmount;
  return v;
}

describe('findRecommendationById', () => {
  it('returns the rec with sourceSlug + sourceTitle joined', async () => {
    const sys = ctxSystem(client.db);
    const [src] = await client.db
      .insert(sources)
      .values({ slug: 'frbi-pub', title: 'FRBI Public', isPrivate: false })
      .returning({ id: sources.id });
    const [rec] = await client.db
      .insert(recommendations)
      .values({
        sourceId: src!.id,
        slug: 'frbi-rec-1',
        title: 'Sample rec',
        body: 'Sample body',
        embedding: vec(0),
      })
      .returning({ id: recommendations.id });

    const found = await findRecommendationById(sys, rec!.id);
    expect(found).not.toBeNull();
    expect(found?.title).toBe('Sample rec');
    expect(found?.body).toBe('Sample body');
    expect(found?.sourceSlug).toBe('frbi-pub');
    expect(found?.sourceTitle).toBe('FRBI Public');
  });

  it('returns null for an unknown id', async () => {
    const sys = ctxSystem(client.db);
    const found = await findRecommendationById(sys, randomUUID());
    expect(found).toBeNull();
  });

  it('returns null when the rec belongs to a private source the viewer cannot see', async () => {
    const otherUser = await seedUser(client.db);
    const sys = ctxSystem(client.db);
    const [src] = await client.db
      .insert(sources)
      .values({ slug: 'frbi-priv', title: 'priv', isPrivate: true, ownerUserId: otherUser })
      .returning({ id: sources.id });
    const [rec] = await client.db
      .insert(recommendations)
      .values({ sourceId: src!.id, slug: 'frbi-priv-rec', title: 'priv rec', body: '...' })
      .returning({ id: recommendations.id });

    const stranger = ctxUser(client.db, randomUUID());
    expect(await findRecommendationById(stranger, rec!.id)).toBeNull();
    // Sanity: system can still see it
    expect(await findRecommendationById(sys, rec!.id)).not.toBeNull();
  });
});

describe('findSimilarRecommendations', () => {
  it('returns top-K nearest neighbours by cosine, excluding the source rec', async () => {
    const sys = ctxSystem(client.db);
    const [src] = await client.db
      .insert(sources)
      .values({ slug: 'fsr-pub', title: 'FSR Public' })
      .returning({ id: sources.id });
    // Use a fresh axis (200) so earlier tests' vec(0)-based recs don't tie
    // for distance with our self vector and crowd out the planted near rows.
    const inserted = await client.db
      .insert(recommendations)
      .values([
        { sourceId: src!.id, slug: 'fsr-self', title: 'self', body: '.', embedding: vec(200) },
        { sourceId: src!.id, slug: 'fsr-near-1', title: 'near 1', body: '.', embedding: tilted(200, 201, 0.05) },
        { sourceId: src!.id, slug: 'fsr-near-2', title: 'near 2', body: '.', embedding: tilted(200, 201, 0.5) },
        { sourceId: src!.id, slug: 'fsr-far', title: 'far', body: '.', embedding: vec(207) },
      ])
      .returning({ id: recommendations.id, slug: recommendations.slug });
    const self = inserted.find((r) => r.slug === 'fsr-self')!;

    const hits = await findSimilarRecommendations(sys, self.id, 3);
    const titles = hits.map((h) => h.title);
    // near-1 (tilt 0.05) is angularly closer than near-2 (tilt 0.5).
    expect(titles).toContain('near 1');
    expect(titles).toContain('near 2');
    expect(titles.indexOf('near 1')).toBeLessThan(titles.indexOf('near 2'));
    expect(hits.map((h) => h.id)).not.toContain(self.id);
  });

  it('returns [] when the source rec has no embedding yet', async () => {
    const sys = ctxSystem(client.db);
    const [src] = await client.db
      .insert(sources)
      .values({ slug: 'fsr-noemb', title: 'no emb' })
      .returning({ id: sources.id });
    const [self] = await client.db
      .insert(recommendations)
      .values({ sourceId: src!.id, slug: 'fsr-noemb-self', title: 'self', body: '.' })
      .returning({ id: recommendations.id });

    const hits = await findSimilarRecommendations(sys, self!.id);
    expect(hits).toEqual([]);
  });

  it('respects the auth filter (anon viewer sees only public siblings)', async () => {
    const sys = ctxSystem(client.db);
    const owner = await seedUser(client.db);

    const [pubSrc] = await client.db
      .insert(sources)
      .values({ slug: 'fsr-auth-pub', title: 'pub' })
      .returning({ id: sources.id });
    const [privSrc] = await client.db
      .insert(sources)
      .values({ slug: 'fsr-auth-priv', title: 'priv', isPrivate: true, ownerUserId: owner })
      .returning({ id: sources.id });

    // Use a fresh axis pair (300, 301) so cumulative recs from earlier tests
    // (which all live in the 0/1/7 axis cluster) sit far in cosine space and
    // can't crowd out the rows under test under LIMIT 5.
    const [self] = await client.db
      .insert(recommendations)
      .values({ sourceId: pubSrc!.id, slug: 'fsr-auth-self', title: 'self', body: '.', embedding: vec(300) })
      .returning({ id: recommendations.id });
    await client.db.insert(recommendations).values([
      { sourceId: pubSrc!.id, slug: 'fsr-auth-pub-near', title: 'pub near', body: '.', embedding: tilted(300, 301, 0.1) },
      { sourceId: privSrc!.id, slug: 'fsr-auth-priv-near', title: 'priv near', body: '.', embedding: tilted(300, 301, 0.2) },
    ]);

    const anon = ctxUser(client.db, randomUUID());
    const hits = await findSimilarRecommendations(anon, self!.id, 5);
    expect(hits.map((h) => h.title)).toContain('pub near');
    expect(hits.map((h) => h.title)).not.toContain('priv near');

    // System sees both.
    const sysHits = await findSimilarRecommendations(sys, self!.id, 5);
    expect(sysHits.map((h) => h.title)).toContain('priv near');
  });
});
