import { describe, expect, it } from 'vitest';
import { envSchema } from '../env';
import { createProviders } from './index';
import { localAuth } from './auth/local';

function localEnv(overrides: Record<string, string> = {}) {
  return envSchema.parse({
    APP_MODE: 'local',
    DATABASE_URL: 'postgres://x/y',
    ...overrides,
  });
}

describe('createProviders', () => {
  it('returns fakes when all provider selectors default in local mode', () => {
    const providers = createProviders(localEnv());
    expect(providers.auth).toBe(localAuth);
    expect(providers.llm.name).toBe('fake');
    expect(providers.embedding.name).toBe('fake');
    expect(providers.ocr.name).toBe('fake');
    expect(providers.storage.name).toBe('fake');
  });

  it('throws with a clear message when a non-fake LLM provider is selected', () => {
    expect(() =>
      createProviders(localEnv({ LLM_PROVIDER: 'anthropic' })),
    ).toThrow(/llm=anthropic.*not wired yet/i);
  });

  it('returns a BetterAuthProvider in hosted mode', () => {
    const hosted = envSchema.parse({
      APP_MODE: 'hosted',
      DATABASE_URL: 'postgres://x/y',
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      BETTER_AUTH_URL: 'http://localhost:3000',
      FILE_TOKEN_SECRET: 'x'.repeat(32),
    });
    // Constructing the provider opens a postgres-js client lazily; we don't
    // need the connection to actually open to verify the factory branch
    // returns *something* implementing the AuthProvider shape.
    const providers = createProviders(hosted);
    expect(providers.auth).toBeDefined();
    expect(typeof providers.auth.getContext).toBe('function');
  });
});
