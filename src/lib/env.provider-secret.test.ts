import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const base = {
  APP_MODE: 'local',
  DATABASE_URL: 'postgres://localhost:5432/app',
};

describe('PROVIDER_SECRET_KEY', () => {
  it('defaults to a dev value in local mode', () => {
    const env = loadEnv({ ...base });
    expect(env.PROVIDER_SECRET_KEY.length).toBeGreaterThanOrEqual(32);
  });

  it('accepts an override in local mode', () => {
    const env = loadEnv({ ...base, PROVIDER_SECRET_KEY: 'x'.repeat(40) });
    expect(env.PROVIDER_SECRET_KEY).toBe('x'.repeat(40));
  });

  it('is required in hosted mode', () => {
    expect(() =>
      loadEnv({
        APP_MODE: 'hosted',
        DATABASE_URL: 'postgres://localhost:5432/app',
        BETTER_AUTH_SECRET: 'y'.repeat(32),
        BETTER_AUTH_URL: 'http://localhost:3000',
        FILE_TOKEN_SECRET: 'z'.repeat(32),
        // PROVIDER_SECRET_KEY intentionally omitted
      }),
    ).toThrow(/PROVIDER_SECRET_KEY/);
  });
});
