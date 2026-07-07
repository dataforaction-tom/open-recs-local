import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startPostgres, type StartedPg } from '@/../tests/helpers/pg-container';
import { applyMigrations } from '@/../tests/helpers/migrate';
import { createDb, type DbClient } from '@/lib/db/client';
import { loadEnv, type Env } from '@/lib/env';
import { encryptSecret } from '@/lib/security/secrets';
import { upsertProviderSetting } from '@/lib/repositories/provider-settings';
import { GET } from './route';

// Integration test for the admin-gated model-discovery route. Spins up a real
// Postgres (Testcontainers) so the stored-config fallback path can be exercised
// against a real `provider_settings` row, and stubs `fetch` so the live
// `/v1/models` round-trip stays offline.

let pg: StartedPg;
let client: DbClient;

function env(): Env {
  return loadEnv({
    APP_MODE: 'local',
    DATABASE_URL: pg.url,
    PROVIDER_SECRET_KEY: 'k'.repeat(40),
  });
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function modelsPayload(): unknown {
  return {
    object: 'list',
    data: [
      { id: 'llama3.1:8b', object: 'model', created: 0, owned_by: 'library' },
      { id: 'nomic-embed-text', object: 'model', created: 0, owned_by: 'library' },
    ],
  };
}

function stubFetch(response: Response): { calls: { url: string; init: RequestInit }[] } {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    return response;
  });
  vi.stubGlobal('fetch', fetchStub);
  return { calls };
}

function headerValue(init: RequestInit, name: string): string | undefined {
  const headers = init.headers;
  if (!headers) return undefined;
  const target = name.toLowerCase();
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      if (key.toLowerCase() === target) return value;
    }
    return undefined;
  }
  const asRecord = headers as Record<string, string>;
  for (const [key, value] of Object.entries(asRecord)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

function buildGetReq(kind: string, query: { baseUrl?: string; apiKey?: string } = {}): Request {
  const qs = new URLSearchParams();
  if (query.baseUrl !== undefined) qs.set('baseUrl', query.baseUrl);
  if (query.apiKey !== undefined) qs.set('apiKey', query.apiKey);
  const search = qs.toString();
  const url = `http://localhost/api/settings/providers/${kind}/models${search ? `?${search}` : ''}`;
  return new Request(url, { method: 'GET' });
}

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
  client = createDb(pg.url);
  // The route calls loadEnv() internally (reads process.env). Set the env vars
  // the route needs so its loadEnv() produces a valid local-mode Env pointing
  // at the Testcontainers Postgres.
  process.env.APP_MODE = 'local';
  process.env.DATABASE_URL = pg.url;
  process.env.PROVIDER_SECRET_KEY = 'k'.repeat(40);
}, 120_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await client?.sql.end();
  await pg?.container.stop();
});

// Silence the unused-var lint — `env()` documents the env shape for future
// tests that need to vary it; the route reads env from loadEnv() internally.
void env;

describe('GET /api/settings/providers/[kind]/models', () => {
  it('returns 200 with models for kind=llm when baseUrl+apiKey provided', async () => {
    vi.unstubAllGlobals();
    const { calls } = stubFetch(jsonResponse(modelsPayload()));
    const req = buildGetReq('llm', { baseUrl: 'http://ollama:11434/v1', apiKey: 'sk-test' });
    const res = await GET(req, { params: Promise.resolve({ kind: 'llm' }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { kind: string; baseUrl: string; models: { id: string }[] };
    expect(body.kind).toBe('llm');
    expect(body.baseUrl).toBe('http://ollama:11434/v1');
    expect(body.models).toEqual([{ id: 'llama3.1:8b' }, { id: 'nomic-embed-text' }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://ollama:11434/v1/models');
    expect(headerValue(calls[0]!.init, 'authorization')).toBe('Bearer sk-test');
  });

  it('returns 200 with models for kind=embedding', async () => {
    vi.unstubAllGlobals();
    const { calls } = stubFetch(jsonResponse(modelsPayload()));
    const req = buildGetReq('embedding', { baseUrl: 'http://emb.test/v1' });
    const res = await GET(req, { params: Promise.resolve({ kind: 'embedding' }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { kind: string; models: { id: string }[] };
    expect(body.kind).toBe('embedding');
    expect(body.models).toHaveLength(2);
    // No apiKey provided → no Authorization header.
    expect(headerValue(calls[0]!.init, 'authorization')).toBeUndefined();
  });

  it('returns 200 with models for kind=chat', async () => {
    vi.unstubAllGlobals();
    stubFetch(jsonResponse(modelsPayload()));
    const req = buildGetReq('chat', { baseUrl: 'http://chat.test/v1', apiKey: 'sk-chat' });
    const res = await GET(req, { params: Promise.resolve({ kind: 'chat' }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { kind: string };
    expect(body.kind).toBe('chat');
  });

  it('returns 400 for an invalid kind', async () => {
    const req = buildGetReq('bogus', { baseUrl: 'http://x/v1' });
    const res = await GET(req, { params: Promise.resolve({ kind: 'bogus' }) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/invalid kind/);
  });

  it('returns 400 for kind=ocr (model discovery not applicable)', async () => {
    vi.unstubAllGlobals();
    // Stub a failing fetch to prove it is never called for ocr.
    const fetchStub = vi.fn(async () => new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchStub);
    const req = buildGetReq('ocr', { baseUrl: 'http://docling:5001' });
    const res = await GET(req, { params: Promise.resolve({ kind: 'ocr' }) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/ocr|not supported/);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('returns 400 when baseUrl is missing and no stored config exists', async () => {
    vi.unstubAllGlobals();
    stubFetch(jsonResponse(modelsPayload())); // would 200 if reached
    const req = buildGetReq('embedding', {}); // no baseUrl, no apiKey
    const res = await GET(req, { params: Promise.resolve({ kind: 'embedding' }) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/baseUrl/i);
  });

  it('falls back to stored baseUrl + decrypted apiKey when query params are blank', async () => {
    vi.unstubAllGlobals();
    const { calls } = stubFetch(jsonResponse(modelsPayload()));
    // Seed a stored row with an encrypted key for kind=llm.
    await upsertProviderSetting(client.db, {
      kind: 'llm',
      provider: 'openai-compatible',
      baseUrl: 'http://stored.test/v1',
      model: 'llama3.1:8b',
      apiKeyEncrypted: encryptSecret('k'.repeat(40), '***stored***'),
      extra: {},
      updatedBy: 'system',
    });
    // No query params → route should pull baseUrl + apiKey from storage.
    const req = buildGetReq('llm', {});
    const res = await GET(req, { params: Promise.resolve({ kind: 'llm' }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { baseUrl: string };
    expect(body.baseUrl).toBe('http://stored.test/v1');
    expect(calls[0]!.url).toBe('http://stored.test/v1/models');
    expect(headerValue(calls[0]!.init, 'authorization')).toBe('Bearer ***stored***');
  });

  it('returns 502 when the upstream models endpoint is unreachable', async () => {
    vi.unstubAllGlobals();
    const fetchStub = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    vi.stubGlobal('fetch', fetchStub);
    const req = buildGetReq('llm', { baseUrl: 'http://down.test/v1' });
    const res = await GET(req, { params: Promise.resolve({ kind: 'llm' }) });
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/ECONNREFUSED|models endpoint/);
  });

  it('trims a trailing slash on baseUrl before appending /models', async () => {
    vi.unstubAllGlobals();
    const { calls } = stubFetch(jsonResponse(modelsPayload()));
    const req = buildGetReq('llm', { baseUrl: 'http://ollama:11434/v1/' });
    const res = await GET(req, { params: Promise.resolve({ kind: 'llm' }) });
    expect(res.status).toBe(200);
    expect(calls[0]!.url).toBe('http://ollama:11434/v1/models');
  });
});