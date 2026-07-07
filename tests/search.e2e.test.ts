import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { LanguageModel } from 'ai';
import { startPostgres, type StartedPg } from './helpers/pg-container';
import { applyMigrations } from './helpers/migrate';
import { createDb, type DbClient } from '@/lib/db/client';
import { loadEnv, type Env } from '@/lib/env';
import { createQueue, type Queue } from '@/lib/jobs/queue';
import { emitJobEvent } from '@/lib/jobs/events';
import { createProviders, type Providers } from '@/lib/providers';
import type { JobContext } from '@/lib/jobs/context';
import { registerHandlers } from '@/lib/jobs/handlers';
import { sources } from '@/lib/db/schema';
import type { RepoContext } from '@/lib/repositories/types';
import { seedTaxonomy } from '@/scripts/seed';
import { uploadSource } from '@/lib/services/upload-source';

/**
 * End-to-end search test. Uploads sample-report.pdf through the full Phase 2
 * pipeline (parse → extract → embed), then exercises the three Phase 3
 * surfaces (/api/search, /api/keyword-search, /api/chat-search) against the
 * resulting corpus. The pipeline plumbing mirrors tests/pipeline.e2e.test.ts.
 *
 * Chat-search needs a streaming model; the openai-compat adapter would call
 * out to a real LLM. We mock @/lib/providers/llm/chat-model to inject a
 * deterministic stub that emits a known citation marker.
 */

const fixtureDir = path.resolve(process.cwd(), 'fixtures/sources');
const fixtureFile = 'sample-report.pdf';

async function loadFixturePdf(): Promise<Buffer> {
  return readFile(path.join(fixtureDir, fixtureFile));
}

async function pollUntil(
  check: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 250,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`pollUntil: condition not met within ${timeoutMs}ms`);
}

let pg: StartedPg;
let queue: Queue;
let dbClient: DbClient;
let env: Env;
let providers: Providers;
let seededSourceId: string;

const envKeys = [
  'APP_MODE',
  'DATABASE_URL',
  'LLM_PROVIDER',
  'EMBEDDING_PROVIDER',
  'OCR_PROVIDER',
  'STORAGE_PROVIDER',
] as const;
const originalEnv: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

function systemRepoCtx(): RepoContext {
  return {
    db: dbClient.db,
    auth: { user: { id: 'system', name: 'system' }, roles: ['admin'], isSystem: true },
  };
}

function makeStubChatModel(text: string): LanguageModel {
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
  getChatModelFromConfig: vi.fn(),
}));

describe('search surfaces e2e', () => {
  beforeAll(async () => {
    pg = await startPostgres();
    await applyMigrations(pg.url).then(({ sql }) => sql.end());
    dbClient = createDb(pg.url);
    await seedTaxonomy(dbClient.db);

    queue = await createQueue({ connectionString: pg.url });

    for (const key of envKeys) originalEnv[key] = process.env[key];
    process.env.APP_MODE = 'local';
    process.env.DATABASE_URL = pg.url;
    process.env.LLM_PROVIDER = 'fake';
    process.env.EMBEDDING_PROVIDER = 'fake';
    process.env.OCR_PROVIDER = 'fake';
    process.env.STORAGE_PROVIDER = 'fake';

    env = loadEnv({
      APP_MODE: 'local',
      DATABASE_URL: pg.url,
      LLM_PROVIDER: 'fake',
      EMBEDDING_PROVIDER: 'fake',
      OCR_PROVIDER: 'fake',
      STORAGE_PROVIDER: 'fake',
    });
    providers = createProviders(env);

    const ctx: JobContext = {
      queue,
      db: dbClient.db,
      providers,
      env,
      emit: (channelId, event) => emitJobEvent(dbClient.sql, channelId, event),
    };
    await registerHandlers(ctx);

    const pdfBytes = await loadFixturePdf();
    const { sourceId } = await uploadSource(
      systemRepoCtx(),
      {
        filename: fixtureFile,
        contentType: 'application/pdf',
        bytes: pdfBytes,
        title: 'search e2e fixture',
      },
      { storage: providers.storage, queue },
    );
    seededSourceId = sourceId;

    await pollUntil(
      async () => {
        const [row] = await dbClient.db
          .select({ status: sources.status })
          .from(sources)
          .where(eq(sources.id, seededSourceId));
        return row?.status === 'ready';
      },
      60_000,
    );

    const { getChatModelFromConfig } = await import('@/lib/providers/llm/chat-model');
    const seededSlug = await dbClient.db
      .select({ slug: sources.slug })
      .from(sources)
      .where(eq(sources.id, seededSourceId));
    const slug = seededSlug[0]?.slug ?? 'sample-report';
    vi.mocked(getChatModelFromConfig).mockImplementation(() =>
      makeStubChatModel(
        `Auditors should rotate at least every seven years [[source:${slug}#page:2]].`,
      ),
    );
  }, 240_000);

  afterAll(async () => {
    await queue?.stop();
    await dbClient?.sql.end({ timeout: 5 });
    await pg?.container.stop();
    for (const key of envKeys) {
      const prev = originalEnv[key];
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    }
  });

  it('GET /api/search returns the seeded auditor recommendation as a top hit', async () => {
    const { GET } = await import('@/app/api/search/route');
    const res = await GET(new Request('http://localhost/api/search?q=auditor'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      mode: string;
      results: Array<{ title: string; sourceId: string; rrfScore: number | null }>;
    };
    expect(body.mode).toBe('hybrid');
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0]?.title.toLowerCase()).toContain('auditor');
    expect(body.results[0]?.sourceId).toBe(seededSourceId);
  });

  it('GET /api/keyword-search returns the same row with rrfScore=null', async () => {
    const { GET } = await import('@/app/api/keyword-search/route');
    const res = await GET(new Request('http://localhost/api/keyword-search?q=auditor'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      mode: string;
      results: Array<{ title: string; rrfScore: number | null; vectorRank: number | null }>;
    };
    expect(body.mode).toBe('keyword');
    expect(body.results.length).toBeGreaterThan(0);
    expect(body.results[0]?.title.toLowerCase()).toContain('auditor');
    expect(body.results[0]?.rrfScore).toBeNull();
    expect(body.results[0]?.vectorRank).toBeNull();
  });

  it('POST /api/chat-search streams a response containing a valid citation marker', async () => {
    const { POST } = await import('@/app/api/chat-search/route');
    const req = new Request('http://localhost/api/chat-search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: 'how often should auditors rotate?' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/\[\[source:[a-z0-9-]+#page:\d+\]\]/);
  });
});
