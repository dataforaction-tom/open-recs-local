import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type Db, type DbClient } from '../db/client';
import { getCached, listCachedKeys, setCached } from './analytics-cache';
import type { RepoContext } from './types';

let pg: StartedPg;
let client: DbClient;

function ctx(db: Db): RepoContext {
  return { db, auth: { user: { id: 'system' }, roles: ['admin'], isSystem: true } };
}

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
  client = createDb(pg.url);
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

type Sample = { count: number; label: string };

describe('analyticsCache', () => {
  it('round-trips a value and surfaces computedAt', async () => {
    const value: Sample = { count: 7, label: 'demo' };
    await setCached<Sample>(ctx(client.db), 'analytics:test:round-trip', value);
    const got = await getCached<Sample>(ctx(client.db), 'analytics:test:round-trip');
    expect(got?.value).toEqual(value);
    expect(got?.computedAt).toBeInstanceOf(Date);
  });

  it('returns null for an unknown key', async () => {
    const got = await getCached(ctx(client.db), 'analytics:test:nope');
    expect(got).toBeNull();
  });

  it('overwrites an existing key and refreshes computedAt', async () => {
    await setCached<Sample>(ctx(client.db), 'analytics:test:overwrite', { count: 1, label: 'a' });
    const first = await getCached<Sample>(ctx(client.db), 'analytics:test:overwrite');
    // Force an observable timestamp delta. Postgres now() resolution is
    // microseconds — wait a few ms before the overwrite.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await setCached<Sample>(ctx(client.db), 'analytics:test:overwrite', { count: 2, label: 'b' });
    const second = await getCached<Sample>(ctx(client.db), 'analytics:test:overwrite');
    expect(second?.value).toEqual({ count: 2, label: 'b' });
    expect(second!.computedAt.getTime()).toBeGreaterThan(first!.computedAt.getTime());
  });

  it('lists keys by prefix, alphabetical', async () => {
    await setCached(ctx(client.db), 'analytics:lkp:a', { x: 1 });
    await setCached(ctx(client.db), 'analytics:lkp:b', { x: 2 });
    await setCached(ctx(client.db), 'analytics:other:c', { x: 3 });
    const keys = await listCachedKeys(ctx(client.db), 'analytics:lkp:');
    expect(keys).toEqual(['analytics:lkp:a', 'analytics:lkp:b']);
  });
});
