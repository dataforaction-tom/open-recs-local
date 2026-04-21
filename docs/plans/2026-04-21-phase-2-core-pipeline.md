# Phase 2 — Core Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upload a PDF → worker parses → extracts recs → embeds → source row transitions to `status=ready`. Recommendations become searchable via a keyword endpoint. Real LLM/Embedding/OCR adapters land behind an OpenAI-compatible interface so any local (Ollama, LM Studio, vLLM) or cloud (OpenAI, Together, Groq) model can be swapped via env.

**Architecture:** pg-boss on its own `pgboss` Postgres schema (Drizzle untouched). A single worker process (`src/worker.ts`) registers handlers for three queues: `source.parse` → `source.extract` → `source.embed`. Handlers call providers from the factory; fakes still drive tests. LLM + Embedding go through one OpenAI-compatible adapter each, configurable via `{LLM,EMBEDDING}_{BASE_URL,API_KEY,MODEL}` env. A `/api/providers/llm/models` discovery route queries the configured endpoint's `/v1/models` so the UI can list what's actually installed. Progress updates flow over `pg_notify` → SSE on `/api/jobs/:id/stream`. OCR gets two real adapters: Docling (containerised sidecar, local default) and Mistral (cloud).

**Tech Stack:** pg-boss 12 · Vercel AI SDK + `@ai-sdk/openai-compatible` · Zod · Postgres LISTEN/NOTIFY · Docling (Docker sidecar) · Mistral OCR API · Testcontainers (pgvector/pgvector:pg16).

---

## Phase 2 exit criteria

1. `POST /api/sources` with a PDF returns `{ sourceId, jobId }`; polling/streaming the job shows phases `parsing → extracting → embedding → ready`.
2. A fixture PDF run end-to-end (fake providers) produces ≥1 recommendation row with a populated embedding vector, and `GET /api/recommendations?q=<keyword>` returns it.
3. Swapping `LLM_BASE_URL=http://ollama:11434/v1 LLM_MODEL=llama3.1:8b` makes the pipeline use Ollama with no code changes; same for `OPENAI_API_KEY`-style cloud.
4. `pnpm verify` green. `docker compose up -d` brings Postgres + app + worker healthy. CI green.
5. Worker image can run both the worker entrypoint **and** `pnpm db:migrate` (the `tsx`-in-prod-deps carry-over is resolved).

---

## Preflight facts (resolved at plan time, 2026-04-21)

- **pg-boss** latest: `12.15.0`. Pulls `pg@^8` transitively; Drizzle stays on `postgres` (porsager). Both drivers coexist. pg-boss creates/migrates its own `pgboss` schema via `.start()` — no Drizzle migration needed for it.
- **Vercel AI SDK**: install `ai` + `@ai-sdk/openai-compatible`. The compat provider speaks to Ollama, OpenAI, Together, vLLM, LM Studio, anything exposing `/v1/chat/completions` + `/v1/embeddings` + `/v1/models`. Use `generateObject(...)` for structured extraction with a Zod schema.
- **Ollama** exposes `/v1/models` (OpenAI-compat) in addition to its native `/api/tags` — we only use `/v1/models` for discovery so the same code works against OpenAI.
- **Docling** ships an official image `ghcr.io/docling-project/docling-serve` with a REST API. Run as a compose sidecar; adapter posts the PDF, returns markdown + page segmentation.
- **Mistral OCR**: `POST https://api.mistral.ai/v1/ocr` returns markdown + pages. Adapter is thin.
- **`tsx` in prod deps**: move from `devDependencies` to `dependencies`. Small (~2MB). Unblocks `docker compose exec app pnpm db:migrate` and worker entrypoint `tsx src/worker.ts`.
- **Default local models (env defaults, all env-overridable):**
  - `LLM_BASE_URL=http://ollama:11434/v1`, `LLM_MODEL=llama3.1:8b`
  - `EMBEDDING_BASE_URL=http://ollama:11434/v1`, `EMBEDDING_MODEL=nomic-embed-text` (768 dims — matches our `vector(768)` schema)

---

## Task list

| # | Task | Touches |
|---|---|---|
| 1 | Move `tsx` to prod deps; add pipeline + AI SDK deps | `package.json` |
| 2 | Fixture infrastructure: two sample PDFs + expected canonical markdown | `fixtures/` |
| 3 | pg-boss queue wrapper + Testcontainers tests | `src/lib/jobs/queue.ts`, `.test.ts` |
| 4 | Worker entrypoint + Docker `worker-runtime` verification | `src/worker.ts`, `docker/Dockerfile`, `docker-compose.yml` |
| 5 | `JobContext` + handler registration pattern | `src/lib/jobs/context.ts`, `.test.ts` |
| 6 | Progress events via `pg_notify` + `/api/jobs/:id/stream` SSE | `src/lib/jobs/events.ts`, `src/app/api/jobs/[id]/stream/route.ts` |
| 7 | `POST /api/sources` upload endpoint | `src/app/api/sources/route.ts` |
| 8 | `source.parse` handler (OCR → `source_pages` + canonical markdown) | `src/lib/jobs/handlers/parse.ts` |
| 9 | `source.extract` handler (LLM structured output → recommendations) | `src/lib/jobs/handlers/extract.ts` |
| 10 | `source.embed` handler (batched embeddings → vectors) | `src/lib/jobs/handlers/embed.ts` |
| 11 | End-to-end pipeline integration test | `tests/pipeline.e2e.test.ts` |
| 12 | Real LLM adapter (OpenAI-compatible, via `@ai-sdk/openai-compatible`) | `src/lib/providers/llm/openai-compat.ts` |
| 13 | Model discovery: `GET /api/providers/llm/models` + helper | `src/app/api/providers/llm/models/route.ts` |
| 14 | Real Embedding adapter (OpenAI-compatible) | `src/lib/providers/embedding/openai-compat.ts` |
| 15 | Real OCR: Docling adapter + `docker-compose.docling.yml` override | `src/lib/providers/ocr/docling.ts`, compose override |
| 16 | Real OCR: Mistral adapter | `src/lib/providers/ocr/mistral.ts` |
| 17 | `GET /api/recommendations?q=...` keyword search endpoint | `src/app/api/recommendations/route.ts` |
| 18 | End-of-phase verify + PR | — |

---

## Task 1 — Move `tsx` to prod deps; add pipeline + AI SDK deps

**Files:**
- Modify: `package.json`

**Step 1:** Inspect current `package.json` to confirm `tsx` is under `devDependencies`.

**Step 2:** Move it and install new pipeline deps:

```bash
pnpm remove -D tsx
pnpm add tsx pg-boss ai @ai-sdk/openai-compatible
pnpm add -D @types/pg
```

**Step 3:** Run `pnpm verify`. Expected: green (no code changes yet).

**Step 4:** Commit.

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: add pg-boss + AI SDK; promote tsx to prod deps for worker image"
```

---

## Task 2 — Fixture infrastructure (PDFs + golden canonical markdown)

**Files:**
- Create: `fixtures/sources/sample-report.pdf` (small ~2-page synthetic report)
- Create: `fixtures/sources/sample-report.canonical.md` (expected OCR output)
- Create: `fixtures/sources/sample-report.recommendations.json` (expected extracted recs)
- Create: `fixtures/README.md` explaining the fixture contract

**Step 1:** Generate two small, deterministic PDFs. Use `pdf-lib` one-off script (add to `scripts/build-fixtures.ts`, not a runtime dep). Checked-in artefacts are the PDFs themselves. Each PDF contains 2–3 labelled "Recommendation N:" headings so extraction has signal.

**Step 2:** Hand-author the expected canonical markdown for each — the fake OCR provider reads this by filename (this is the behaviour we already shipped in Phase 1; confirm in `src/lib/providers/ocr/fake.ts`).

**Step 3:** Hand-author the expected extraction JSON: array of `{ title, full_text, thematic_area_slug }`. The fake LLM reads this for structured output.

**Step 4:** Update `src/lib/providers/ocr/fake.ts` and `src/lib/providers/llm/fake.ts` to resolve fixture paths via an env var `FIXTURES_DIR` defaulting to `fixtures/sources` (so tests can point at per-test dirs later). Add tests confirming fake behaviour is unchanged.

**Step 5:** Run `pnpm verify`. Expected: green.

**Step 6:** Commit.

```bash
git add fixtures/ scripts/build-fixtures.ts src/lib/providers/ocr/fake.ts src/lib/providers/llm/fake.ts
git commit -m "test: fixture PDFs + golden outputs for pipeline tests"
```

---

## Task 3 — pg-boss queue wrapper (Testcontainers-backed)

**Files:**
- Create: `src/lib/jobs/queue.ts`
- Create: `src/lib/jobs/queue.test.ts`
- Create: `src/lib/jobs/types.ts` (shared types: queue names, payloads)

**Step 1 — Write failing test:**

```ts
// src/lib/jobs/queue.test.ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createQueue, type Queue } from './queue';

let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;
let queue: Queue;

describe('queue', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
    queue = await createQueue({ connectionString: container.getConnectionUri() });
  }, 120_000);

  afterAll(async () => {
    await queue?.stop();
    await container?.stop();
  });

  it('installs the pgboss schema on start', async () => {
    // queue.start() is called by createQueue. Expect pgboss schema to exist.
    const result = await queue.rawQuery(
      `select schema_name from information_schema.schemata where schema_name = 'pgboss'`,
    );
    expect(result).toHaveLength(1);
  });

  it('round-trips a typed job', async () => {
    await queue.register('test.echo', async (payload: { msg: string }) => ({ echoed: payload.msg }));
    const jobId = await queue.enqueue('test.echo', { msg: 'hi' });
    const result = await queue.waitForResult(jobId, 10_000);
    expect(result).toEqual({ echoed: 'hi' });
  });
});
```

**Step 2 — Run test:** `pnpm test src/lib/jobs/queue.test.ts`. Expected: fail (file not found).

**Step 3 — Implement `src/lib/jobs/queue.ts`:**

Thin wrapper over pg-boss that (a) starts a boss with our connection string, (b) exposes typed `enqueue<Q extends QueueName>(queue, payload)`, (c) exposes `register<Q>(queue, handler)`, (d) a `waitForResult(jobId, timeoutMs)` helper for tests (polls `pgboss.job` by id), (e) `rawQuery` helper for test introspection only.

Types live in `src/lib/jobs/types.ts`:

```ts
export type QueuePayloads = {
  'source.parse':   { sourceId: string };
  'source.extract': { sourceId: string };
  'source.embed':   { sourceId: string };
  'test.echo':      { msg: string };
};
export type QueueName = keyof QueuePayloads;
```

**Step 4 — Run tests:** Expected: both pass. If pg-boss connection string needs `?sslmode=disable`, Testcontainers gives a non-SSL URL — should work out of the box.

**Step 5 — Commit.**

```bash
git add src/lib/jobs/queue.ts src/lib/jobs/queue.test.ts src/lib/jobs/types.ts
git commit -m "feat: pg-boss queue wrapper with typed enqueue/register"
```

---

## Task 4 — Worker entrypoint + Docker worker-runtime

**Files:**
- Create: `src/worker.ts`
- Modify: `docker/Dockerfile` (verify `worker-runtime` stage command is `tsx src/worker.ts`)
- Modify: `docker-compose.yml` (ensure `worker` service targets `worker-runtime` and runs with `DATABASE_URL` pointed at the `postgres` service)
- Modify: `package.json` (`"worker": "tsx src/worker.ts"`, `"worker:dev": "tsx watch src/worker.ts"`)

**Step 1:** Implement `src/worker.ts`:

```ts
import { loadEnv } from '@/lib/env';
import { createDb } from '@/lib/db/client';
import { createProviders } from '@/lib/providers';
import { createQueue } from '@/lib/jobs/queue';
import { registerHandlers } from '@/lib/jobs/handlers';  // added in Task 5

const env = loadEnv();
const { db, sql } = createDb(env.DATABASE_URL);
const providers = createProviders(env);
const queue = await createQueue({ connectionString: env.DATABASE_URL });

await registerHandlers({ queue, db, providers, env });

console.log('[worker] ready');

const shutdown = async (signal: string) => {
  console.log(`[worker] ${signal} — draining`);
  await queue.stop();
  await sql.end();
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

**Step 2 — Verify Dockerfile worker stage:**

```bash
docker build -f docker/Dockerfile --target worker-runtime -t open-recs-worker:test .
```

Expected: builds successfully; final CMD is `["pnpm", "worker"]` or `["tsx", "src/worker.ts"]`.

**Step 3 — Compose smoke:**

```bash
docker compose up -d postgres
docker compose exec app pnpm db:migrate       # resolves tsx-in-prod-deps carry-over
docker compose exec app pnpm db:seed
docker compose up -d worker
docker compose logs worker                    # expect "[worker] ready"
```

**Step 4:** Add a smoke test `tests/worker.smoke.test.ts` that spawns the worker via `tsx` in a child process pointed at a Testcontainers URL, waits for stdout "[worker] ready", sends SIGTERM, asserts clean exit. (Keep this conservative with a 30s timeout.)

**Step 5:** `pnpm verify`. Commit.

```bash
git add src/worker.ts docker-compose.yml docker/Dockerfile package.json tests/worker.smoke.test.ts
git commit -m "feat: worker entrypoint + compose wiring; resolves tsx-in-prod carry-over"
```

---

## Task 5 — `JobContext` + handler registration pattern

**Files:**
- Create: `src/lib/jobs/context.ts`
- Create: `src/lib/jobs/handlers/index.ts` (exported `registerHandlers`)
- Create: `src/lib/jobs/context.test.ts`

**Step 1 — Design:**

```ts
// src/lib/jobs/context.ts
export type JobContext = {
  queue: Queue;
  db: Db;
  providers: Providers;
  env: Env;
  emit: (jobId: string, event: JobEvent) => Promise<void>;   // wraps pg_notify (Task 6)
};
export type JobEvent =
  | { type: 'phase'; phase: 'parsing'|'extracting'|'embedding'|'ready'|'failed' }
  | { type: 'progress'; percent: number; message?: string }
  | { type: 'error'; message: string };
```

**Step 2 — Registration skeleton:**

```ts
// src/lib/jobs/handlers/index.ts
import { parseHandler } from './parse';
import { extractHandler } from './extract';
import { embedHandler } from './embed';

export async function registerHandlers(ctx: JobContext) {
  await ctx.queue.register('source.parse',   (p) => parseHandler(ctx, p));
  await ctx.queue.register('source.extract', (p) => extractHandler(ctx, p));
  await ctx.queue.register('source.embed',   (p) => embedHandler(ctx, p));
}
```

Handlers themselves are stubs in this task — just `throw new Error('not implemented')`. Tasks 8–10 implement them.

**Step 3 — Test:** `registerHandlers` registers exactly three handlers against a Testcontainers queue; unknown queue enqueue fails.

**Step 4:** Implement, run tests, commit.

```bash
git commit -m "feat: JobContext + handler registration scaffold"
```

---

## Task 6 — Progress events via `pg_notify` + SSE route

**Files:**
- Create: `src/lib/jobs/events.ts` (emit + subscribe helpers)
- Create: `src/lib/jobs/events.test.ts`
- Create: `src/app/api/jobs/[id]/stream/route.ts`

**Step 1 — Emit helper:**

```ts
// src/lib/jobs/events.ts
export async function emitJobEvent(sql: Sql, jobId: string, event: JobEvent) {
  const channel = `job:${jobId}`;
  await sql`select pg_notify(${channel}, ${JSON.stringify(event)})`;
}

export function subscribeJobEvents(sql: Sql, jobId: string, onEvent: (e: JobEvent) => void) {
  const channel = `job:${jobId}`;
  const conn = sql.listen(channel, (payload) => onEvent(JSON.parse(payload)));
  return () => conn.then(c => c.unlisten());
}
```

`postgres` (porsager) supports `.listen` natively — no extra client needed.

**Step 2 — Test:** Spin Postgres via Testcontainers, subscribe, call emit from another connection, assert the subscriber receives the event within 2s.

**Step 3 — SSE route:**

```ts
// src/app/api/jobs/[id]/stream/route.ts
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const env = loadEnv();
  const { sql } = createDb(env.DATABASE_URL);

  const stream = new ReadableStream({
    async start(controller) {
      const unsub = await subscribeJobEvents(sql, id, (e) => {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(e)}\n\n`));
        if (e.type === 'phase' && (e.phase === 'ready' || e.phase === 'failed')) {
          controller.close();
        }
      });
      req.signal.addEventListener('abort', () => { unsub(); controller.close(); });
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' },
  });
}
```

**Step 4 — Route test:** Use `next` test harness or hit the route via a spawned server; easier: a unit test on the stream composition with a mocked subscribe.

**Step 5 — Wire `emit` into `JobContext`:** update `registerHandlers` callsite in `src/worker.ts` to inject `emit: (jobId, e) => emitJobEvent(sql, jobId, e)`.

**Step 6 — Commit.**

```bash
git commit -m "feat: pg_notify-backed SSE stream for job progress"
```

---

## Task 7 — `POST /api/sources` upload endpoint

**Files:**
- Create: `src/app/api/sources/route.ts`
- Create: `src/app/api/sources/route.test.ts`
- Create: `src/lib/services/upload-source.ts` (pure function; easier to test than the route)

**Step 1 — Service test:** Given a filename + buffer + `ctx: RepoContext`, `uploadSource` should: (a) call `storage.put()`, (b) insert a `sources` row with `status='uploaded'`, (c) insert a `source_files` row, (d) enqueue `source.parse`. Return `{ sourceId, jobId }`.

**Step 2 — Implement service.**

**Step 3 — Route:** multipart parse via Web `Request.formData()`, validate with Zod (`file` required, `title` optional, `is_private` optional), call service, return JSON.

**Step 4 — Route test** using Testcontainers + a real fake storage. Assert a `source.parse` job lands in `pgboss.job` with the right payload.

**Step 5 — Commit.**

```bash
git commit -m "feat: POST /api/sources — upload, persist, enqueue parse"
```

---

## Task 8 — `source.parse` handler

**Files:**
- Create/modify: `src/lib/jobs/handlers/parse.ts`
- Create: `src/lib/jobs/handlers/parse.test.ts`

**Behaviour:**
1. `emit(jobId, { type: 'phase', phase: 'parsing' })`
2. Load the `sources` + `source_files` rows.
3. Stream the file from `storage.get(sourceFile.path)`.
4. Call `providers.ocr.parse(buffer, { filename })` → `{ canonical_markdown, pages: [{ page_number, markdown, image_refs }] }`.
5. Insert `source_pages` rows in a transaction; update `sources.canonical_markdown` + `status='parsed'`.
6. Enqueue `source.extract` with the same `sourceId`.
7. On throw: `emit({ type: 'error', ... })`, set `sources.status='failed'`, rethrow (pg-boss retries).

**Step 1 — Test:** End-to-end with fake providers against Testcontainers. Seed a `sources` row + fixture file, run the handler directly (bypass queue), assert DB state + that a follow-on `source.extract` job is enqueued.

**Step 2 — Implement.**

**Step 3 — Test: failure path.** Inject a failing OCR fake; assert `sources.status='failed'` and an `error` event was emitted.

**Step 4 — Commit.**

```bash
git commit -m "feat: source.parse handler — OCR → canonical markdown + pages"
```

---

## Task 9 — `source.extract` handler (LLM structured output)

**Files:**
- Create/modify: `src/lib/jobs/handlers/extract.ts`
- Create: `src/lib/jobs/handlers/extract.test.ts`
- Create: `src/lib/services/extraction-schema.ts` (the Zod schema the LLM must match)

**Behaviour:**
1. Emit `phase: 'extracting'`.
2. Load `sources.canonical_markdown`.
3. Call `providers.llm.generateStructured({ system, prompt, schema })` where schema is:

```ts
export const ExtractionSchema = z.object({
  recommendations: z.array(z.object({
    title: z.string().min(5),
    full_text: z.string().min(20),
    thematic_area_slug: z.string().optional(),
    page_start: z.number().int().nullable(),
    page_end: z.number().int().nullable(),
  })).min(0),
});
```

4. Insert rows into `recommendations`; link thematic areas via `recommendations_thematic_areas` where the slug resolves.
5. Insert an initial `recommendation_statuses` row (`status='open'`).
6. Update `sources.status='extracted'`.
7. Enqueue `source.embed`.

**Step 1 — Test:** fake LLM returns the fixture JSON; assert recs inserted with correct taxonomy links.

**Step 2 — Implement.**

**Step 3 — Test: schema violation.** Fake LLM returns malformed JSON; handler retries via pg-boss (verify by checking retry count) and ultimately fails the job with a clear error.

**Step 4 — Commit.**

```bash
git commit -m "feat: source.extract handler — LLM structured output → recommendations"
```

---

## Task 10 — `source.embed` handler

**Files:**
- Create/modify: `src/lib/jobs/handlers/embed.ts`
- Create: `src/lib/jobs/handlers/embed.test.ts`

**Behaviour:**
1. Emit `phase: 'embedding'`.
2. Load all recommendations for `sourceId` where `embedding IS NULL`.
3. Batch in chunks of 32, call `providers.embedding.embed(texts)`, assert return is 768-dim each, write back.
4. When done: `sources.status='ready'`, emit `phase: 'ready'`.

**Step 1 — Test:** seeded recs, fake embedding, assert all rows have non-null embeddings of correct dim; `sources.status='ready'`.

**Step 2 — Implement.**

**Step 3 — Commit.**

```bash
git commit -m "feat: source.embed handler — batched embeddings → vectors; source becomes ready"
```

---

## Task 11 — End-to-end pipeline integration test

**Files:**
- Create: `tests/pipeline.e2e.test.ts`

**Step 1:** Boot Testcontainers Postgres, run migrations + seed, start a queue, register all handlers, upload a fixture PDF via the service (`uploadSource`), drive the queue by calling `queue.work()` until the source is `ready`. Assert:
- `sources.status = 'ready'`
- `source_pages` row count matches fixture
- `recommendations` count matches fixture
- Every `recommendations.embedding` is 768-dim non-zero

**Step 2:** Second variant — same flow but subscribe to `/api/jobs/:id/stream` and assert the full phase sequence arrives.

**Step 3 — Commit.**

```bash
git commit -m "test(e2e): full pipeline — upload → ready with phase stream"
```

---

## Task 12 — Real LLM adapter (OpenAI-compatible)

**Files:**
- Create: `src/lib/providers/llm/openai-compat.ts`
- Create: `src/lib/providers/llm/openai-compat.test.ts`
- Modify: `src/lib/providers/index.ts` (factory wires `LLM_PROVIDER=openai-compat` to this adapter)
- Modify: `src/lib/env.ts` (add `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`)

**Step 1 — Test with mocked HTTP** (using `msw` or undici's `MockAgent`; prefer `undici.MockAgent` — already a transitive dep). Assert:
- `generate(prompt)` issues `POST {baseUrl}/chat/completions` with `model`, `messages`, `Authorization: Bearer {apiKey}` when key set.
- `generateStructured(prompt, schema)` uses `generateObject` from the AI SDK (which handles `response_format: json_schema`) and rejects when the response fails Zod parse.
- Missing `LLM_BASE_URL` causes factory to throw a helpful error.

**Step 2 — Implement** using `@ai-sdk/openai-compatible`:

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject, generateText } from 'ai';

export function createOpenAICompatLlm(cfg: { baseUrl: string; apiKey?: string; model: string }): LlmProvider {
  const client = createOpenAICompatible({
    name: 'openai-compat',
    baseURL: cfg.baseUrl,
    apiKey: cfg.apiKey,          // optional; many local servers accept anything or nothing
  });
  const model = client.chatModel(cfg.model);

  return {
    async generate(prompt) {
      const { text } = await generateText({ model, prompt });
      return text;
    },
    async generateStructured(prompt, schema) {
      const { object } = await generateObject({ model, prompt, schema });
      return object;
    },
  };
}
```

**Step 3 — Factory wiring:** `LLM_PROVIDER` accepts `fake` | `openai-compat`. In-container default in `.env.example` becomes `openai-compat` pointing at Ollama.

**Step 4 — Contract test:** Reuse the existing fake-provider test suite against the real adapter with a `MockAgent` that replays canned responses — ensures both satisfy the interface.

**Step 5 — Commit.**

```bash
git commit -m "feat: OpenAI-compatible LLM adapter (covers Ollama, OpenAI, vLLM, LM Studio...)"
```

---

## Task 13 — Model discovery endpoint

**Files:**
- Create: `src/app/api/providers/llm/models/route.ts`
- Create: `src/lib/providers/llm/discover.ts`

**Step 1 — Helper:**

```ts
// src/lib/providers/llm/discover.ts
export async function listModels(baseUrl: string, apiKey?: string): Promise<{ id: string }[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
  });
  if (!res.ok) throw new Error(`models endpoint returned ${res.status}`);
  const body = await res.json() as { data: { id: string }[] };
  return body.data.map(m => ({ id: m.id }));
}
```

**Step 2 — Route:** `GET /api/providers/llm/models` — reads env, calls helper, returns `{ provider: 'openai-compat', base_url, models: [...] }` or `{ error }`. Useful for UI + health checks.

**Step 3 — Test with `MockAgent`.** Two scenarios: Ollama-shaped response, OpenAI-shaped response. Both parse identically.

**Step 4 — Commit.**

```bash
git commit -m "feat: GET /api/providers/llm/models — discover installed/available LLMs"
```

---

## Task 14 — Real Embedding adapter (OpenAI-compatible)

**Files:**
- Create: `src/lib/providers/embedding/openai-compat.ts` + test
- Modify: `src/lib/providers/index.ts`
- Modify: `src/lib/env.ts` (add `EMBEDDING_BASE_URL`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL`)

**Step 1 — Test:** `embed(texts[])` issues `POST {baseUrl}/embeddings` with `{ model, input: texts }`; response `data[].embedding` arrays come back in order; returned vectors are length 768.

**Step 2 — Implement:**

```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { embedMany } from 'ai';

export function createOpenAICompatEmbedding(cfg: { baseUrl: string; apiKey?: string; model: string }): EmbeddingProvider {
  const client = createOpenAICompatible({ name: 'openai-compat-embed', baseURL: cfg.baseUrl, apiKey: cfg.apiKey });
  const model = client.textEmbeddingModel(cfg.model);
  return {
    async embed(texts) {
      const { embeddings } = await embedMany({ model, values: texts });
      return embeddings;
    },
  };
}
```

**Step 3 — Guard:** validate dimension at adapter boundary. If returned vector isn't 768 dims, throw — prevents silently inserting bad vectors.

**Step 4 — Commit.**

```bash
git commit -m "feat: OpenAI-compatible embedding adapter with dim validation"
```

---

## Task 15 — Real OCR: Docling adapter + compose override

**Files:**
- Create: `src/lib/providers/ocr/docling.ts` + test
- Create: `docker-compose.docling.yml`
- Modify: `src/lib/providers/index.ts` (`OCR_PROVIDER=docling`)
- Modify: `src/lib/env.ts` (add `DOCLING_BASE_URL`)

**Step 1 — Compose override:**

```yaml
# docker-compose.docling.yml
services:
  docling:
    image: ghcr.io/docling-project/docling-serve:latest
    ports: ["5001:5001"]
    environment:
      - DOCLING_SERVE_ENABLE_UI=false
  app:      { environment: { OCR_PROVIDER: docling, DOCLING_BASE_URL: http://docling:5001 } }
  worker:   { environment: { OCR_PROVIDER: docling, DOCLING_BASE_URL: http://docling:5001 } }
```

**Step 2 — Adapter:** POST the PDF buffer to `{baseUrl}/v1alpha/convert/file` as multipart, parse the response into our canonical shape. (Check the Docling-serve README in the image for the exact route — flag if it's moved.)

**Step 3 — Test with MockAgent** replaying a canned Docling response; assert canonical markdown + `source_pages` shape is built correctly.

**Step 4 — Document in `docs/user-guide.md`** how to opt into Docling:
```bash
docker compose -f docker-compose.yml -f docker-compose.docling.yml up -d
```

**Step 5 — Commit.**

```bash
git commit -m "feat: Docling OCR adapter + compose override"
```

---

## Task 16 — Real OCR: Mistral adapter

**Files:**
- Create: `src/lib/providers/ocr/mistral.ts` + test
- Modify: `src/lib/env.ts` (add `MISTRAL_API_KEY`)

**Step 1 — Test with MockAgent:** POST to `https://api.mistral.ai/v1/ocr`, `Authorization: Bearer ${MISTRAL_API_KEY}`, returns `{ pages: [{ page_number, markdown }] }`; adapter concatenates markdown into `canonical_markdown`.

**Step 2 — Implement.**

**Step 3 — Factory wiring + env default** (stays `fake` unless user sets `OCR_PROVIDER=mistral` and `MISTRAL_API_KEY`).

**Step 4 — Commit.**

```bash
git commit -m "feat: Mistral OCR adapter"
```

---

## Task 17 — `GET /api/recommendations?q=...` keyword endpoint

**Files:**
- Create: `src/app/api/recommendations/route.ts` + test
- Create: `src/lib/services/search-keyword.ts` + test
- Create: `src/lib/repositories/recommendation.ts` (if not already) + test

**Step 1 — Service test:** Given a Testcontainers DB with seeded recs having `tsv` populated, `searchKeyword(ctx, q)` uses `websearch_to_tsquery('english', q)` against `recommendations.tsv`, orders by `ts_rank_cd` desc, limits 50. Returns `{ id, title, snippet, rank, sourceId }`.

**Step 2 — Implement service.**

**Step 3 — Route:** Zod-validate `q` (min 2 chars); wrap service; JSON response.

**Step 4 — Route test:** end-to-end via Testcontainers, upload + run pipeline, `GET /api/recommendations?q=<term>` returns expected recs.

**Step 5 — Commit.**

```bash
git commit -m "feat: GET /api/recommendations?q=... — keyword search via tsvector"
```

---

## Task 18 — End-of-phase verify + PR

**Step 1 — Local verify:**
```bash
pnpm verify
docker compose down -v
docker compose up -d
docker compose exec app pnpm db:migrate && docker compose exec app pnpm db:seed
# upload fixture, wait for ready, query /api/recommendations?q=
docker compose down
```

**Step 2 — Invoke `superpowers:requesting-code-review`** before opening the PR.

**Step 3 — Open PR:** `gh pr create --base master --title "phase 2: core pipeline"` with body describing exit criteria met, any new carry-overs.

**Step 4 — Update docs:**
- `PLAN.md`: tick Phase 2 as done.
- `STATE.md`: move marker to Phase 3, flip pipeline components to ✅.
- `docs/changelog.md`: add Phase 2 entry (user-facing language).
- `docs/.docs-state.json`: bump to merge commit.
- `HANDOFF.md`: refresh (gitignored, not in commit).

**Step 5:** Squash-merge when CI green.

---

## Relevant skills to invoke as we go

- `superpowers:test-driven-development` — every task above is test-first.
- `superpowers:systematic-debugging` — when a Testcontainers test fails unexpectedly.
- `superpowers:verification-before-completion` — before ticking any task as done.
- `superpowers:requesting-code-review` — before Task 18's PR.

## Carry-overs / flags to watch

- **Docling image route path** may differ between versions — verify against the installed tag at Task 15 implementation time.
- **pg-boss schema `pgboss`** needs to land in the same database as Drizzle tables but sits in its own schema. No migration collision, but CI + docs should mention the reserved schema name.
- **`nomic-embed-text` is 768-dim**; other popular local embedding models are 384 or 1024. If we ever swap the default, we need a data migration on `recommendations.embedding` (or make the vector column width configurable at install time). Document this constraint in `docs/user-guide.md` under "Changing embedding models".
- **Mistral OCR + Docling are both optional** — defaults remain `fake` for dev & CI.
- **LLM `generateObject` retries** on schema-parse failures internally; but pg-boss also retries the whole job on throw. Configure pg-boss retry to 2–3 to avoid cascading retry blowup.
