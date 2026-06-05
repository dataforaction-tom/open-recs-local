import { describe, expect, it } from 'vitest';
import { loadEnv, type Env } from '../env';
import { mergeProviderConfig, type DecryptedProviderRow } from './config';

function baseEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    APP_MODE: 'local',
    DATABASE_URL: 'postgres://localhost:5432/app',
    ...overrides,
  });
}

describe('mergeProviderConfig', () => {
  it('returns env unchanged when there are no rows', () => {
    const env = baseEnv({ LLM_PROVIDER: 'fake' });
    expect(mergeProviderConfig(env, [])).toEqual(env);
  });

  it('overrides LLM_* from an llm row', () => {
    const env = baseEnv();
    const rows: DecryptedProviderRow[] = [
      {
        kind: 'llm',
        provider: 'openai-compatible',
        baseUrl: 'http://ollama/v1',
        model: 'llama3.1',
        apiKey: 'sk-abc',
        extra: {},
      },
    ];
    const merged = mergeProviderConfig(env, rows);
    expect(merged.LLM_PROVIDER).toBe('openai-compatible');
    expect(merged.LLM_BASE_URL).toBe('http://ollama/v1');
    expect(merged.LLM_MODEL).toBe('llama3.1');
    expect(merged.LLM_API_KEY).toBe('sk-abc');
  });

  it('maps an embedding row to EMBEDDING_*', () => {
    const env = baseEnv();
    const merged = mergeProviderConfig(env, [
      {
        kind: 'embedding',
        provider: 'openai-compatible',
        baseUrl: 'http://emb/v1',
        model: 'nomic-embed-text',
        apiKey: null,
        extra: {},
      },
    ]);
    expect(merged.EMBEDDING_PROVIDER).toBe('openai-compatible');
    expect(merged.EMBEDDING_BASE_URL).toBe('http://emb/v1');
    expect(merged.EMBEDDING_MODEL).toBe('nomic-embed-text');
    expect(merged.EMBEDDING_API_KEY).toBeUndefined();
  });

  it('maps an ocr docling row to OCR_PROVIDER + DOCLING_BASE_URL', () => {
    const merged = mergeProviderConfig(baseEnv(), [
      { kind: 'ocr', provider: 'docling', baseUrl: 'http://docling:5001', model: null, apiKey: null, extra: {} },
    ]);
    expect(merged.OCR_PROVIDER).toBe('docling');
    expect(merged.DOCLING_BASE_URL).toBe('http://docling:5001');
  });

  it('maps an ocr mistral row to OCR_PROVIDER + MISTRAL_API_KEY (+ base url)', () => {
    const merged = mergeProviderConfig(baseEnv(), [
      { kind: 'ocr', provider: 'mistral', baseUrl: 'https://api.mistral.ai', model: null, apiKey: 'sk-mistral', extra: {} },
    ]);
    expect(merged.OCR_PROVIDER).toBe('mistral');
    expect(merged.MISTRAL_API_KEY).toBe('sk-mistral');
    expect(merged.MISTRAL_BASE_URL).toBe('https://api.mistral.ai');
  });

  it('maps a chat row to CHAT_*', () => {
    const merged = mergeProviderConfig(baseEnv(), [
      { kind: 'chat', provider: 'openai-compatible', baseUrl: 'http://chat/v1', model: 'small', apiKey: 'sk-chat', extra: {} },
    ]);
    expect(merged.CHAT_PROVIDER).toBe('openai-compatible');
    expect(merged.CHAT_BASE_URL).toBe('http://chat/v1');
    expect(merged.CHAT_MODEL).toBe('small');
    expect(merged.CHAT_API_KEY).toBe('sk-chat');
  });

  it('keeps env base URL when a row only sets the model', () => {
    const env = baseEnv({
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'http://env-base/v1',
      LLM_MODEL: 'env-model',
    });
    const merged = mergeProviderConfig(env, [
      { kind: 'llm', provider: 'openai-compatible', baseUrl: null, model: 'db-model', apiKey: null, extra: {} },
    ]);
    expect(merged.LLM_BASE_URL).toBe('http://env-base/v1');
    expect(merged.LLM_MODEL).toBe('db-model');
  });
});
