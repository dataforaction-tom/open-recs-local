import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type DbClient } from '../db/client';
import { seedTaxonomy } from '../db/seed-taxonomy';
import { recommendations, sources } from '../db/schema';
import {
  listRecommendationLocationScopes,
  listRecommendationPurposes,
  listRecommendationTargetAudienceTypes,
  listRecommendationThematicAreas,
  replaceRecommendationLocationScopes,
  replaceRecommendationPurposes,
  replaceRecommendationTargetAudienceTypes,
  replaceRecommendationThematicAreas,
} from './recommendation-tags';
import {
  resolveOrCreateLocationScopes,
  resolveOrCreatePurposes,
  resolveOrCreateTargetAudienceTypes,
  resolveOrCreateThematicAreas,
} from './taxonomy';
import type { RepoContext } from './types';

let pg: StartedPg;
let client: DbClient;
let ctx: RepoContext;
let recId: string;

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
  const [r] = await client.db
    .insert(recommendations)
    .values({
      sourceId: s.id,
      slug: `rec-${Math.random().toString(36).slice(2, 10)}`,
      title: 'Test recommendation',
      body: 'Body that is at least twenty chars long for the schema.',
    })
    .returning({ id: recommendations.id });
  if (!r) throw new Error('seed: recommendation insert returned no row');
  recId = r.id;
});

describe('replace + list — recommendation thematic areas', () => {
  it('replace + list round-trips', async () => {
    const ids = await resolveOrCreateThematicAreas(ctx, ['governance', 'data']);
    await replaceRecommendationThematicAreas(ctx, recId, ids);
    const rows = await listRecommendationThematicAreas(ctx, recId);
    expect(rows.map((r) => r.slug)).toEqual(['data', 'governance']);
  });

  it('diff replaces correctly', async () => {
    const first = await resolveOrCreateThematicAreas(ctx, ['governance', 'data']);
    await replaceRecommendationThematicAreas(ctx, recId, first);
    const second = await resolveOrCreateThematicAreas(ctx, ['philanthropy']);
    await replaceRecommendationThematicAreas(ctx, recId, second);
    const rows = await listRecommendationThematicAreas(ctx, recId);
    expect(rows.map((r) => r.slug)).toEqual(['philanthropy']);
  });
});

describe('replace + list — recommendation other axes', () => {
  it('purposes', async () => {
    const ids = await resolveOrCreatePurposes(ctx, ['strategy', 'advocacy']);
    await replaceRecommendationPurposes(ctx, recId, ids);
    expect(await listRecommendationPurposes(ctx, recId)).toHaveLength(2);
  });

  it('target_audience_types', async () => {
    const ids = await resolveOrCreateTargetAudienceTypes(ctx, ['funders', 'general-public']);
    await replaceRecommendationTargetAudienceTypes(ctx, recId, ids);
    expect(await listRecommendationTargetAudienceTypes(ctx, recId)).toHaveLength(2);
  });

  it('location_scopes', async () => {
    const ids = await resolveOrCreateLocationScopes(ctx, ['national']);
    await replaceRecommendationLocationScopes(ctx, recId, ids);
    expect(await listRecommendationLocationScopes(ctx, recId)).toHaveLength(1);
  });
});
