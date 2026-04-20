import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { createDb } from './client';

let pg: StartedPg;

beforeAll(async () => {
  pg = await startPostgres();
});

afterAll(async () => {
  await pg?.container.stop();
});

describe('createDb', () => {
  it('connects and runs a trivial query', async () => {
    const { db, sql } = createDb(pg.url);
    try {
      const rows = await sql`select 1 as one`;
      expect(rows[0]?.one).toBe(1);
      expect(db).toBeDefined();
    } finally {
      await sql.end();
    }
  });
});
