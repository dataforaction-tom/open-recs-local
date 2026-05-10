import { describe, expect, it } from 'vitest';
import { loadEnv } from '../env';
import { getPublicConfig } from './public';

const baseEnv = {
  DATABASE_URL: 'postgres://test/test',
  LLM_PROVIDER: 'fake' as const,
  EMBEDDING_PROVIDER: 'fake' as const,
  OCR_PROVIDER: 'fake' as const,
  STORAGE_PROVIDER: 'fake' as const,
};

describe('getPublicConfig', () => {
  it('disables auth/ownership/admin in local mode', () => {
    const env = loadEnv({ ...baseEnv, APP_MODE: 'local' });
    const config = getPublicConfig(env);
    expect(config.appMode).toBe('local');
    expect(config.features.auth).toBe(false);
    expect(config.features.ownership).toBe(false);
    expect(config.features.admin).toBe(false);
  });

  it('enables auth/ownership/admin in hosted mode', () => {
    const env = loadEnv({
      ...baseEnv,
      APP_MODE: 'hosted',
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      BETTER_AUTH_URL: 'http://localhost:3000',
      FILE_TOKEN_SECRET: 'a'.repeat(32),
    });
    const config = getPublicConfig(env);
    expect(config.appMode).toBe('hosted');
    expect(config.features.auth).toBe(true);
    expect(config.features.ownership).toBe(true);
    expect(config.features.admin).toBe(true);
  });

  it('returns plain JSON-serialisable data only', () => {
    const env = loadEnv({ ...baseEnv, APP_MODE: 'local' });
    const config = getPublicConfig(env);
    expect(JSON.parse(JSON.stringify(config))).toEqual(config);
  });
});
