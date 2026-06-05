import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type DbClient } from '../db/client';
import { loadEnv, type Env } from '../env';
import { encryptSecret } from '../security/secrets';
import { upsertProviderSetting } from '../repositories/provider-settings';
import { clearProviderCache, getProviders, loadProviderConfig } from './config';

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
