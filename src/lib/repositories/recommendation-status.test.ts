import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type Db, type DbClient } from '../db/client';
import { recommendationStatuses, recommendations, sources } from '../db/schema';
import { appendStatus, getLatestStatuses } from './recommendation-status';
import { seedUser } from '../../../tests/helpers/seed-user';
import type { RepoContext } from './types';

let pg: StartedPg;
let client: DbClient;

function ctxSystem(db: Db): RepoContext {
  // Mirror the local AuthProvider: user.id is the literal string 'system'
  // (not a uuid), which the FK-enforced columns treat as NULL via the
  // UUID_RE guard in the repo layer.
  return { db, auth: { user: { id: 'system' }, roles: ['admin'], isSystem: true } };
}
function ctxUser(db: Db, userId: string): RepoContext {
  return { db, auth: { user: { id: userId }, roles: ['viewer'], isSystem: false } };
}

async function seedRec(args: {
  sourceSlug: string;
  recSlug: string;
  isPrivate?: boolean;
  ownerUserId?: string | null;
}): Promise<{ sourceId: string; recId: string }> {
  const [src] = await client.db
    .insert(sources)
    .values({
      slug: args.sourceSlug,
      title: args.sourceSlug,
      isPrivate: args.isPrivate ?? false,
      ownerUserId: args.ownerUserId ?? null,
    })
    .returning({ id: sources.id });
  if (!src) throw new Error('seedRec: no source row');
  const [rec] = await client.db
    .insert(recommendations)
    .values({
      sourceId: src.id,
      slug: args.recSlug,
      title: args.recSlug,
      body: `body for ${args.recSlug}`,
    })
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

describe('getLatestStatuses', () => {
  it('returns an empty map when given no recIds', async () => {
    const result = await getLatestStatuses(ctxSystem(client.db), []);
    expect(result.size).toBe(0);
  });

  it('omits recs with no status history (caller falls back to "open")', async () => {
    const { recId } = await seedRec({
      sourceSlug: 'rs-no-history-src',
      recSlug: 'rs-no-history-rec',
    });
    const result = await getLatestStatuses(ctxSystem(client.db), [recId]);
    expect(result.has(recId)).toBe(false);
  });

  it('returns the single status when a rec has exactly one history row', async () => {
    const { recId } = await seedRec({
      sourceSlug: 'rs-single-src',
      recSlug: 'rs-single-rec',
    });
    await client.db.insert(recommendationStatuses).values({
      recommendationId: recId,
      status: 'in_progress',
      note: 'starting work',
    });

    const result = await getLatestStatuses(ctxSystem(client.db), [recId]);
    const entry = result.get(recId);
    expect(entry?.status).toBe('in_progress');
    expect(entry?.note).toBe('starting work');
    expect(entry?.setAt).toBeInstanceOf(Date);
  });

  it('returns the most recent status when a rec has multiple history rows', async () => {
    const { recId } = await seedRec({
      sourceSlug: 'rs-multi-src',
      recSlug: 'rs-multi-rec',
    });
    // Insert in chronological order with explicit timestamps to make ordering
    // deterministic — defaultNow() can produce identical timestamps in a tight
    // burst on some platforms.
    const t1 = new Date('2026-01-01T00:00:00Z');
    const t2 = new Date('2026-02-01T00:00:00Z');
    const t3 = new Date('2026-03-01T00:00:00Z');
    await client.db.insert(recommendationStatuses).values([
      { recommendationId: recId, status: 'open', createdAt: t1 },
      { recommendationId: recId, status: 'in_progress', createdAt: t2 },
      { recommendationId: recId, status: 'done', createdAt: t3, note: 'wrapped up' },
    ]);

    const result = await getLatestStatuses(ctxSystem(client.db), [recId]);
    const entry = result.get(recId);
    expect(entry?.status).toBe('done');
    expect(entry?.note).toBe('wrapped up');
    expect(entry?.setAt.toISOString()).toBe(t3.toISOString());
  });

  it('handles a batch of recs with mixed history', async () => {
    const a = await seedRec({ sourceSlug: 'rs-batch-a-src', recSlug: 'rs-batch-a-rec' });
    const b = await seedRec({ sourceSlug: 'rs-batch-b-src', recSlug: 'rs-batch-b-rec' });
    const c = await seedRec({ sourceSlug: 'rs-batch-c-src', recSlug: 'rs-batch-c-rec' });

    await client.db.insert(recommendationStatuses).values([
      { recommendationId: a.recId, status: 'in_progress' },
      { recommendationId: b.recId, status: 'blocked', note: 'awaiting funding' },
      // c has no history
    ]);

    const result = await getLatestStatuses(ctxSystem(client.db), [a.recId, b.recId, c.recId]);
    expect(result.get(a.recId)?.status).toBe('in_progress');
    expect(result.get(b.recId)?.status).toBe('blocked');
    expect(result.has(c.recId)).toBe(false);
    expect(result.size).toBe(2);
  });

  it('hides statuses on private recs the viewer cannot see', async () => {
    const ownerId = await seedUser(client.db);
    const otherId = await seedUser(client.db);
    const { recId } = await seedRec({
      sourceSlug: 'rs-private-src',
      recSlug: 'rs-private-rec',
      isPrivate: true,
      ownerUserId: ownerId,
    });
    await client.db
      .insert(recommendationStatuses)
      .values({ recommendationId: recId, status: 'in_progress' });

    const ownerView = await getLatestStatuses(ctxUser(client.db, ownerId), [recId]);
    const strangerView = await getLatestStatuses(ctxUser(client.db, otherId), [recId]);
    const systemView = await getLatestStatuses(ctxSystem(client.db), [recId]);

    expect(ownerView.get(recId)?.status).toBe('in_progress');
    expect(strangerView.has(recId)).toBe(false);
    expect(systemView.get(recId)?.status).toBe('in_progress');
  });

  it('silently drops entries for malformed uuids in the input', async () => {
    const { recId } = await seedRec({ sourceSlug: 'rs-mixed-src', recSlug: 'rs-mixed-rec' });
    await client.db
      .insert(recommendationStatuses)
      .values({ recommendationId: recId, status: 'done' });

    const result = await getLatestStatuses(ctxSystem(client.db), [recId, 'not-a-uuid', '   ']);
    expect(result.get(recId)?.status).toBe('done');
    expect(result.size).toBe(1);
  });
});

describe('appendStatus', () => {
  it('writes a row and returns id, status, setAt', async () => {
    const { recId } = await seedRec({
      sourceSlug: 'as-write-src',
      recSlug: 'as-write-rec',
    });
    const result = await appendStatus(ctxSystem(client.db), {
      recommendationId: recId,
      status: 'in_progress',
      note: 'kicking off',
    });
    expect(result).not.toBeNull();
    expect(result?.status).toBe('in_progress');
    expect(result?.setAt).toBeInstanceOf(Date);

    const latest = await getLatestStatuses(ctxSystem(client.db), [recId]);
    expect(latest.get(recId)?.status).toBe('in_progress');
    expect(latest.get(recId)?.note).toBe('kicking off');
  });

  it('persists setByUserId from a uuid-bearing context', async () => {
    const ownerId = await seedUser(client.db);
    const { recId } = await seedRec({ sourceSlug: 'as-author-src', recSlug: 'as-author-rec' });
    await appendStatus(ctxUser(client.db, ownerId), {
      recommendationId: recId,
      status: 'done',
    });

    const rows = await client.db
      .select()
      .from(recommendationStatuses)
      .execute();
    const row = rows.find((r) => r.recommendationId === recId);
    expect(row?.setByUserId).toBe(ownerId);
  });

  it('returns null when the rec is invisible to the viewer', async () => {
    const ownerId = await seedUser(client.db);
    const otherId = await seedUser(client.db);
    const { recId } = await seedRec({
      sourceSlug: 'as-private-src',
      recSlug: 'as-private-rec',
      isPrivate: true,
      ownerUserId: ownerId,
    });

    const sneaky = await appendStatus(ctxUser(client.db, otherId), {
      recommendationId: recId,
      status: 'blocked',
    });
    expect(sneaky).toBeNull();

    const ok = await appendStatus(ctxUser(client.db, ownerId), {
      recommendationId: recId,
      status: 'in_progress',
    });
    expect(ok).not.toBeNull();
  });

  it('returns null for an unknown rec id', async () => {
    const result = await appendStatus(ctxSystem(client.db), {
      recommendationId: randomUUID(),
      status: 'done',
    });
    expect(result).toBeNull();
  });

  it('appends rather than replacing — history grows monotonically', async () => {
    const { recId } = await seedRec({
      sourceSlug: 'as-history-src',
      recSlug: 'as-history-rec',
    });
    await appendStatus(ctxSystem(client.db), { recommendationId: recId, status: 'in_progress' });
    await appendStatus(ctxSystem(client.db), { recommendationId: recId, status: 'blocked' });
    await appendStatus(ctxSystem(client.db), { recommendationId: recId, status: 'in_progress' });

    const all = await client.db.select().from(recommendationStatuses).execute();
    const forRec = all.filter((r) => r.recommendationId === recId);
    expect(forRec).toHaveLength(3);
  });
});
