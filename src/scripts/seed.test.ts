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
  it('inserts all taxonomy rows', async () => {
    await seedTaxonomy(client.db);
    const tRows = await client.sql<{ n: number }[]>`select count(*)::int as n from thematic_areas`;
    const eRows = await client.sql<{ n: number }[]>`select count(*)::int as n from evidence_types`;
    const pRows = await client.sql<{ n: number }[]>`select count(*)::int as n from progress_ratings`;
    expect(tRows[0]?.n).toBe(5);
    expect(eRows[0]?.n).toBe(4);
    expect(pRows[0]?.n).toBe(4);
  });

  it('is idempotent — re-running does not duplicate rows or error', async () => {
    await seedTaxonomy(client.db);
    await seedTaxonomy(client.db);
    const tRows = await client.sql<{ n: number }[]>`select count(*)::int as n from thematic_areas`;
    const eRows = await client.sql<{ n: number }[]>`select count(*)::int as n from evidence_types`;
    const pRows = await client.sql<{ n: number }[]>`select count(*)::int as n from progress_ratings`;
    expect(tRows[0]?.n).toBe(5);
    expect(eRows[0]?.n).toBe(4);
    expect(pRows[0]?.n).toBe(4);
  });
});
