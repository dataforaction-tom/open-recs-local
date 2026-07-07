import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startPostgres, type StartedPg } from '@/../tests/helpers/pg-container';
import { applyMigrations } from '@/../tests/helpers/migrate';
import { createDb, type DbClient } from '@/lib/db/client';
import { loadEnv, type Env } from '@/lib/env';
import { encryptSecret } from '@/lib/security/secrets';
import { upsertProviderSetting } from '@/lib/repositories/provider-settings';
import { POST } from './route';

// This is an integration test for the admin-gated test-connection route. It
// spins up a real Postgres (Testcontainers) so the stored-key fallback path can
// be exercised against a real `provider_settings` row, and stubs `fetch` so the
// live round-trip stays offline.

let pg: StartedPg;
let client: DbClient;

function env(): Env {
  return loadEnv({
    APP_MODE: 'local',
    DATABASE_URL: pg.url,
    PROVIDER_SECRET_KEY: 'k'.repeat(40),
  });
}

function jsonError(status: number): Response {
  return new Response(JSON.stringify({ error: 'mock' }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function chatCompletion(content: string): unknown {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 1_700_000_000,
    model: 'test-model',
    choices: [
      { index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
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

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
  client = createDb(pg.url);
  // The route calls loadEnv() internally (reads process.env). Set the env
  // vars the route needs so its loadEnv() produces a valid local-mode Env
  // pointing at the Testcontainers Postgres.
  process.env.APP_MODE = 'local';
  process.env.DATABASE_URL = pg.url;
  process.env.PROVIDER_SECRET_KEY = 'k'.repeat(40);
}, 120_000);

afterAll(async () => {
  vi.unstubAllGlobals();
  await client?.sql.end();
  await pg?.container.stop();
});

// Silence the unused-var lint — `env()` is here for clarity / future tests that
// need to vary the env shape; the route reads env from loadEnv() internally.
void env;

describe('POST /api/settings/providers/[kind]/test', () => {
  it('returns 200 and ok=true for a working llm config', async () => {
    // Local mode → system context with admin role, so auth always passes here.
    vi.unstubAllGlobals();
    stubFetch(jsonResponse(chatCompletion('ok')));
    const req = new Request('http://localhost/api/settings/providers/llm/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai-compatible',
        baseUrl: 'http://llm.test/v1',
        model: 'llama3.1:8b',
        apiKey: 'sk-test',
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ kind: 'llm' }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; kind: string };
    expect(body.ok).toBe(true);
    expect(body.kind).toBe('llm');
  });

  it('returns 400 for an invalid kind', async () => {
    const req = new Request('http://localhost/api/settings/providers/bogus/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'fake', baseUrl: '', model: '', apiKey: '' }),
    });
    const res = await POST(req, { params: Promise.resolve({ kind: 'bogus' }) });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://localhost/api/settings/providers/llm/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    const res = await POST(req, { params: Promise.resolve({ kind: 'llm' }) });
    expect(res.status).toBe(400);
  });

  it('returns 415 when content-type is not JSON', async () => {
    const req = new Request('http://localhost/api/settings/providers/llm/test', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hi',
    });
    const res = await POST(req, { params: Promise.resolve({ kind: 'llm' }) });
    expect(res.status).toBe(415);
  });

  it('falls back to the stored decrypted key when apiKey is blank', async () => {
    // Seed a stored row with an encrypted key, then test with a blank apiKey.
    // The route should decrypt the stored key and use it as the bearer token.
    vi.unstubAllGlobals();
    const { calls } = stubFetch(jsonResponse(chatCompletion('ok')));
    await upsertProviderSetting(client.db, {
      kind: 'llm',
      provider: 'openai-compatible',
      baseUrl: 'http://llm.test/v1',
      model: 'llama3.1:8b',
      apiKeyEncrypted: encryptSecret('k'.repeat(40), 'sk-stored-secret'),
      extra: {},
      updatedBy: 'system',
    });

    const req = new Request('http://localhost/api/settings/providers/llm/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai-compatible',
        baseUrl: 'http://llm.test/v1',
        model: 'llama3.1:8b',
        apiKey: '',
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ kind: 'llm' }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    // The stored key was used as the bearer token, not a blank string.
    expect(headerValue(calls[0]!.init, 'authorization')).toBe('Bearer sk-stored-secret');
  });

  it('returns the detected dimension for embedding', async () => {
    vi.unstubAllGlobals();
    const vec = Array.from({ length: 768 }, (_, i) => i / 768);
    stubFetch(
      jsonResponse({
        object: 'list',
        data: [{ object: 'embedding', embedding: vec, index: 0 }],
        model: 'nomic-embed-text',
        usage: { prompt_tokens: 5, total_tokens: 5 },
      }),
    );
    const req = new Request('http://localhost/api/settings/providers/embedding/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai-compatible',
        baseUrl: 'http://emb.test/v1',
        model: 'nomic-embed-text',
        apiKey: 'sk-emb',
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ kind: 'embedding' }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; dimension: number };
    expect(body.ok).toBe(true);
    expect(body.dimension).toBe(768);
  });

  it('returns ok=true for a fake provider without any network call', async () => {
    vi.unstubAllGlobals();
    stubFetch(jsonError(500)); // would fail if called
    const req = new Request('http://localhost/api/settings/providers/llm/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'fake', baseUrl: '', model: '', apiKey: '' }),
    });
    const res = await POST(req, { params: Promise.resolve({ kind: 'llm' }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('returns ok=false (200) when the server is unreachable', async () => {
    vi.unstubAllGlobals();
    const fetchStub = vi.fn(async () => {
      throw new Error('fetch failed: ECONNREFUSED');
    });
    vi.stubGlobal('fetch', fetchStub);
    const req = new Request('http://localhost/api/settings/providers/llm/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai-compatible',
        baseUrl: 'http://down.test/v1',
        model: 'llama3.1:8b',
        apiKey: 'sk-test',
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ kind: 'llm' }) });
    // The route returns 200 with ok=false so the UI can render the message.
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/ECONNREFUSED|fetch failed/);
  });

  it('checks docling reachability via GET /health', async () => {
    vi.unstubAllGlobals();
    const { calls } = stubFetch(new Response('ok', { status: 200 }));
    const req = new Request('http://localhost/api/settings/providers/ocr/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'docling',
        baseUrl: 'http://docling.test:5001',
        model: '',
        apiKey: '',
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ kind: 'ocr' }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(calls[0]!.url).toBe('http://docling.test:5001/health');
  });
});