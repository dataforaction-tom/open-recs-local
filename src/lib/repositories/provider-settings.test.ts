import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type DbClient } from '../db/client';
import { listProviderSettings, upsertProviderSetting } from './provider-settings';

let pg: StartedPg;
let client: DbClient;

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
  client = createDb(pg.url);
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

describe('providerSettings repo', () => {
  it('upserts a row and reads it back', async () => {
    await upsertProviderSetting(client.db, {
      kind: 'llm',
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3.1',
      apiKeyEncrypted: 'cipher-1',
      extra: { presetId: 'local-ollama' },
      updatedBy: 'system',
    });

    const rows = await listProviderSettings(client.db);
    const llm = rows.find((r) => r.kind === 'llm');
    expect(llm).toMatchObject({
      kind: 'llm',
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3.1',
      apiKeyEncrypted: 'cipher-1',
    });
    expect(llm?.extra).toEqual({ presetId: 'local-ollama' });
  });

  it('upserting the same kind updates in place (no duplicate)', async () => {
    await upsertProviderSetting(client.db, {
      kind: 'embedding',
      provider: 'openai-compatible',
      baseUrl: 'http://a/v1',
      model: 'nomic-embed-text',
      apiKeyEncrypted: null,
      extra: {},
      updatedBy: 'system',
    });
    await upsertProviderSetting(client.db, {
      kind: 'embedding',
      provider: 'openai-compatible',
      baseUrl: 'http://b/v1',
      model: 'nomic-embed-text',
      apiKeyEncrypted: null,
      extra: {},
      updatedBy: 'system',
    });

    const rows = await listProviderSettings(client.db);
    const embeddingRows = rows.filter((r) => r.kind === 'embedding');
    expect(embeddingRows).toHaveLength(1);
    expect(embeddingRows[0]?.baseUrl).toBe('http://b/v1');
  });
});
