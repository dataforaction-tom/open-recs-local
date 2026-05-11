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

  it('defaults provider selectors to fake in local mode', () => {
    const env = loadEnv({ APP_MODE: 'local', DATABASE_URL: 'postgres://x/y' });
    expect(env.LLM_PROVIDER).toBe('fake');
    expect(env.EMBEDDING_PROVIDER).toBe('fake');
    expect(env.OCR_PROVIDER).toBe('fake');
    expect(env.STORAGE_PROVIDER).toBe('fake');
  });

  // Regression: docker compose `env_file` passes empty values as "" which made
  // `.url().optional()` fields reject them even though the provider was `fake`.
  it('treats empty strings on optional URL fields as absent', () => {
    const env = loadEnv({
      APP_MODE: 'local',
      DATABASE_URL: 'postgres://x/y',
      LLM_PROVIDER: 'fake',
      LLM_BASE_URL: '',
      LLM_MODEL: '',
      LLM_API_KEY: '',
      EMBEDDING_PROVIDER: 'fake',
      EMBEDDING_BASE_URL: '',
      EMBEDDING_MODEL: '',
      EMBEDDING_API_KEY: '',
    });
    expect(env.LLM_BASE_URL).toBeUndefined();
    expect(env.EMBEDDING_BASE_URL).toBeUndefined();
  });

  it('defaults EMAIL_PROVIDER to console', () => {
    const env = loadEnv({ APP_MODE: 'local', DATABASE_URL: 'postgres://x/y' });
    expect(env.EMAIL_PROVIDER).toBe('console');
  });

  it('rejects EMAIL_PROVIDER=resend without RESEND_API_KEY', () => {
    expect(() =>
      loadEnv({
        APP_MODE: 'local',
        DATABASE_URL: 'postgres://x/y',
        EMAIL_PROVIDER: 'resend',
        RESEND_FROM: 'noreply@app.test',
      }),
    ).toThrow(/RESEND_API_KEY/);
  });

  it('rejects EMAIL_PROVIDER=resend without RESEND_FROM', () => {
    expect(() =>
      loadEnv({
        APP_MODE: 'local',
        DATABASE_URL: 'postgres://x/y',
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_key',
      }),
    ).toThrow(/RESEND_FROM/);
  });

  it('accepts EMAIL_PROVIDER=resend with both required vars', () => {
    const env = loadEnv({
      APP_MODE: 'local',
      DATABASE_URL: 'postgres://x/y',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 're_key',
      RESEND_FROM: 'noreply@app.test',
    });
    expect(env.EMAIL_PROVIDER).toBe('resend');
    expect(env.RESEND_API_KEY).toBe('re_key');
  });
});
