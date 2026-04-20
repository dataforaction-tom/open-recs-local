import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';

let pg: StartedPg;

beforeAll(async () => {
  pg = await startPostgres();
});

afterAll(async () => {
  await pg?.container.stop();
});

describe('migrations', () => {
  it('install the vector extension', async () => {
    const { sql } = await applyMigrations(pg.url);
    try {
      const rows = await sql<{ installed: boolean }[]>`
        select exists(
          select 1 from pg_extension where extname = 'vector'
        ) as installed
      `;
      expect(rows[0]?.installed).toBe(true);
    } finally {
      await sql.end();
    }
  });
});
