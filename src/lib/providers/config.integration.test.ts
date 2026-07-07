import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type DbClient } from '../db/client';
import { loadEnv, type Env } from '../env';
import { encryptSecret } from '../security/secrets';
import { upsertProviderSetting } from '../repositories/provider-settings';
import {
  __cacheProbeForTests,
  clearProviderCache,
  getProviders,
  loadProviderConfig,
  resetWebProviderSettingsListenerForTests,
  startWebProviderSettingsListener,
} from './config';

let pg: StartedPg;
let client: DbClient;

function env(): Env {
  return loadEnv({ APP_MODE: 'local', DATABASE_URL: pg.url, PROVIDER_SECRET_KEY: 'k'.repeat(40) });
}

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
  client = createDb(pg.url);
}, 120_000);

afterAll(async () => {
  await resetWebProviderSettingsListenerForTests();
  await client?.sql.end();
  await pg?.container.stop();
});

beforeEach(() => {
  clearProviderCache();
});

describe('loadProviderConfig', () => {
  it('merges a DB row over env and decrypts the API key', async () => {
    await upsertProviderSetting(client.db, {
      kind: 'llm',
      provider: 'openai-compatible',
      baseUrl: 'http://db-ollama/v1',
      model: 'db-model',
      apiKeyEncrypted: encryptSecret('k'.repeat(40), 'sk-secret'),
      extra: {},
      updatedBy: 'system',
    });

    const merged = await loadProviderConfig(client.db, env());
    expect(merged.LLM_PROVIDER).toBe('openai-compatible');
    expect(merged.LLM_BASE_URL).toBe('http://db-ollama/v1');
    expect(merged.LLM_API_KEY).toBe('sk-secret');
  });
});

describe('getProviders', () => {
  it('builds providers from DB config', async () => {
    await upsertProviderSetting(client.db, {
      kind: 'embedding',
      provider: 'openai-compatible',
      baseUrl: 'http://db-emb/v1',
      model: 'nomic-embed-text',
      apiKeyEncrypted: null,
      extra: {},
      updatedBy: 'system',
    });

    const providers = await getProviders(client.db, env());
    expect(providers.embedding.name).toBe('openai-compat');
    expect(providers.embedding.model).toBe('nomic-embed-text');
  });

  it('caches until cleared', async () => {
    const first = await getProviders(client.db, env());
    const second = await getProviders(client.db, env());
    expect(second).toBe(first); // same cached instance
    clearProviderCache();
    const third = await getProviders(client.db, env());
    expect(third).not.toBe(first);
  });
});

describe('startWebProviderSettingsListener', () => {
  beforeEach(() => {
    resetWebProviderSettingsListenerForTests();
  });

  it('clears the web-side cache on a NOTIFY event', async () => {
    const handle = await startWebProviderSettingsListener(client.sql);

    try {
      // Populate the cache so we can detect the invalidation.
      await getProviders(client.db, env());
      expect(__cacheProbeForTests()).toBe(true);

      // upsertProviderSetting fires pg_notify on the provider-settings channel.
      await upsertProviderSetting(client.db, {
        kind: 'llm',
        provider: 'openai-compatible',
        baseUrl: 'http://listener-test/v1',
        model: 'listener-model',
        apiKeyEncrypted: null,
        extra: {},
        updatedBy: 'system',
      });

      // postgres-js delivers LISTEN notifications asynchronously; poll until
      // the cache has been cleared or give up after ~2s.
      const deadline = Date.now() + 2_000;
      while (__cacheProbeForTests() && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(__cacheProbeForTests()).toBe(false);
    } finally {
      await handle.unlisten();
    }
  });

  it('does not double-listen when called twice (dev hot-reload guard)', async () => {
    const a = await startWebProviderSettingsListener(client.sql);
    const b = await startWebProviderSettingsListener(client.sql);
    // Second call is a no-op: returns the same singleton handle.
    expect(b).toBe(a);
    await a.unlisten();
  });
});