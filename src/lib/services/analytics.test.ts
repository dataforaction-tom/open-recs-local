import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type Db, type DbClient } from '../db/client';
import { sources } from '../db/schema';
import { getCached } from '../repositories/analytics-cache';
import {
  ANALYTICS_KEYS,
  computeAll,
  getGlobalRecsPerStatus,
  getOrCompute,
} from './analytics';
import type { RepoContext } from '../repositories/types';

let pg: StartedPg;
let client: DbClient;

function ctx(db: Db): RepoContext {
  return { db, auth: { user: { id: 'system' }, roles: ['admin'], isSystem: true } };
}

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
  client = createDb(pg.url);
  // Seed a couple of sources so per-source keys land in computeAll.
  await client.db.insert(sources).values([
    { slug: 'as-svc-1', title: 'S1' },
    { slug: 'as-svc-2', title: 'S2' },
  ]);
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

describe('getOrCompute', () => {
  it('returns cached value without invoking compute on a hit', async () => {
    let calls = 0;
    const key = 'analytics:test:getOrCompute:hit';
    await getOrCompute(ctx(client.db), key, async () => {
      calls += 1;
      return { v: 1 };
    });
    const second = await getOrCompute(ctx(client.db), key, async () => {
      calls += 1;
      return { v: 2 }; // would overwrite if invoked
    });
    expect(second).toEqual({ v: 1 });
    expect(calls).toBe(1);
  });

  it('computes and stores on miss', async () => {
    const key = 'analytics:test:getOrCompute:miss';
    const value = await getOrCompute(ctx(client.db), key, async () => ({ v: 42 }));
    expect(value).toEqual({ v: 42 });
    const cached = await getCached(ctx(client.db), key);
    expect(cached?.value).toEqual({ v: 42 });
  });
});

describe('façades', () => {
  it('getGlobalRecsPerStatus caches the result keyed by the canonical key', async () => {
    const result = await getGlobalRecsPerStatus(ctx(client.db));
    expect(Array.isArray(result)).toBe(true);
    const cached = await getCached(ctx(client.db), ANALYTICS_KEYS.globalRecsPerStatus);
    expect(cached?.value).toEqual(result);
  });
});

describe('computeAll', () => {
  it('writes every global key + per-source variants for each source', async () => {
    const result = await computeAll(ctx(client.db));
    expect(result.errored).toEqual([]);
    // 4 global keys + 2 per-source variants × N sources. We seeded 2,
    // so total >= 4 + 4 = 8. (Other tests sharing the container may seed
    // more, hence >=.)
    expect(result.wrote).toBeGreaterThanOrEqual(8);

    // Spot-check that a few canonical keys landed.
    for (const key of [
      ANALYTICS_KEYS.globalRecsPerStatus,
      ANALYTICS_KEYS.globalRecsPerTheme,
      ANALYTICS_KEYS.globalProgressCadence,
      ANALYTICS_KEYS.globalSourceTimeline,
    ]) {
      const row = await getCached(ctx(client.db), key);
      expect(row?.value).toBeDefined();
    }
  });
});
