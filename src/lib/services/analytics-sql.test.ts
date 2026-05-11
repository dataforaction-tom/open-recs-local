import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type Db, type DbClient } from '../db/client';
import { seedUser } from '../../../tests/helpers/seed-user';
import {
  progressUpdates,
  recommendationStatuses,
  recommendations,
  recommendationsThematicAreas,
  sources,
  thematicAreas,
} from '../db/schema';
import {
  progressCadence,
  recsPerStatus,
  recsPerThematicArea,
  sourcePublicationTimeline,
} from './analytics-sql';
import type { RepoContext } from '../repositories/types';

let pg: StartedPg;
let client: DbClient;

function ctxSystem(db: Db): RepoContext {
  return { db, auth: { user: { id: 'system' }, roles: ['admin'], isSystem: true } };
}
function ctxUser(db: Db, userId: string): RepoContext {
  return { db, auth: { user: { id: userId }, roles: ['viewer'], isSystem: false } };
}

let srcPublicId: string;
let srcPrivateId: string;
let recOpenId: string;
let recDoneId: string;
let recBlockedId: string;
let ownerId: string;
let themeGovId: string;
let themeOpsId: string;

async function seedSource(slug: string, opts: { isPrivate?: boolean; ownerUserId?: string } = {}): Promise<string> {
  const [row] = await client.db
    .insert(sources)
    .values({
      slug,
      title: slug,
      isPrivate: opts.isPrivate ?? false,
      ownerUserId: opts.ownerUserId ?? null,
    })
    .returning({ id: sources.id });
  if (!row) throw new Error('seed: no source');
  return row.id;
}

async function seedRec(sourceId: string, slug: string): Promise<string> {
  const [row] = await client.db
    .insert(recommendations)
    .values({ sourceId, slug, title: slug, body: `body-${slug}` })
    .returning({ id: recommendations.id });
  if (!row) throw new Error('seed: no rec');
  return row.id;
}

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
  client = createDb(pg.url);

  ownerId = await seedUser(client.db, { email: 'as-owner@test' });

  srcPublicId = await seedSource('as-pub');
  srcPrivateId = await seedSource('as-priv', { isPrivate: true, ownerUserId: ownerId });

  // Three recs on the public source: one will end at 'done', one at 'blocked',
  // one is fresh (no status row → defaults to 'open').
  recOpenId = await seedRec(srcPublicId, 'as-rec-open');
  recDoneId = await seedRec(srcPublicId, 'as-rec-done');
  recBlockedId = await seedRec(srcPublicId, 'as-rec-blocked');

  // One rec on the private source — should be hidden from non-owners.
  await seedRec(srcPrivateId, 'as-rec-priv');

  // Status history. recOpen stays open (no row). recDone: in_progress → done.
  // recBlocked: blocked.
  await client.db.insert(recommendationStatuses).values([
    { recommendationId: recDoneId, status: 'in_progress', createdAt: new Date('2026-01-01') },
    { recommendationId: recDoneId, status: 'done', createdAt: new Date('2026-02-01') },
    { recommendationId: recBlockedId, status: 'blocked', createdAt: new Date('2026-03-01') },
  ]);

  // Themes
  const [gov] = await client.db
    .insert(thematicAreas)
    .values({ slug: 'governance-as', name: 'Governance', colorHex: '#4f46e5' })
    .returning({ id: thematicAreas.id });
  const [ops] = await client.db
    .insert(thematicAreas)
    .values({ slug: 'operations-as', name: 'Operations', colorHex: '#059669' })
    .returning({ id: thematicAreas.id });
  themeGovId = gov!.id;
  themeOpsId = ops!.id;
  await client.db.insert(recommendationsThematicAreas).values([
    { recommendationId: recOpenId, thematicAreaId: themeGovId },
    { recommendationId: recDoneId, thematicAreaId: themeGovId },
    { recommendationId: recBlockedId, thematicAreaId: themeOpsId },
  ]);

  // Progress updates over recent months on the public rec set.
  const now = new Date();
  const monthAgo = new Date(now);
  monthAgo.setMonth(now.getMonth() - 1);
  const twoMonthsAgo = new Date(now);
  twoMonthsAgo.setMonth(now.getMonth() - 2);
  await client.db.insert(progressUpdates).values([
    { recommendationId: recOpenId, progressNotes: 'now', createdAt: now },
    { recommendationId: recDoneId, progressNotes: 'now2', createdAt: now },
    { recommendationId: recDoneId, progressNotes: 'month ago', createdAt: monthAgo },
    { recommendationId: recBlockedId, progressNotes: 'two months', createdAt: twoMonthsAgo },
  ]);
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

describe('recsPerStatus', () => {
  it('groups recs by latest status; missing history defaults to open', async () => {
    const rows = await recsPerStatus(ctxSystem(client.db));
    const map = new Map(rows.map((r) => [r.status, r.count]));
    // recOpen + recPriv → open (system sees both)
    expect(map.get('open')).toBe(2);
    expect(map.get('done')).toBe(1);
    expect(map.get('blocked')).toBe(1);
  });

  it('hides private-source recs from a non-owner viewer', async () => {
    const otherId = await seedUser(client.db, { email: 'as-stranger@test' });
    const rows = await recsPerStatus(ctxUser(client.db, otherId));
    const map = new Map(rows.map((r) => [r.status, r.count]));
    expect(map.get('open')).toBe(1); // only recOpen, not recPriv
  });

  it('filters by sourceId when provided', async () => {
    const rows = await recsPerStatus(ctxSystem(client.db), { sourceId: srcPublicId });
    const total = rows.reduce((s, r) => s + r.count, 0);
    expect(total).toBe(3); // recOpen + recDone + recBlocked
  });
});

describe('recsPerThematicArea', () => {
  it('groups recs by theme with name + colorHex', async () => {
    const rows = await recsPerThematicArea(ctxSystem(client.db));
    const subset = rows.filter((r) => r.slug.endsWith('-as'));
    const gov = subset.find((r) => r.slug === 'governance-as');
    const ops = subset.find((r) => r.slug === 'operations-as');
    expect(gov?.count).toBe(2); // recOpen + recDone
    expect(gov?.colorHex).toBe('#4f46e5');
    expect(ops?.count).toBe(1);
  });
});

describe('progressCadence', () => {
  it('returns a continuous month spine with counts (12 months default)', async () => {
    const rows = await progressCadence(ctxSystem(client.db));
    expect(rows).toHaveLength(12);
    // Current month should have at least 2 updates from the seed.
    const current = rows[rows.length - 1];
    expect(current!.count).toBeGreaterThanOrEqual(2);
  });

  it('respects the sourceId filter', async () => {
    const rows = await progressCadence(ctxSystem(client.db), { sourceId: srcPublicId });
    const total = rows.reduce((s, r) => s + r.count, 0);
    expect(total).toBe(4);
  });
});

describe('sourcePublicationTimeline', () => {
  it('returns a continuous month spine and counts the seeded sources', async () => {
    const rows = await sourcePublicationTimeline(ctxSystem(client.db));
    expect(rows).toHaveLength(12);
    const total = rows.reduce((s, r) => s + r.count, 0);
    // At least our 2 seeded sources are in the current month.
    expect(total).toBeGreaterThanOrEqual(2);
  });
});
