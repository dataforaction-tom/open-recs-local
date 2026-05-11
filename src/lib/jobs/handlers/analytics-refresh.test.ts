import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startPostgres, type StartedPg } from '../../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../../tests/helpers/migrate';
import { createDb, type DbClient } from '@/lib/db/client';
import { loadEnv, type Env } from '@/lib/env';
import { sources } from '@/lib/db/schema';
import { createProviders, type Providers } from '@/lib/providers';
import type { JobContext } from '@/lib/jobs/context';
import { getCached } from '@/lib/repositories/analytics-cache';
import { ANALYTICS_KEYS } from '@/lib/services/analytics';
import { analyticsRefreshHandler } from './analytics-refresh';

let pg: StartedPg;
let dbClient: DbClient;
let env: Env;
let providers: Providers;
let ctx: JobContext;

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
  dbClient = createDb(pg.url);

  // Load env from a synthesised in-memory shape — the handler doesn't need a
  // real env beyond what providers.auth uses.
  process.env.APP_MODE = 'local';
  process.env.DATABASE_URL = pg.url;
  process.env.LLM_PROVIDER = 'fake';
  process.env.EMBEDDING_PROVIDER = 'fake';
  process.env.OCR_PROVIDER = 'fake';
  process.env.STORAGE_PROVIDER = 'fake';
  env = loadEnv();
  providers = createProviders(env);

  // Seed two sources so per-source variants land in the cache.
  await dbClient.db.insert(sources).values([
    { slug: 'ar-1', title: 'AR 1' },
    { slug: 'ar-2', title: 'AR 2' },
  ]);

  ctx = {
    queue: {} as JobContext['queue'],
    db: dbClient.db,
    providers,
    env,
    emit: vi.fn(),
  };
}, 120_000);

afterAll(async () => {
  await dbClient?.sql.end();
  await pg?.container.stop();
});

describe('analyticsRefreshHandler', () => {
  it('writes every global cache key', async () => {
    const result = await analyticsRefreshHandler(ctx);
    expect(result.errored).toBe(0);
    expect(result.wrote).toBeGreaterThanOrEqual(4);

    const ctxRepo = { db: dbClient.db, auth: { user: { id: 'system' }, roles: [], isSystem: true } };
    for (const key of [
      ANALYTICS_KEYS.globalRecsPerStatus,
      ANALYTICS_KEYS.globalRecsPerTheme,
      ANALYTICS_KEYS.globalProgressCadence,
      ANALYTICS_KEYS.globalSourceTimeline,
    ]) {
      const cached = await getCached(ctxRepo, key);
      expect(cached?.value).toBeDefined();
    }
  });
});
