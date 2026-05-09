import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listModels } from './discover';

type FetchCall = { url: string; init: RequestInit };

function stubFetch(response: Response): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
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
    for (const [k, v] of headers) if (k.toLowerCase() === target) return v;
    return undefined;
  }
  for (const [k, v] of Object.entries(headers as Record<string, string>)) {
    if (k.toLowerCase() === target) return v;
  }
  return undefined;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Canned response shapes. Ollama and OpenAI both implement OpenAI's
// `/v1/models` contract — `{ data: [{ id, object, created, owned_by }] }` —
// so the parser treats them identically.
const OLLAMA_SHAPE = {
  data: [
    { id: 'llama3.1:8b', object: 'model', created: 0, owned_by: 'library' },
    { id: 'nomic-embed-text', object: 'model', created: 0, owned_by: 'library' },
  ],
};

const OPENAI_SHAPE = {
  data: [
    { id: 'gpt-4o-mini', object: 'model', created: 1_700_000_000, owned_by: 'openai' },
    { id: 'text-embedding-3-small', object: 'model', created: 1_700_000_000, owned_by: 'openai' },
  ],
};

describe('listModels', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('calls <baseUrl>/models with Bearer auth when apiKey set', async () => {
    const { calls } = stubFetch(jsonResponse(OPENAI_SHAPE));
    const models = await listModels('https://api.openai.com/v1', 'sk-test');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/models');
    expect(headerValue(calls[0]!.init, 'authorization')).toBe('Bearer sk-test');
    expect(models).toEqual([{ id: 'gpt-4o-mini' }, { id: 'text-embedding-3-small' }]);
  });

  it('omits Authorization when apiKey is undefined', async () => {
    const { calls } = stubFetch(jsonResponse(OLLAMA_SHAPE));
    await listModels('http://ollama:11434/v1');

    expect(headerValue(calls[0]!.init, 'authorization')).toBeUndefined();
  });

  it('parses Ollama-shape response', async () => {
    stubFetch(jsonResponse(OLLAMA_SHAPE));
    const models = await listModels('http://ollama:11434/v1');
    expect(models).toEqual([{ id: 'llama3.1:8b' }, { id: 'nomic-embed-text' }]);
  });

  it('parses OpenAI-shape response', async () => {
    stubFetch(jsonResponse(OPENAI_SHAPE));
    const models = await listModels('https://api.openai.com/v1', 'sk');
    expect(models).toEqual([{ id: 'gpt-4o-mini' }, { id: 'text-embedding-3-small' }]);
  });

  it('throws on non-2xx response', async () => {
    stubFetch(new Response('nope', { status: 503 }));
    await expect(listModels('http://ollama:11434/v1')).rejects.toThrow(/503/);
  });

  it('trims trailing slash on baseUrl', async () => {
    const { calls } = stubFetch(jsonResponse(OLLAMA_SHAPE));
    await listModels('http://ollama:11434/v1/');
    expect(calls[0]!.url).toBe('http://ollama:11434/v1/models');
  });
});
