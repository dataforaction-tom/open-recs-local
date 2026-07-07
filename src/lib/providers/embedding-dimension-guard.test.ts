import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertEmbeddingDimension,
  EmbeddingDimensionMismatchError,
} from './embedding-dimension-guard';
import { EMBEDDING_DIM } from '../db/schema';

// The guard wraps `testProviderConnection` and enforces the returned dimension
// matches `EMBEDDING_DIM` (768). The connection probe uses `fetch`, which we
// stub per-test to simulate a working or failing embedding endpoint.

function embeddingsResponse(vectors: number[][], model = 'nomic-embed-text'): unknown {
  return {
    object: 'list',
    data: vectors.map((embedding, index) => ({ object: 'embedding', embedding, index })),
    model,
    usage: { prompt_tokens: 10, total_tokens: 10 },
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function stubFetch(response: Response | Error): void {
  const fetchStub = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fetchStub);
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const INPUT = {
  kind: 'embedding' as const,
  provider: 'openai-compatible',
  baseUrl: 'http://emb.test/v1',
  model: 'nomic-embed-text',
  apiKey: 'sk-emb',
};

describe('assertEmbeddingDimension', () => {
  it('resolves when the probe returns EMBEDDING_DIM-dim vectors', async () => {
    const vec = Array.from({ length: EMBEDDING_DIM }, (_, i) => i / EMBEDDING_DIM);
    stubFetch(jsonResponse(embeddingsResponse([vec])));
    await expect(assertEmbeddingDimension(INPUT)).resolves.toBeUndefined();
  });

  it('throws EmbeddingDimensionMismatchError with an actionable message on mismatch', async () => {
    const vec1536 = Array.from({ length: 1536 }, (_, i) => i / 1536);
    // Re-stub per call: the AI SDK drains the Response body, so a single
    // stubbed Response can't be reused across two awaits.
    const makeResp = () => jsonResponse(embeddingsResponse([vec1536]));
    stubFetch(makeResp());
    await expect(assertEmbeddingDimension(INPUT)).rejects.toBeInstanceOf(
      EmbeddingDimensionMismatchError,
    );
    stubFetch(makeResp());
    await expect(assertEmbeddingDimension(INPUT)).rejects.toThrow(
      /model returns 1536-dim vectors.*fixed at 768.*re-embedding/i,
    );
  });

  it('exposes the requested and actual dimensions on the error', async () => {
    const vec1536 = Array.from({ length: 1536 }, (_, i) => i / 1536);
    stubFetch(jsonResponse(embeddingsResponse([vec1536])));
    try {
      await assertEmbeddingDimension(INPUT);
      throw new Error('expected guard to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(EmbeddingDimensionMismatchError);
      const e = err as EmbeddingDimensionMismatchError;
      expect(e.actual).toBe(1536);
      expect(e.expected).toBe(EMBEDDING_DIM);
    }
  });

  it('rethrows a connection failure as-is (does not silently pass the guard)', async () => {
    stubFetch(new Response('forbidden', { status: 403 }));
    await expect(assertEmbeddingDimension(INPUT)).rejects.toThrow(/403/);
  });

  it('does not probe for non-embedding kinds (no-op)', async () => {
    const fetchStub = vi.fn(async () => new Response('should not be called'));
    vi.stubGlobal('fetch', fetchStub);
    await expect(
      assertEmbeddingDimension({ ...INPUT, kind: 'llm' }),
    ).resolves.toBeUndefined();
    expect(fetchStub).not.toHaveBeenCalled();
  });
});