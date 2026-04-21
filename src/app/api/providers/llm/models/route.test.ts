import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

// Keys loadEnv reads. Stamped onto process.env per test and restored after.
const envKeys = [
  'APP_MODE',
  'DATABASE_URL',
  'LLM_PROVIDER',
  'LLM_BASE_URL',
  'LLM_API_KEY',
  'LLM_MODEL',
  'EMBEDDING_PROVIDER',
  'OCR_PROVIDER',
  'STORAGE_PROVIDER',
] as const;
const originalEnv: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

function setEnv(overrides: Partial<Record<(typeof envKeys)[number], string | undefined>>): void {
  for (const key of envKeys) {
    const value = overrides[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  for (const key of envKeys) originalEnv[key] = process.env[key];
  vi.unstubAllGlobals();
});

afterEach(() => {
  for (const key of envKeys) {
    const prev = originalEnv[key];
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /api/providers/llm/models', () => {
  it('returns 200 with models when openai-compatible + reachable endpoint', async () => {
    setEnv({
      APP_MODE: 'local',
      DATABASE_URL: 'postgres://x/y',
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'http://ollama:11434/v1',
      LLM_MODEL: 'llama3.1:8b',
      EMBEDDING_PROVIDER: 'fake',
      OCR_PROVIDER: 'fake',
      STORAGE_PROVIDER: 'fake',
    });
    const fetchCalls: Array<RequestInfo | URL> = [];
    const fetchStub = vi.fn(async (input: RequestInfo | URL) => {
      fetchCalls.push(input);
      return jsonOk({
        data: [
          { id: 'llama3.1:8b', object: 'model', created: 0, owned_by: 'library' },
          { id: 'nomic-embed-text', object: 'model', created: 0, owned_by: 'library' },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchStub);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      provider: string;
      baseUrl: string;
      models: { id: string }[];
    };
    expect(body.provider).toBe('openai-compat');
    expect(body.baseUrl).toBe('http://ollama:11434/v1');
    expect(body.models).toEqual([{ id: 'llama3.1:8b' }, { id: 'nomic-embed-text' }]);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(fetchCalls).toHaveLength(1);
    expect(String(fetchCalls[0])).toBe('http://ollama:11434/v1/models');
  });

  it('returns 400 when LLM_PROVIDER=fake', async () => {
    setEnv({
      APP_MODE: 'local',
      DATABASE_URL: 'postgres://x/y',
      LLM_PROVIDER: 'fake',
      EMBEDDING_PROVIDER: 'fake',
      OCR_PROVIDER: 'fake',
      STORAGE_PROVIDER: 'fake',
    });

    const res = await GET();
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/openai-compatible/);
    expect(body.error).toMatch(/fake/);
  });

  it('returns 502 when upstream endpoint unreachable', async () => {
    setEnv({
      APP_MODE: 'local',
      DATABASE_URL: 'postgres://x/y',
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'http://ollama:11434/v1',
      LLM_MODEL: 'llama3.1:8b',
      EMBEDDING_PROVIDER: 'fake',
      OCR_PROVIDER: 'fake',
      STORAGE_PROVIDER: 'fake',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const res = await GET();
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/ECONNREFUSED/);
  });
});
