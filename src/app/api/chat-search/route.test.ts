// Auth: local-mode AuthProvider returns a system context with no token.
// Token-based 401 tests don't apply; revisit in Phase 8 when Better-auth lands.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { LanguageModel } from 'ai';
import { startPostgres, type StartedPg } from '../../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../../tests/helpers/migrate';
import { createDb, type DbClient } from '@/lib/db/client';
import { sourcePages, sources } from '@/lib/db/schema';

let pg: StartedPg;
let client: DbClient;

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

function vec(slot: number, value = 1): number[] {
  const v = new Array(768).fill(0);
  v[slot] = value;
  return v;
}

function makeStubModel(text: string): LanguageModel {
  // Minimal LanguageModelV3-shaped stub: streamText only invokes doStream,
  // so doGenerate stays as a typed throw. Stream parts follow the v3
  // contract (stream-start → text-start/delta/end → finish).
  const stub = {
    specificationVersion: 'v3',
    provider: 'stub',
    modelId: 'stub-model',
    supportedUrls: {},
    async doGenerate() {
      throw new Error('stub model does not implement doGenerate');
    },
    async doStream() {
      const parts: unknown[] = [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: '0' },
        { type: 'text-delta', id: '0', delta: text },
        { type: 'text-end', id: '0' },
        {
          type: 'finish',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          finishReason: 'stop',
        },
      ];
      const stream = new ReadableStream({
        start(controller) {
          for (const p of parts) controller.enqueue(p);
          controller.close();
        },
      });
      return { stream };
    },
  };
  return stub as unknown as LanguageModel;
}

vi.mock('@/lib/providers/llm/chat-model', () => ({
  getChatModel: vi.fn(),
}));

let stubText = 'Auditors should rotate every five years [[source:cs-rep#page:1]].';

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
  client = createDb(pg.url);

  for (const key of envKeys) originalEnv[key] = process.env[key];
  process.env.APP_MODE = 'local';
  process.env.DATABASE_URL = pg.url;
  process.env.LLM_PROVIDER = 'fake';
  process.env.EMBEDDING_PROVIDER = 'fake';
  process.env.OCR_PROVIDER = 'fake';
  process.env.STORAGE_PROVIDER = 'fake';

  const [src] = await client.db
    .insert(sources)
    .values({ slug: 'cs-rep', title: 'cs-rep', isPrivate: false })
    .returning({ id: sources.id });
  if (!src) throw new Error('seed: no source row');
  await client.db.insert(sourcePages).values([
    {
      sourceId: src.id,
      pageNumber: 1,
      markdown: 'Auditor rotation policy: rotate every five years.',
      embedding: vec(0),
    },
    {
      sourceId: src.id,
      pageNumber: 2,
      markdown: 'Unrelated preface text.',
      embedding: vec(7),
    },
  ]);

  const { getChatModel } = await import('@/lib/providers/llm/chat-model');
  vi.mocked(getChatModel).mockImplementation(() => makeStubModel(stubText));
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
  for (const key of envKeys) {
    const prev = originalEnv[key];
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
});

async function postChat(body: unknown): Promise<Response> {
  const { POST } = await import('./route');
  const req = new Request('http://localhost/api/chat-search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return POST(req);
}

describe('POST /api/chat-search', () => {
  it('streams a response containing at least one citation marker', async () => {
    stubText = 'Auditors should rotate every five years [[source:cs-rep#page:1]].';
    const res = await postChat({ q: 'how often should auditors rotate?' });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/\[\[source:cs-rep#page:1\]\]/);
  });

  it('exposes the retrieved page set via response headers', async () => {
    const res = await postChat({ q: 'auditor' });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-citations-count')).toBeDefined();
    const retrieved = res.headers.get('x-retrieved');
    expect(retrieved).toBeTruthy();
    const parsed = JSON.parse(retrieved ?? '[]') as Array<{ slug: string; page: number }>;
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0]?.slug).toBe('cs-rep');
  });

  it('returns 400 when q is missing', async () => {
    const res = await postChat({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when q is too short', async () => {
    const res = await postChat({ q: 'a' });
    expect(res.status).toBe(400);
  });

  it('returns 503 when no chat model is configured', async () => {
    const { getChatModel } = await import('@/lib/providers/llm/chat-model');
    vi.mocked(getChatModel).mockImplementationOnce(() => null);
    const res = await postChat({ q: 'auditor question' });
    expect(res.status).toBe(503);
  });

  it('returns 415 when content-type is not JSON', async () => {
    const { POST } = await import('./route');
    const req = new Request('http://localhost/api/chat-search', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
  });
});
