import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type DbClient } from '../db/client';
import { seedTaxonomy } from '../db/seed-taxonomy';
import { sources } from '../db/schema';
import {
  listSourcePurposes,
  listSourceRoleRelevances,
  listSourceSourceTypes,
  listSourceTargetAudienceTypes,
  listSourceThematicAreas,
  replaceSourcePurposes,
  replaceSourceRoleRelevances,
  replaceSourceSourceTypes,
  replaceSourceTargetAudienceTypes,
  replaceSourceThematicAreas,
} from './source-tags';
import {
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
let sourceId: string;

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

beforeEach(async () => {
  const [s] = await client.db
    .insert(sources)
    .values({ slug: `src-${Math.random().toString(36).slice(2, 10)}`, title: 'Test source' })
    .returning({ id: sources.id });
  if (!s) throw new Error('seed: source insert returned no row');
  sourceId = s.id;
});

describe('replace + list — thematic areas', () => {
  it('replaceSourceThematicAreas attaches ids; listSourceThematicAreas returns them ordered by name', async () => {
    const ids = await resolveOrCreateThematicAreas(ctx, ['governance', 'data']);
    await replaceSourceThematicAreas(ctx, sourceId, ids);
    const rows = await listSourceThematicAreas(ctx, sourceId);
    expect(rows.map((r) => r.slug)).toEqual(['data', 'governance']);
    expect(rows[0]?.colorHex).toBeTruthy();
  });

  it('replaceSourceThematicAreas with [] detaches all existing rows', async () => {
    const ids = await resolveOrCreateThematicAreas(ctx, ['governance']);
    await replaceSourceThematicAreas(ctx, sourceId, ids);
    expect(await listSourceThematicAreas(ctx, sourceId)).toHaveLength(1);
    await replaceSourceThematicAreas(ctx, sourceId, []);
    expect(await listSourceThematicAreas(ctx, sourceId)).toHaveLength(0);
  });

  it('replaceSourceThematicAreas computes a diff (only new ids are inserted, only missing ids deleted)', async () => {
    const first = await resolveOrCreateThematicAreas(ctx, ['governance', 'data']);
    await replaceSourceThematicAreas(ctx, sourceId, first);
    const second = await resolveOrCreateThematicAreas(ctx, ['governance', 'philanthropy']);
    await replaceSourceThematicAreas(ctx, sourceId, second);
    const rows = await listSourceThematicAreas(ctx, sourceId);
    expect(rows.map((r) => r.slug).sort()).toEqual(['governance', 'philanthropy']);
  });
});

describe('replace + list — other axes', () => {
  it('source_types', async () => {
    const ids = await resolveOrCreateSourceTypes(ctx, ['evaluation', 'case-study']);
    await replaceSourceSourceTypes(ctx, sourceId, ids);
    const rows = await listSourceSourceTypes(ctx, sourceId);
    expect(rows.map((r) => r.slug).sort()).toEqual(['case-study', 'evaluation']);
  });

  it('purposes', async () => {
    const ids = await resolveOrCreatePurposes(ctx, ['strategy']);
    await replaceSourcePurposes(ctx, sourceId, ids);
    expect(await listSourcePurposes(ctx, sourceId)).toHaveLength(1);
  });

  it('role_relevances', async () => {
    const ids = await resolveOrCreateRoleRelevances(ctx, ['practitioner', 'funder']);
    await replaceSourceRoleRelevances(ctx, sourceId, ids);
    expect(await listSourceRoleRelevances(ctx, sourceId)).toHaveLength(2);
  });

  it('target_audience_types', async () => {
    const ids = await resolveOrCreateTargetAudienceTypes(ctx, ['funders']);
    await replaceSourceTargetAudienceTypes(ctx, sourceId, ids);
    expect(await listSourceTargetAudienceTypes(ctx, sourceId)).toHaveLength(1);
  });
});

describe('source deletion cascades the M2M rows', () => {
  it('removes all sources_thematic_areas rows when the source is deleted', async () => {
    const ids = await resolveOrCreateThematicAreas(ctx, ['governance', 'data']);
    await replaceSourceThematicAreas(ctx, sourceId, ids);
    await client.sql`delete from sources where id = ${sourceId}`;
    const remaining = await client.sql<{ n: number }[]>`select count(*)::int as n from sources_thematic_areas where source_id = ${sourceId}`;
    expect(remaining[0]?.n).toBe(0);
  });
});
