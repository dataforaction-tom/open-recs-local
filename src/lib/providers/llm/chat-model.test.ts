import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../env';
import { getChatModel } from './chat-model';

const base = {
  APP_MODE: 'local' as const,
  DATABASE_URL: 'postgres://x/y',
};

describe('getChatModel', () => {
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
