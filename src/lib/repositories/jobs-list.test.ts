import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { createDb, type DbClient } from '../db/client';
import { createQueue, type Queue } from '../jobs/queue';
import type { RepoContext } from './types';
import { listRecentJobs } from './jobs-list';

let pg: StartedPg;
let queue: Queue;
let client: DbClient;

beforeAll(async () => {
  pg = await startPostgres();
  queue = await createQueue({ connectionString: pg.url });
  client = createDb(pg.url);
}, 120_000);

afterAll(async () => {
  await queue?.stop();
  await client?.sql.end();
  await pg?.container.stop();
});

function ctx(): RepoContext {
  return { db: client.db, auth: { user: { id: 'system' }, roles: ['admin'], isSystem: true } };
}

describe('listRecentJobs', () => {
  it('returns recent jobs in created_on DESC order with the expected shape', async () => {
    const a = await queue.enqueue('test.echo', { msg: 'a' });
    const b = await queue.enqueue('test.echo', { msg: 'b' });
    const c = await queue.enqueue('test.echo', { msg: 'c' });

    const rows = await listRecentJobs(ctx(), { limit: 10 });

    const ids = rows.map((r) => r.id);
    // c was enqueued last → most recent → first
    expect(ids.indexOf(c)).toBeLessThan(ids.indexOf(b));
    expect(ids.indexOf(b)).toBeLessThan(ids.indexOf(a));
    expect(rows[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      state: expect.any(String),
      createdOn: expect.any(Date),
    });
  });

  it('respects the limit argument', async () => {
    const rows = await listRecentJobs(ctx(), { limit: 2 });
    expect(rows.length).toBeLessThanOrEqual(2);
  });
});
