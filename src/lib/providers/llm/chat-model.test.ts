import { describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../../env';
import { getChatModel, getChatModelFromConfig } from './chat-model';

const base = {
  APP_MODE: 'local' as const,
  DATABASE_URL: 'postgres://x/y',
};

describe('getChatModelFromConfig', () => {
  it('returns null when neither CHAT_PROVIDER nor LLM_PROVIDER is openai-compatible', () => {
    const env = loadEnv({ ...base, LLM_PROVIDER: 'fake' });
    expect(getChatModelFromConfig(env)).toBeNull();
  });

  it('builds a model from LLM_* when CHAT_* is unset', () => {
    const env = loadEnv({
      ...base,
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'http://localhost:11434/v1',
      LLM_MODEL: 'llama3.1:8b',
    });
    const model = getChatModelFromConfig(env);
    expect(model).not.toBeNull();
    expect(typeof model === 'object' && model && 'modelId' in model ? model.modelId : model).toBe(
      'llama3.1:8b',
    );
  });

  it('CHAT_* overrides LLM_* when both are set', () => {
    const env = loadEnv({
      ...base,
      LLM_PROVIDER: 'fake',
      CHAT_PROVIDER: 'openai-compatible',
      CHAT_BASE_URL: 'http://localhost:11434/v1',
      CHAT_MODEL: 'qwen2.5:0.5b',
    });
    const model = getChatModelFromConfig(env);
    expect(model).not.toBeNull();
    expect(typeof model === 'object' && model && 'modelId' in model ? model.modelId : model).toBe(
      'qwen2.5:0.5b',
    );
  });

  it('honours CHAT_BASE_URL while inheriting LLM_MODEL', () => {
    const env = loadEnv({
      ...base,
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'http://other:11434/v1',
      LLM_MODEL: 'llama3.1:8b',
      CHAT_BASE_URL: 'http://chat-host:11434/v1',
    });
    const model = getChatModelFromConfig(env);
    expect(model).not.toBeNull();
    expect(typeof model === 'object' && model && 'modelId' in model ? model.modelId : model).toBe(
      'llama3.1:8b',
    );
  });

  it('returns null when baseURL is missing', () => {
    // Bypass loadEnv validation — we're testing the function's null-handling,
    // not env validation. Env would normally reject this combination.
    const env = {
      ...loadEnv({ ...base, LLM_PROVIDER: 'fake' }),
      LLM_PROVIDER: 'openai-compatible',
      LLM_MODEL: 'llama3.1:8b',
      LLM_BASE_URL: undefined,
    } as unknown as Parameters<typeof getChatModelFromConfig>[0];
    expect(getChatModelFromConfig(env)).toBeNull();
  });

  it('returns null when model is missing', () => {
    const env = {
      ...loadEnv({ ...base, LLM_PROVIDER: 'fake' }),
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'http://localhost:11434/v1',
      LLM_MODEL: undefined,
    } as unknown as Parameters<typeof getChatModelFromConfig>[0];
    expect(getChatModelFromConfig(env)).toBeNull();
  });

  it('reflects a DB-merged config where chat row overrides llm env defaults', () => {
    // Simulate the output of loadProviderConfig: env has LLM_* set, DB merged
    // a CHAT_* row that overrides provider + model but inherits nothing else.
    const merged = loadEnv({
      ...base,
      LLM_PROVIDER: 'fake',
      LLM_BASE_URL: 'http://llm-host:11434/v1',
      LLM_MODEL: 'llama3.1:8b',
      // DB row for chat kind:
      CHAT_PROVIDER: 'openai-compatible',
      CHAT_BASE_URL: 'http://chat-host:11434/v1',
      CHAT_MODEL: 'qwen2.5:0.5b',
      CHAT_API_KEY: 'sk-from-db',
    });
    const model = getChatModelFromConfig(merged);
    expect(model).not.toBeNull();
    expect(typeof model === 'object' && model && 'modelId' in model ? model.modelId : model).toBe(
      'qwen2.5:0.5b',
    );
  });
});

describe('getChatModel (backwards-compatible wrapper)', () => {
  it('delegates to getChatModelFromConfig', () => {
    const env = loadEnv({
      ...base,
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'http://localhost:11434/v1',
      LLM_MODEL: 'llama3.1:8b',
    });
    // Both should produce a model with the same modelId (wrapper delegates).
    const a = getChatModel(env);
    const b = getChatModelFromConfig(env);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    const idOf = (m: unknown) =>
      typeof m === 'object' && m && 'modelId' in m ? (m as { modelId: string }).modelId : m;
    expect(idOf(a)).toBe(idOf(b));
  });

  it('returns null when neither CHAT_PROVIDER nor LLM_PROVIDER is openai-compatible', () => {
    const env = loadEnv({ ...base, LLM_PROVIDER: 'fake' });
    expect(getChatModel(env)).toBeNull();
  });

  it('builds a model from LLM_* when CHAT_* is unset', () => {
    const env = loadEnv({
      ...base,
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'http://localhost:11434/v1',
      LLM_MODEL: 'llama3.1:8b',
    });
    const model = getChatModel(env);
    expect(model).not.toBeNull();
    expect(typeof model === 'object' && model && 'modelId' in model ? model.modelId : model).toBe(
      'llama3.1:8b',
    );
  });

  it('CHAT_* overrides LLM_* when both are set', () => {
    const env = loadEnv({
      ...base,
      LLM_PROVIDER: 'fake',
      CHAT_PROVIDER: 'openai-compatible',
      CHAT_BASE_URL: 'http://localhost:11434/v1',
      CHAT_MODEL: 'qwen2.5:0.5b',
    });
    const model = getChatModel(env);
    expect(model).not.toBeNull();
    expect(typeof model === 'object' && model && 'modelId' in model ? model.modelId : model).toBe(
      'qwen2.5:0.5b',
    );
  });

  it('honours CHAT_BASE_URL while inheriting LLM_MODEL', () => {
    const env = loadEnv({
      ...base,
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'http://other:11434/v1',
      LLM_MODEL: 'llama3.1:8b',
      CHAT_BASE_URL: 'http://chat-host:11434/v1',
    });
    const model = getChatModel(env);
    // With CHAT_PROVIDER unset the effective provider is still LLM_PROVIDER,
    // but the base URL preference is CHAT_BASE_URL when both are set.
    expect(model).not.toBeNull();
    expect(typeof model === 'object' && model && 'modelId' in model ? model.modelId : model).toBe(
      'llama3.1:8b',
    );
  });
});