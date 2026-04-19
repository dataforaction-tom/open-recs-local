import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('fails when APP_MODE is missing', () => {
    expect(() => loadEnv({})).toThrow(/APP_MODE/);
  });

  it('accepts local mode without auth secret', () => {
    const env = loadEnv({ APP_MODE: 'local', DATABASE_URL: 'postgres://x/y' });
    expect(env.APP_MODE).toBe('local');
  });

  it('requires BETTER_AUTH_SECRET in hosted mode', () => {
    expect(() =>
      loadEnv({ APP_MODE: 'hosted', DATABASE_URL: 'postgres://x/y' }),
    ).toThrow(/BETTER_AUTH_SECRET/);
  });
});
