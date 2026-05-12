import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type DbClient } from '../db/client';
import { seedTaxonomy } from '../db/seed-taxonomy';
import { recommendations, sources } from '../db/schema';
import {
  deleteTag,
  listLocationScopes,
  listPriorityTimescales,
  listPurposes,
  listRoleRelevances,
  listSourceTypes,
  listTargetAudienceTypes,
  listThematicAreas,
  listUnverifiedTags,
  mergeTag,
  promoteTag,
  renameTag,
  resolveOrCreateLocationScopes,
  resolveOrCreatePriorityTimescales,
  resolveOrCreatePurposes,
  resolveOrCreateRoleRelevances,
  resolveOrCreateSourceTypes,
  resolveOrCreateTargetAudienceTypes,
  resolveOrCreateThematicAreas,
} from './taxonomy';
import type { RepoContext } from './types';

let pg: StartedPg;
let client: DbClient;
let ctx: RepoContext;

beforeAll(async () => {
  pg = await startPostgres();
  const migrated = await applyMigrations(pg.url);
  await migrated.sql.end();
  client = createDb(pg.url);
  await seedTaxonomy(client.db);
  ctx = {
    db: client.db,
    auth: { user: { id: 'system', name: 'system' }, roles: ['admin'], isSystem: true },
  };
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

describe('list* functions', () => {
  it('listThematicAreas returns all 29 seeded rows ordered by name (locale-aware)', async () => {
    const rows = await listThematicAreas(ctx);
    expect(rows).toHaveLength(29);
    const names = rows.map((r) => r.name);
    // Postgres orders text columns by the database collation (typically
    // case-insensitive), e.g. 'Agriculture' before 'AI'. Match that with
    // localeCompare here so the assertion mirrors what the UI will see.
    const expectedOrder = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(expectedOrder);
    expect(rows[0]).toHaveProperty('slug');
    expect(rows[0]).toHaveProperty('colorHex');
    expect(rows[0]?.unverified).toBe(false);
  });

  it('listPurposes returns 9 seeded rows', async () => {
    const rows = await listPurposes(ctx);
    expect(rows).toHaveLength(9);
  });

  it('listSourceTypes returns 10 seeded rows', async () => {
    expect(await listSourceTypes(ctx)).toHaveLength(10);
  });

  it('listTargetAudienceTypes returns 14 seeded rows', async () => {
    expect(await listTargetAudienceTypes(ctx)).toHaveLength(14);
  });

  it('listLocationScopes returns 5 seeded rows', async () => {
    expect(await listLocationScopes(ctx)).toHaveLength(5);
  });

  it('listRoleRelevances returns 9 seeded rows', async () => {
    expect(await listRoleRelevances(ctx)).toHaveLength(9);
  });

  it('listPriorityTimescales returns 4 seeded rows', async () => {
    expect(await listPriorityTimescales(ctx)).toHaveLength(4);
  });
});

describe('resolveOrCreate*', () => {
  it('returns ids for existing slugs without creating new rows', async () => {
    const before = await listPurposes(ctx);
    const ids = await resolveOrCreatePurposes(ctx, ['strategy', 'advocacy']);
    expect(ids).toHaveLength(2);
    const after = await listPurposes(ctx);
    expect(after).toHaveLength(before.length);
  });

  it('creates unverified rows for unknown slugs and returns their ids', async () => {
    const ids = await resolveOrCreatePurposes(ctx, ['strategy', 'made-up-purpose']);
    expect(ids).toHaveLength(2);
    const all = await listPurposes(ctx);
    const created = all.find((r) => r.slug === 'made-up-purpose');
    expect(created).toBeDefined();
    expect(created?.unverified).toBe(true);
    expect(created?.name).toBe('Made up purpose');
  });

  it('returns ids in the same order as the input slugs', async () => {
    const ids = await resolveOrCreateLocationScopes(ctx, ['regional', 'global', 'local']);
    expect(ids).toHaveLength(3);
    const rows = await listLocationScopes(ctx);
    const bySlug = new Map(rows.map((r) => [r.slug, r.id]));
    expect(ids[0]).toBe(bySlug.get('regional'));
    expect(ids[1]).toBe(bySlug.get('global'));
    expect(ids[2]).toBe(bySlug.get('local'));
  });

  it('deduplicates the input slugs', async () => {
    const ids = await resolveOrCreateSourceTypes(ctx, ['evaluation', 'evaluation', 'case-study']);
    expect(new Set(ids).size).toBe(2);
  });

  it('handles an empty slug array', async () => {
    expect(await resolveOrCreatePurposes(ctx, [])).toEqual([]);
  });

  it('normalises slugs (trim + lowercase) before lookup', async () => {
    const ids = await resolveOrCreatePurposes(ctx, ['  Strategy  ', 'advocacy']);
    expect(ids).toHaveLength(2);
    // 'Strategy' lowercased+trimmed = 'strategy', already exists. No new row.
    const all = await listPurposes(ctx);
    const strategyRows = all.filter((r) => r.slug === 'strategy');
    expect(strategyRows).toHaveLength(1);
  });
});

describe('resolveOrCreateThematicAreas + resolveOrCreateRoleRelevances + resolveOrCreatePriorityTimescales + resolveOrCreateTargetAudienceTypes', () => {
  it('all axes work the same way', async () => {
    expect((await resolveOrCreateThematicAreas(ctx, ['governance'])).length).toBe(1);
    expect((await resolveOrCreateRoleRelevances(ctx, ['policy-maker'])).length).toBe(1);
    expect((await resolveOrCreatePriorityTimescales(ctx, ['urgent'])).length).toBe(1);
    expect((await resolveOrCreateTargetAudienceTypes(ctx, ['funders'])).length).toBe(1);
  });
});

describe('taxonomy admin operations', () => {
  it('listUnverifiedTags returns only unverified rows for the axis', async () => {
    await resolveOrCreatePurposes(ctx, ['unverified-test-axis-x']);
    const rows = await listUnverifiedTags(ctx, 'purposes');
    expect(rows.find((r) => r.slug === 'unverified-test-axis-x')).toBeDefined();
    expect(rows.every((r) => r.unverified === true)).toBe(true);
  });

  it('promoteTag flips unverified=false', async () => {
    const [id] = await resolveOrCreatePurposes(ctx, ['unverified-promote']);
    await promoteTag(ctx, 'purposes', id!);
    const rows = await listPurposes(ctx);
    const row = rows.find((r) => r.slug === 'unverified-promote');
    expect(row?.unverified).toBe(false);
  });

  it('renameTag updates name', async () => {
    const [id] = await resolveOrCreatePurposes(ctx, ['unverified-rename']);
    await renameTag(ctx, 'purposes', id!, 'Renamed Purpose');
    const rows = await listPurposes(ctx);
    const row = rows.find((r) => r.slug === 'unverified-rename');
    expect(row?.name).toBe('Renamed Purpose');
  });

  it('deleteTag removes the row', async () => {
    const [id] = await resolveOrCreatePurposes(ctx, ['unverified-delete']);
    await deleteTag(ctx, 'purposes', id!);
    const rows = await listPurposes(ctx);
    expect(rows.find((r) => r.slug === 'unverified-delete')).toBeUndefined();
  });

  it('mergeTag for priority_timescales rewrites the FK and deletes the source', async () => {
    const fromIds = await resolveOrCreatePriorityTimescales(ctx, ['unverified-priority']);
    const fromId = fromIds[0]!;
    const verifiedRows = await listPriorityTimescales(ctx);
    const toId = verifiedRows.find((r) => r.slug === 'urgent')!.id;
    const [s] = await ctx.db
      .insert(sources)
      .values({ slug: `merge-src-${Math.random().toString(36).slice(2, 10)}`, title: 'M' })
      .returning({ id: sources.id });
    const [r] = await ctx.db
      .insert(recommendations)
      .values({
        sourceId: s!.id,
        slug: `merge-rec-${Math.random().toString(36).slice(2, 10)}`,
        title: 'Merge candidate',
        body: 'Body with at least twenty characters so the schema is happy.',
        priorityTimescaleId: fromId,
      })
      .returning({ id: recommendations.id });
    await mergeTag(ctx, 'priority_timescales', fromId, toId);
    const [updated] = await ctx.db
      .select({ priorityTimescaleId: recommendations.priorityTimescaleId })
      .from(recommendations)
      .where(eq(recommendations.id, r!.id));
    expect(updated?.priorityTimescaleId).toBe(toId);
    const rows = await listPriorityTimescales(ctx);
    expect(rows.find((p) => p.id === fromId)).toBeUndefined();
  });
});
