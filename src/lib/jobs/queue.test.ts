import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { createQueue, type Queue } from './queue';

let pg: StartedPg;
let queue: Queue;

describe('queue', () => {
  beforeAll(async () => {
    pg = await startPostgres();
    queue = await createQueue({ connectionString: pg.url });
  }, 120_000);

  afterAll(async () => {
    await queue?.stop();
    await pg?.container.stop();
  });

  it('installs the pgboss schema on start', async () => {
    const result = await queue.rawQuery(
      `select schema_name from information_schema.schemata where schema_name = 'pgboss'`,
    );
    expect(result).toHaveLength(1);
  });

  it('round-trips a typed job', async () => {
    await queue.register('test.echo', async (payload) => ({ echoed: payload.msg }));
    const jobId = await queue.enqueue('test.echo', { msg: 'hi' });
    const result = await queue.waitForResult<{ echoed: string }>(jobId, 10_000);
    expect(result).toEqual({ echoed: 'hi' });
  });
});
