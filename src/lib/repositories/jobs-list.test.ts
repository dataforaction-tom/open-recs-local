import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type DbClient } from '../db/client';
import { sources } from '../db/schema';
import { createQueue, type Queue } from '../jobs/queue';
import type { RepoContext } from './types';
import { listRecentJobs, listRecentSources } from './jobs-list';

let pg: StartedPg;
let queue: Queue;
let client: DbClient;

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
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

  it('returns [] when the pgboss schema is missing', async () => {
    const fresh = await startPostgres();
    const freshClient = createDb(fresh.url);
    try {
      const freshCtx: RepoContext = {
        db: freshClient.db,
        auth: { user: { id: 'system' }, roles: ['admin'], isSystem: true },
      };
      const rows = await listRecentJobs(freshCtx, { limit: 5 });
      expect(rows).toEqual([]);
    } finally {
      await freshClient.sql.end();
      await fresh.container.stop();
    }
  }, 120_000);
});

describe('listRecentSources', () => {
  const ownerA = '11111111-1111-1111-1111-111111111111';
  const ownerB = '22222222-2222-2222-2222-222222222222';

  beforeAll(async () => {
    await client.db.insert(sources).values([
      { slug: 'public-1', title: 'Public 1', isPrivate: false },
      { slug: 'private-a', title: 'Private A', isPrivate: true, ownerUserId: ownerA },
      { slug: 'private-b', title: 'Private B', isPrivate: true, ownerUserId: ownerB },
    ]);
  });

  it('system context sees all sources', async () => {
    const rows = await listRecentSources(ctx(), { limit: 50 });
    const slugs = rows.map((r) => r.slug);
    expect(slugs).toContain('public-1');
    expect(slugs).toContain('private-a');
    expect(slugs).toContain('private-b');
  });

  it('a logged-in user sees public + their own private sources', async () => {
    const userCtx: RepoContext = {
      db: client.db,
      auth: { user: { id: ownerA }, roles: ['viewer'], isSystem: false },
    };
    const rows = await listRecentSources(userCtx, { limit: 50 });
    const slugs = rows.map((r) => r.slug);
    expect(slugs).toContain('public-1');
    expect(slugs).toContain('private-a');
    expect(slugs).not.toContain('private-b');
  });

  it('an anonymous viewer sees only public sources', async () => {
    const anonCtx: RepoContext = {
      db: client.db,
      auth: { user: { id: 'anonymous' }, roles: ['viewer'], isSystem: false },
    };
    const rows = await listRecentSources(anonCtx, { limit: 50 });
    const slugs = rows.map((r) => r.slug);
    expect(slugs).toContain('public-1');
    expect(slugs).not.toContain('private-a');
    expect(slugs).not.toContain('private-b');
  });
});
