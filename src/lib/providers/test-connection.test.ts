import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testProviderConnection, type TestConnectionInput } from './test-connection';
import { EMBEDDING_DIM } from '../db/schema';

// Shared fetch-stub harness. The AI SDK and the raw OCR reachability checks all
// go through global `fetch`, so stubbing it keeps these tests fully offline and
// lets us assert on the exact URL / headers / body produced.
function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
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

function embeddingsResponse(vectors: number[][], model = 'nomic-embed-text'): unknown {
  return {
    object: 'list',
    data: vectors.map((embedding, index) => ({ object: 'embedding', embedding, index })),
    model,
    usage: { prompt_tokens: 10, total_tokens: 10 },
  };
}

type FetchCall = { url: string; init: RequestInit };
function stubFetch(response: Response | Response[] | Error): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const queue = Array.isArray(response) ? [...response] : null;
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, init });
    if (response instanceof Error) throw response;
    if (queue) {
      return queue.length > 1 ? queue.shift()! : queue[0]!;
    }
    return response as Response;
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

const LLM_INPUT: TestConnectionInput = {
  kind: 'llm',
  provider: 'openai-compatible',
  baseUrl: 'http://llm.test/v1',
  model: 'llama3.1:8b',
  apiKey: 'sk-test-123',
};

describe('testProviderConnection — llm / chat', () => {
  beforeEach(() => {
    (globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends a tiny completion request and returns ok for llm', async () => {
    const { calls } = stubFetch(jsonResponse(chatCompletion('ok')));
    const result = await testProviderConnection(LLM_INPUT);
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('llm');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://llm.test/v1/chat/completions');
    expect(headerValue(calls[0]!.init, 'authorization')).toBe('Bearer sk-test-123');
  });

  it('returns ok for chat (same completion path)', async () => {
    stubFetch(jsonResponse(chatCompletion('ok')));
    const result = await testProviderConnection({ ...LLM_INPUT, kind: 'chat' });
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('chat');
  });

  it('omits Authorization header when apiKey is blank', async () => {
    const { calls } = stubFetch(jsonResponse(chatCompletion('ok')));
    const result = await testProviderConnection({ ...LLM_INPUT, apiKey: '' });
    expect(result.ok).toBe(true);
    expect(headerValue(calls[0]!.init, 'authorization')).toBeUndefined();
  });

  it('returns failure with message when the server errors', async () => {
    stubFetch(new Response('unauthorized', { status: 401 }));
    const result = await testProviderConnection(LLM_INPUT);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/401/);
  });

  it('returns failure when fetch throws (unreachable host)', async () => {
    stubFetch(new Error('fetch failed: ECONNREFUSED'));
    const result = await testProviderConnection(LLM_INPUT);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ECONNREFUSED|fetch failed/);
  });

  it('requires baseUrl for openai-compatible llm', async () => {
    const result = await testProviderConnection({ ...LLM_INPUT, baseUrl: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/base url/i);
  });

  it('requires model for openai-compatible llm', async () => {
    const result = await testProviderConnection({ ...LLM_INPUT, model: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/model/i);
  });
});

describe('testProviderConnection — embedding', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('embeds a probe string and returns the detected dimension', async () => {
    const vec = Array.from({ length: EMBEDDING_DIM }, (_, i) => i / EMBEDDING_DIM);
    const { calls } = stubFetch(jsonResponse(embeddingsResponse([vec])));
    const result = await testProviderConnection({
      kind: 'embedding',
      provider: 'openai-compatible',
      baseUrl: 'http://emb.test/v1',
      model: 'nomic-embed-text',
      apiKey: 'sk-emb',
    });
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('embedding');
    expect(result.dimension).toBe(EMBEDDING_DIM);
    expect(calls[0]!.url).toBe('http://emb.test/v1/embeddings');
    expect(headerValue(calls[0]!.init, 'authorization')).toBe('Bearer sk-emb');
  });

  it('returns the detected dimension even when it differs from EMBEDDING_DIM', async () => {
    // A 1536-dim model (e.g. text-embedding-3-small) — the helper reports the
    // actual dimension rather than enforcing the schema's fixed 768. The route
    // layer / UI is responsible for surfacing the mismatch to the user.
    const vec1536 = Array.from({ length: 1536 }, (_, i) => i / 1536);
    stubFetch(jsonResponse(embeddingsResponse([vec1536])));
    const result = await testProviderConnection({
      kind: 'embedding',
      provider: 'openai-compatible',
      baseUrl: 'http://emb.test/v1',
      model: 'text-embedding-3-small',
      apiKey: 'sk-emb',
    });
    expect(result.ok).toBe(true);
    expect(result.dimension).toBe(1536);
  });

  it('returns failure when the embedding endpoint errors', async () => {
    stubFetch(new Response('forbidden', { status: 403 }));
    const result = await testProviderConnection({
      kind: 'embedding',
      provider: 'openai-compatible',
      baseUrl: 'http://emb.test/v1',
      model: 'nomic-embed-text',
      apiKey: 'sk-emb',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/403/);
    expect(result.dimension).toBeUndefined();
  });
});

describe('testProviderConnection — ocr', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('checks docling reachability via GET /health', async () => {
    const { calls } = stubFetch(new Response('ok', { status: 200 }));
    const result = await testProviderConnection({
      kind: 'ocr',
      provider: 'docling',
      baseUrl: 'http://docling.test:5001',
      model: '',
      apiKey: '',
    });
    expect(result.ok).toBe(true);
    expect(result.kind).toBe('ocr');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://docling.test:5001/health');
    expect(calls[0]!.init.method).toBe('GET');
  });

  it('returns failure when docling /health is non-2xx', async () => {
    stubFetch(new Response('down', { status: 503 }));
    const result = await testProviderConnection({
      kind: 'ocr',
      provider: 'docling',
      baseUrl: 'http://docling.test:5001',
      model: '',
      apiKey: '',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/503/);
  });

  it('checks mistral reachability via GET /v1/models with bearer auth', async () => {
    const { calls } = stubFetch(
      jsonResponse({ data: [{ id: 'mistral-ocr-latest' }] }),
    );
    const result = await testProviderConnection({
      kind: 'ocr',
      provider: 'mistral',
      baseUrl: 'https://api.mistral.ai',
      model: '',
      apiKey: 'sk-mistral',
    });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.mistral.ai/v1/models');
    expect(headerValue(calls[0]!.init, 'authorization')).toBe('Bearer sk-mistral');
  });

  it('returns failure when mistral /v1/models is non-2xx', async () => {
    stubFetch(new Response('unauthorized', { status: 401 }));
    const result = await testProviderConnection({
      kind: 'ocr',
      provider: 'mistral',
      baseUrl: 'https://api.mistral.ai',
      model: '',
      apiKey: 'sk-mistral',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/401/);
  });

  it('uses default mistral base url when baseUrl is blank', async () => {
    const { calls } = stubFetch(jsonResponse({ data: [{ id: 'mistral-ocr-latest' }] }));
    const result = await testProviderConnection({
      kind: 'ocr',
      provider: 'mistral',
      baseUrl: '',
      model: '',
      apiKey: 'sk-mistral',
    });
    expect(result.ok).toBe(true);
    expect(calls[0]!.url).toBe('https://api.mistral.ai/v1/models');
  });

  it('returns ok for the fake ocr provider without any network call', async () => {
    const { calls } = stubFetch(new Error('should not be called'));
    const result = await testProviderConnection({
      kind: 'ocr',
      provider: 'fake',
      baseUrl: '',
      model: '',
      apiKey: '',
    });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('returns failure for an unknown ocr provider', async () => {
    const result = await testProviderConnection({
      kind: 'ocr',
      provider: 'tesseract-pdf',
      baseUrl: '',
      model: '',
      apiKey: '',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not wired|unsupported|unknown/i);
  });
});

describe('testProviderConnection — fake llm / embedding', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns ok for fake llm without network calls', async () => {
    const { calls } = stubFetch(new Error('should not be called'));
    const result = await testProviderConnection({
      kind: 'llm',
      provider: 'fake',
      baseUrl: '',
      model: '',
      apiKey: '',
    });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('returns ok for fake embedding and reports the fake dimension', async () => {
    const result = await testProviderConnection({
      kind: 'embedding',
      provider: 'fake',
      baseUrl: '',
      model: '',
      apiKey: '',
    });
    expect(result.ok).toBe(true);
    expect(result.dimension).toBe(EMBEDDING_DIM);
  });
});