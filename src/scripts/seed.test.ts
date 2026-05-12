import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../tests/helpers/pg-container';
import { applyMigrations } from '../../tests/helpers/migrate';
import { createDb } from '../lib/db/client';
import { seedTaxonomy } from './seed';

let pg: StartedPg;
let client: ReturnType<typeof createDb>;

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

describe('seedTaxonomy', () => {
  it('inserts the expected row count for every taxonomy axis', async () => {
    await seedTaxonomy(client.db);
    const themes = await client.sql<{ n: number }[]>`select count(*)::int as n from thematic_areas`;
    expect(themes[0]?.n).toBe(29);
    const purposesRows = await client.sql<{ n: number }[]>`select count(*)::int as n from purposes`;
    expect(purposesRows[0]?.n).toBe(9);
    const types = await client.sql<{ n: number }[]>`select count(*)::int as n from source_types`;
    expect(types[0]?.n).toBe(10);
    const audiences = await client.sql<{ n: number }[]>`select count(*)::int as n from target_audience_types`;
    expect(audiences[0]?.n).toBe(14);
    const locations = await client.sql<{ n: number }[]>`select count(*)::int as n from location_scopes`;
    expect(locations[0]?.n).toBe(5);
    const roles = await client.sql<{ n: number }[]>`select count(*)::int as n from role_relevances`;
    expect(roles[0]?.n).toBe(9);
    const priorities = await client.sql<{ n: number }[]>`select count(*)::int as n from priority_timescales`;
    expect(priorities[0]?.n).toBe(4);
    const evidence = await client.sql<{ n: number }[]>`select count(*)::int as n from evidence_types`;
    expect(evidence[0]?.n).toBe(4);
    const ratings = await client.sql<{ n: number }[]>`select count(*)::int as n from progress_ratings`;
    expect(ratings[0]?.n).toBe(4);
  });

  it('is idempotent — re-running does not duplicate rows or error', async () => {
    await seedTaxonomy(client.db);
    await seedTaxonomy(client.db);
    const rows = await client.sql<{ n: number }[]>`select count(*)::int as n from thematic_areas`;
    expect(rows[0]?.n).toBe(29);
  });

  it('seeds taxonomy rows with unverified=false', async () => {
    await seedTaxonomy(client.db);
    const rows = await client.sql<{ n: number }[]>`select count(*)::int as n from thematic_areas where unverified = true`;
    expect(rows[0]?.n).toBe(0);
  });
});
