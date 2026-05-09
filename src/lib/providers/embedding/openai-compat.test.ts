import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOpenAICompatEmbedding } from './openai-compat';
import { loadEnv } from '../../env';
import { EMBEDDING_DIM } from '../../db/schema';

// The AI SDK issues requests via global `fetch`. We stub it to keep the tests
// offline and to assert on the exact URL / headers / body the adapter produces.
const BASE_URL = 'http://emb.test/v1';

type EmbeddingsBody = { model: string; input: string[] | string };

/** Build a fixed-length vector deterministically — avoids giant literals in tests. */
function makeVector(dim: number, offset: number): number[] {
  return Array.from({ length: dim }, (_, i) => (i + offset) / dim);
}

function embeddingsResponse(vectors: number[][], model = 'nomic-embed-text'): unknown {
  return {
    object: 'list',
    data: vectors.map((embedding, index) => ({
      object: 'embedding',
      embedding,
      index,
    })),
    model,
    usage: { prompt_tokens: 10, total_tokens: 10 },
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

type FetchCall = { url: string; init: RequestInit; body: EmbeddingsBody };

function stubFetch(body: unknown): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const raw = init.body;
    const parsed =
      typeof raw === 'string' ? (JSON.parse(raw) as EmbeddingsBody) : ({} as EmbeddingsBody);
    calls.push({ url, init, body: parsed });
    return jsonResponse(body);
  });
  vi.stubGlobal('fetch', fetchStub);
  return { calls };
}

function headerValue(init: RequestInit, name: string): string | undefined {
  const headers = init.headers;
  if (!headers) return undefined;
  const target = name.toLowerCase();
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }
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

describe('openai-compat embedding provider', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs /embeddings with model + input array and Bearer auth when apiKey set', async () => {
    const v1 = makeVector(EMBEDDING_DIM, 1);
    const v2 = makeVector(EMBEDDING_DIM, 2);
    const { calls } = stubFetch(embeddingsResponse([v1, v2]));

    const emb = createOpenAICompatEmbedding({
      baseUrl: BASE_URL,
      apiKey: 'sk-test-123',
      model: 'nomic-embed-text',
    });
    const out = await emb.embed(['first', 'second']);

    expect(out).toHaveLength(2);
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe('http://emb.test/v1/embeddings');
    expect(call.init.method).toBe('POST');
    expect(headerValue(call.init, 'authorization')).toBe('Bearer sk-test-123');
    expect(call.body.model).toBe('nomic-embed-text');
    expect(call.body.input).toEqual(['first', 'second']);
  });

  it('omits Authorization header when apiKey is unset', async () => {
    const v = makeVector(EMBEDDING_DIM, 0);
    const { calls } = stubFetch(embeddingsResponse([v]));

    const emb = createOpenAICompatEmbedding({
      baseUrl: BASE_URL,
      model: 'local-embed',
    });
    await emb.embed(['hello']);

    expect(calls).toHaveLength(1);
    expect(headerValue(calls[0]!.init, 'authorization')).toBeUndefined();
  });

  it('returns vectors of length EMBEDDING_DIM in the same order as inputs', async () => {
    const v1 = makeVector(EMBEDDING_DIM, 11);
    const v2 = makeVector(EMBEDDING_DIM, 22);
    stubFetch(embeddingsResponse([v1, v2]));

    const emb = createOpenAICompatEmbedding({
      baseUrl: BASE_URL,
      apiKey: 'k',
      model: 'm',
    });
    const out = await emb.embed(['a', 'b']);

    expect(out[0]).toHaveLength(EMBEDDING_DIM);
    expect(out[1]).toHaveLength(EMBEDDING_DIM);
    expect(out[0]).toEqual(v1);
    expect(out[1]).toEqual(v2);
  });

  it('throws when any returned vector has the wrong dimension', async () => {
    const wrong = makeVector(512, 0);
    stubFetch(embeddingsResponse([wrong]));

    const emb = createOpenAICompatEmbedding({
      baseUrl: BASE_URL,
      apiKey: 'k',
      model: 'bad-model',
    });

    await expect(emb.embed(['x'])).rejects.toThrow(/768.*512|512.*768/);
  });

  it('exposes name, model, and dimensions fields', () => {
    const emb = createOpenAICompatEmbedding({
      baseUrl: BASE_URL,
      model: 'nomic-embed-text',
    });
    expect(emb.name).toBe('openai-compat');
    expect(emb.model).toBe('nomic-embed-text');
    expect(emb.dimensions).toBe(EMBEDDING_DIM);
  });
});

describe('env + factory wiring for openai-compatible embedding', () => {
  it('loadEnv throws when EMBEDDING_PROVIDER=openai-compatible but EMBEDDING_BASE_URL is missing', () => {
    expect(() =>
      loadEnv({
        APP_MODE: 'local',
        DATABASE_URL: 'postgres://x/y',
        EMBEDDING_PROVIDER: 'openai-compatible',
        EMBEDDING_MODEL: 'nomic-embed-text',
      }),
    ).toThrow(/EMBEDDING_BASE_URL/);
  });

  it('loadEnv throws when EMBEDDING_PROVIDER=openai-compatible but EMBEDDING_MODEL is missing', () => {
    expect(() =>
      loadEnv({
        APP_MODE: 'local',
        DATABASE_URL: 'postgres://x/y',
        EMBEDDING_PROVIDER: 'openai-compatible',
        EMBEDDING_BASE_URL: 'http://ollama:11434/v1',
      }),
    ).toThrow(/EMBEDDING_MODEL/);
  });

  it('loadEnv accepts a fully-configured openai-compatible embedding setup', () => {
    const env = loadEnv({
      APP_MODE: 'local',
      DATABASE_URL: 'postgres://x/y',
      EMBEDDING_PROVIDER: 'openai-compatible',
      EMBEDDING_BASE_URL: 'http://ollama:11434/v1',
      EMBEDDING_MODEL: 'nomic-embed-text',
    });
    expect(env.EMBEDDING_PROVIDER).toBe('openai-compatible');
    expect(env.EMBEDDING_BASE_URL).toBe('http://ollama:11434/v1');
    expect(env.EMBEDDING_MODEL).toBe('nomic-embed-text');
    expect(env.EMBEDDING_API_KEY).toBeUndefined();
  });
});
