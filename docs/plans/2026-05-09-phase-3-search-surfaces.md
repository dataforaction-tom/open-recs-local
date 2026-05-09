# Phase 3 — Search Surfaces Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Three working search endpoints over the corpus produced by Phase 2. `/api/search` does **hybrid** retrieval (tsvector + pgvector fused via Reciprocal Rank Fusion, k=60) over `recommendations`. `/api/keyword-search` is the keyword-only branch — same SQL minus the vector CTE, also the graceful-degradation path when the embedding provider is unavailable. `POST /api/chat-search` runs hybrid over `source_pages`, feeds the top-K into an LLM via Vercel AI SDK `streamText`, and streams a response laced with `[[source:<slug>#page:<n>]]` citation markers that downstream UI will render as `<Citation>` chips. All three live behind the same service module and share a 60-second per-query embedding cache.

**Architecture:** A single `src/lib/services/search.ts` exports `searchRecommendations({ ctx, q, filters, mode })` and `searchSourcePages({ ctx, q, filters, topK })`. Both compose Drizzle `sql` fragments — the canonical RRF query is hand-written SQL because Drizzle's query builder doesn't express full-outer-join-on-rank-CTEs cleanly. The service receives a `RepoContext` (carrying `db` + `auth`) so the Phase 8 ownership filter slots in without an interface change. Embedding calls go through a tiny in-process LRU (`src/lib/services/query-embedding-cache.ts`, ~30 lines, no dependency) keyed by `${model}:${q}` with a 60s TTL and 256-entry cap. Citation markers are extracted post-hoc by `src/lib/services/citations.ts` for callers that want a structured `Citation[]` alongside the streamed text. Chat-search uses `streamText({ model, messages })` from `ai` and returns `result.toDataStreamResponse()` so any AI-SDK-aware client can consume it.

**Tech Stack:** Drizzle 0.45 (`postgres-js` driver, raw `sql` for the RRF query) · pgvector HNSW (`vector_cosine_ops`, dim=768) · Postgres tsvector + `websearch_to_tsquery` · Vercel AI SDK (`ai@^6.0.168`, `@ai-sdk/openai-compatible@^2.0.41`, both already in deps) · Zod at every API boundary · Vitest + Testcontainers (`pgvector/pgvector:pg16`).

---

## Phase 3 exit criteria

1. `GET /api/search?q=<query>` returns hybrid-ranked recommendations; the canonical "expected top hit" assertion against the seeded fixture corpus passes.
2. `GET /api/keyword-search?q=<query>` returns the same fixture row when the embedding provider is forced off, proving the graceful-degrade contract.
3. `POST /api/chat-search` streams an LLM response over the AI SDK data-stream protocol, and the streamed text contains at least one well-formed `[[source:<slug>#page:<n>]]` marker that resolves to a real `source_pages` row.
4. The canonical RRF SQL (documented in this plan, Task 2) returns the expected ordering on a hand-seeded recs fixture in a Testcontainers integration test.
5. `pnpm verify` green. End-of-phase pipeline test that uploads a PDF through `/api/sources` and queries through `/api/search` passes.

---

## Preflight facts (resolved at plan time, 2026-05-09)

- **AI SDK versions** (verified in `package.json`): `ai@^6.0.168`, `@ai-sdk/openai-compatible@^2.0.41`. Both already in `dependencies` from Phase 2 — Phase 3 adds no new runtime deps.
- **`streamText` + Next 16 App Router**: route handlers must be `runtime = 'nodejs'` (Edge would break our Postgres driver) and `dynamic = 'force-dynamic'`. Mirror the conventions already in `src/app/api/recommendations/route.ts:8-9`.
- **HNSW operator class**: `vector_cosine_ops` confirmed in `src/lib/db/schema.ts:84` (source_pages) and `:112` (recommendations). The query operator is `<=>` (cosine distance, smaller = closer).
- **Embedding dim**: 768 (`EMBEDDING_DIM` in `src/lib/db/schema.ts:16`), matches `nomic-embed-text`. Phase 3 inherits this.
- **Existing keyword endpoint**: `src/app/api/recommendations/route.ts` calls `searchRecommendationsKeyword` from the recommendation **repository**. Phase 3 promotes the search logic into `src/lib/services/search.ts`. The endpoint then forwards through the service for backwards compat; new public surface is `/api/search` and `/api/keyword-search`.
- **Drizzle raw SQL**: `ctx.db.execute<RowShape>(sql\`...\`)` returns a typed array. Phase 2's keyword query in `src/lib/repositories/recommendation.ts` is the working template for parameter interpolation, including the auth filter pattern.
- **Embedding provider unavailability**: signalled by `EMBEDDING_PROVIDER=fake` in local-only flows OR by an explicit `?keyword=true` flag. The service does not introspect provider state itself — the route layer decides whether to pass an embedding provider.
- **No Redis, no extra LRU dep.** A 30-line `LruCache` with a `Map` (insertion-order iteration) and TTL stamps is enough.
- **Nomic query/document prefixing** (`search_query: ` / `search_document: `): we don't add prefixing in Phase 3 — Phase-2 corpus was embedded without prefixes, so prefixing the query would de-align the vector space. Tracked as a carry-over.

---

## Task list

| # | Task | Touches |
|---|---|---|
| 1 | `LruCache` skeleton for the query embedding cache (no new deps) | `src/lib/services/query-embedding-cache.ts`, `.test.ts` |
| 2 | Canonical RRF SQL helper + Testcontainers test asserting expected ordering on seeded recs | `src/lib/services/search-sql.ts`, `.test.ts` |
| 3 | `searchRecommendations` service (hybrid + keyword modes) + tests | `src/lib/services/search.ts`, `.test.ts` |
| 4 | Move keyword endpoint to `/api/keyword-search`; introduce `/api/search` (hybrid) | route files + tests |
| 5 | Wire query embedding cache into the service + tests for hit/miss/expiry | `src/lib/services/search.ts`, cache test |
| 6 | `searchSourcePages` for chat retrieval target | `search.ts` (extend), tests |
| 7 | Citation marker schema + `extractCitations` + tests | `src/lib/services/citations.ts`, `.test.ts` |
| 8 | `POST /api/chat-search` route with `streamText` + `toDataStreamResponse` | `src/app/api/chat-search/route.ts`, `.test.ts` |
| 9 | End-of-phase pipeline integration test | `tests/search.e2e.test.ts` |
| 10 | End-of-phase verify + PR | — |

---

## Out of scope for Phase 3 (called out explicitly)

- Cross-encoder reranker (`RERANK_PROVIDER`) — open question in design `:187`. Phase 3 ships RRF only.
- Sub-page chunking — open question. We embed/search whole `source_pages` rows.
- UI components consuming these endpoints (`<Citation>`, `ChatInterface`, `SearchBar`) — Phase 4 / Phase 6.
- Authn / ownership filters beyond the existing public-vs-private check — Phase 8. The service interface accepts a `RepoContext` so wiring real auth is a one-line filter change later.
- Re-prefixing embeddings for `nomic-embed-text` — would require re-embedding the corpus; tracked as a carry-over.
- Filter UI / chip rendering — Phase 4+. Query parameters are wire-ready; no UI built.

---

## Task 1 — `LruCache` skeleton

**Files:**
- Create: `src/lib/services/query-embedding-cache.ts`
- Create: `src/lib/services/query-embedding-cache.test.ts`

**Step 1 — Failing tests:**

```ts
describe('LRU query embedding cache', () => {
  it('returns the cached vector on hit, only invokes the loader once', async () => {
    const cache = createQueryEmbeddingCache({ ttlMs: 60_000, maxEntries: 8 });
    const loader = vi.fn(async () => [0.1, 0.2, 0.3]);
    const a = await cache.get('m', 'hello', loader);
    const b = await cache.get('m', 'hello', loader);
    expect(a).toEqual([0.1, 0.2, 0.3]);
    expect(b).toEqual(a);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('expires entries after ttlMs', async () => { /* fake timers */ });
  it('evicts the oldest entry when full', async () => { /* maxEntries: 2 */ });
  it('keys by model name as well as query text', async () => { /* m1 vs m2 */ });
});
```

**Step 2 — Implement** `createQueryEmbeddingCache({ ttlMs, maxEntries })` returning `{ get(model, query, loader): Promise<number[]> }`. Use `Map<string, { value: number[]; expiresAt: number }>`; on miss call the loader and `set()`; on insert eviction delete the oldest key (Map iterates in insertion order). Export a module-level `defaultQueryEmbeddingCache` bound to `(60_000, 256)` for the service to reuse.

**Step 3 — Run tests, commit.**

```bash
pnpm test src/lib/services/query-embedding-cache.test.ts
git add src/lib/services/query-embedding-cache.ts src/lib/services/query-embedding-cache.test.ts
git commit -m "feat: in-process LRU cache for query embeddings (60s TTL, 256-entry cap)"
```

**Expected:** four passing tests, exit 0.

---

## Task 2 — Canonical RRF SQL helper

**Files:**
- Create: `src/lib/services/search-sql.ts`
- Create: `src/lib/services/search-sql.test.ts`

**Step 1 — Author the canonical RRF SQL.** This is the contract referenced in `docs/plans/2026-04-19-open-recs-local-design.md:120`.

```sql
-- Inputs:
--   $1: pgvector literal of the query embedding ('[0.1,0.2,...]'::vector(768))
--   $2: tsquery (websearch_to_tsquery('english', q))
--   $3: limit (final fused count, default 50)
-- Filters (sourceId, thematicAreaId, status, createdAfter/Before) splice into BOTH CTEs.
WITH keyword_ranked AS (
  SELECT r.id,
    row_number() OVER (
      ORDER BY ts_rank_cd(r.tsv, $2) DESC, r.created_at DESC
    ) AS rank
  FROM recommendations r
  JOIN sources s ON s.id = r.source_id
  WHERE r.tsv @@ $2
    AND <auth_filter>
    AND <filter_predicates>
  LIMIT 100
),
vector_ranked AS (
  SELECT r.id,
    row_number() OVER (
      ORDER BY r.embedding <=> $1, r.created_at DESC
    ) AS rank
  FROM recommendations r
  JOIN sources s ON s.id = r.source_id
  WHERE r.embedding IS NOT NULL
    AND <auth_filter>
    AND <filter_predicates>
  LIMIT 100
),
fused AS (
  SELECT coalesce(kr.id, vr.id) AS id,
    1.0 / (60 + coalesce(kr.rank, 1000))
      + 1.0 / (60 + coalesce(vr.rank, 1000)) AS rrf_score,
    kr.rank AS keyword_rank,
    vr.rank AS vector_rank
  FROM keyword_ranked kr
  FULL OUTER JOIN vector_ranked vr ON vr.id = kr.id
)
SELECT
  r.id          AS "id",
  r.title       AS "title",
  r.body        AS "body",
  r.source_id   AS "sourceId",
  s.slug        AS "sourceSlug",
  f.rrf_score   AS "rrfScore",
  f.keyword_rank AS "keywordRank",
  f.vector_rank  AS "vectorRank"
FROM fused f
JOIN recommendations r ON r.id = f.id
JOIN sources s ON s.id = r.source_id
ORDER BY f.rrf_score DESC, r.created_at DESC
LIMIT $3;
```

Notes embedded as comments in the implementation:
- `coalesce(rank, 1000)` is the standard RRF "missing rank" treatment. With `k=60` and per-CTE limit 100, a missing rank contributes `1/(60+1000) ≈ 0.00094` while a top-1 present rank contributes `1/(60+1) ≈ 0.0164` — present always strictly beats missing.
- Each CTE caps at 100 candidates; the final `LIMIT $3` defaults to 50 in the service layer.
- The auth filter mirrors the existing pattern in `src/lib/repositories/recommendation.ts` (public OR owned-by-viewer OR `isSystem`). Reuse the exact pattern in both CTEs.
- `<filter_predicates>` is composed in TS from optional `sourceId`, `thematicAreaId`, `status`, `createdAfter`, `createdBefore`. `thematicAreaId` joins through `recommendations_thematic_areas` only when that filter is present.
- `vector_ranked` is omitted entirely in the keyword-only variant — the final SELECT then just orders by `kr.rank`. Implemented as a sibling helper `runRecommendationsKeyword` so the calling code branches once, not in SQL.

**Step 2 — Failing test (Testcontainers-backed).** Boots Postgres, applies migrations, hand-seeds three recs with deterministic 768-dim vectors and known keyword overlap. Three cases:
- A row that wins on BOTH keyword and vector → top of the result set.
- Vector-only match (query has no keyword overlap with anything) → vector ordering still produces a winner.
- `sourceId` filter applied inside both CTEs → cross-source rows excluded.

Use a `vec(slot, value=1)` helper that returns a `new Array(768).fill(0)` with one slot set, so cosine distance ordering is engineered.

**Step 3 — Implement.** `src/lib/services/search-sql.ts` exports:
- `runRecommendationsRrf(ctx, { q, queryEmbedding, limit, filters? })`
- `runRecommendationsKeyword(ctx, { q, limit, filters? })`
- Internal helpers `composeAuthFilter(ctx)` and `composeRecFilters(filters)` returning `sql` fragments.
- `arrayToVectorLiteral(embedding)` → `'[' + embedding.join(',') + ']'` for pgvector literal interpolation.

**Step 4 — Run, commit.**

```bash
pnpm test src/lib/services/search-sql.test.ts
git add src/lib/services/search-sql.ts src/lib/services/search-sql.test.ts
git commit -m "feat: canonical RRF SQL for recommendations (k=60, full outer join, filter-aware)"
```

---

## Task 3 — `searchRecommendations` service (hybrid + keyword)

**Files:**
- Create: `src/lib/services/search.ts`
- Create: `src/lib/services/search.test.ts`

**Service shape:**

```ts
export type SearchFilters = {
  sourceId?: string;
  thematicAreaId?: string;
  status?: 'open' | 'in_progress' | 'done' | 'blocked' | 'withdrawn';
  createdAfter?: Date;
  createdBefore?: Date;
};

export type SearchHit = {
  id: string;
  title: string;
  body: string;
  sourceId: string;
  sourceSlug: string;
  rrfScore: number | null;
  keywordRank: number | null;
  vectorRank: number | null;
};

export type SearchInput = {
  ctx: RepoContext;
  q: string;
  filters?: SearchFilters;
  limit?: number;
  mode: 'hybrid' | 'keyword';
};

export async function searchRecommendations(
  input: SearchInput,
  deps?: { embedding?: EmbeddingProvider; cache?: QueryEmbeddingCache },
): Promise<SearchHit[]>;
```

**Behavioural contract:**
- `mode: 'keyword'` → `runRecommendationsKeyword` (no embedding). Fill `rrfScore=null`, `vectorRank=null`.
- `mode: 'hybrid'` + `deps.embedding` → cache-load query embedding; `runRecommendationsRrf`.
- `mode: 'hybrid'` without `deps.embedding` → log a single `console.warn` and fall through to keyword-only.
- Empty `q` rejected at the route layer (Zod min 2). Service trusts inputs.

**Step 1 — Failing tests** (Testcontainers; reuse seeding pattern from Task 2):
- Hybrid: returns expected top hit; cache loader called once across two identical queries.
- Keyword: skips embed loader entirely; `rrfScore` is `null`.
- Hybrid w/o embedding provider: degrades, returns top hit by keyword, `vectorRank` is `null`.

**Step 2 — Implement** against helpers from Task 2 + cache from Task 1.

**Step 3 — Commit.**

```bash
git commit -m "feat: searchRecommendations service (hybrid+keyword) with graceful degrade"
```

---

## Task 4 — Move keyword endpoint, introduce hybrid endpoint

**Files:**
- Create: `src/app/api/search/route.ts` + `route.test.ts`
- Create: `src/app/api/keyword-search/route.ts` + `route.test.ts`
- Modify: `src/app/api/recommendations/route.ts` — keep as a passthrough that routes through `searchRecommendations({ mode: 'keyword' })`. Add a TODO marking it as the legacy alias to remove in Phase 6.

**Justification for endpoint split (vs. one endpoint with `?mode=`):** two routes make the code paths legible to operators (the keyword endpoint never reads embedding env), give independent rate-limit / cache budgets later, and let OpenAPI document them as distinct contracts.

**`/api/search` shape:**

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  q: z.string().min(2).max(200),
  source: z.string().uuid().optional(),
  theme:  z.string().uuid().optional(),
  status: z.enum(REC_STATUS).optional(),
  limit:  z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(req: Request): Promise<Response> {
  // parse, build providers, build RepoContext, call searchRecommendations(mode: 'hybrid')
}
```

`/api/keyword-search` is the same scaffold with `mode: 'keyword'` and no embedding dep passed.

**Step 1 — Failing route tests** (Testcontainers, exercise `GET` import directly):
- `GET /api/search?q=badger` → top hit is `'badger conservation plan'`, `body.mode === 'hybrid'`.
- `GET /api/keyword-search?q=badger` → same row with `rrfScore: null`.
- `q` < 2 chars → 400.
- `?source=<uuid>` → only that source's hits.

**Step 2 — Update legacy route.** Thin `/api/recommendations` to call the service in keyword mode. Update its existing test to match the new return shape.

**Step 3 — Run, commit.**

```bash
git commit -m "feat: /api/search (hybrid) + /api/keyword-search; recommendations route uses service"
```

---

## Task 5 — Wire and prove the query embedding cache

**Files:**
- Modify: `src/lib/services/search.ts` to use the module-level singleton when `deps.cache` is omitted.
- Extend: `src/lib/services/query-embedding-cache.test.ts` with a "two service calls share the singleton" check.

**Failing test:**

```ts
it('repeated /api/search calls within 60s share an embedding loader', async () => {
  const loader = vi.fn(async () => vec(0));
  const provider = { name: 'fake', model: 'm', dimensions: 768, embed: loader };
  await searchRecommendations({ ctx: ctx(), q: 'badger', mode: 'hybrid' }, { embedding: provider });
  await searchRecommendations({ ctx: ctx(), q: 'badger', mode: 'hybrid' }, { embedding: provider });
  expect(loader).toHaveBeenCalledTimes(1);
});
```

**Implement:** export `defaultQueryEmbeddingCache` from the cache module; wire it as the fallback in `searchRecommendations`.

**Commit:**

```bash
git commit -m "feat: share the 60s query embedding cache across search service calls"
```

---

## Task 6 — `searchSourcePages` for chat retrieval

**Files:**
- Extend: `src/lib/services/search.ts` (add `searchSourcePages`)
- Extend: `src/lib/services/search-sql.ts` (add `runSourcePagesRrf`)
- Extend: both test files

**SQL.** Same RRF shape but the target is `source_pages`. Note: `source_pages` does NOT have a generated `tsv` column (only `recommendations` and `sources` have them — confirmed in `src/lib/db/schema.ts:68-86`). Compute the keyword side at query time:

```sql
WITH keyword_ranked AS (
  SELECT p.id, row_number() OVER (
    ORDER BY ts_rank_cd(to_tsvector('english', coalesce(p.markdown, '')), $2) DESC, p.page_number
  ) AS rank
  FROM source_pages p
  JOIN sources s ON s.id = p.source_id
  WHERE to_tsvector('english', coalesce(p.markdown, '')) @@ $2
    AND <auth_filter>
  LIMIT 100
),
vector_ranked AS (
  SELECT p.id, row_number() OVER (ORDER BY p.embedding <=> $1, p.page_number) AS rank
  FROM source_pages p
  JOIN sources s ON s.id = p.source_id
  WHERE p.embedding IS NOT NULL AND <auth_filter>
  LIMIT 100
),
fused AS (
  SELECT coalesce(kr.id, vr.id) AS id,
    1.0/(60+coalesce(kr.rank,1000)) + 1.0/(60+coalesce(vr.rank,1000)) AS rrf_score
  FROM keyword_ranked kr FULL OUTER JOIN vector_ranked vr ON vr.id = kr.id
)
SELECT p.id AS "id", p.source_id AS "sourceId", s.slug AS "sourceSlug",
       p.page_number AS "pageNumber", p.markdown AS "markdown",
       f.rrf_score AS "rrfScore"
FROM fused f
JOIN source_pages p ON p.id = f.id
JOIN sources s ON s.id = p.source_id
ORDER BY f.rrf_score DESC, p.page_number
LIMIT $3;
```

This bypasses any GIN index — flag as a Phase-4 carry-over: "if chat-search latency suffers, add a generated `source_pages.tsv` + GIN index migration."

**Service signature:**

```ts
export type SourcePageHit = {
  id: string; sourceId: string; sourceSlug: string;
  pageNumber: number; markdown: string; rrfScore: number;
};

export async function searchSourcePages(
  input: { ctx: RepoContext; q: string; topK?: number },
  deps: { embedding: EmbeddingProvider; cache?: QueryEmbeddingCache },
): Promise<SourcePageHit[]>;
```

`topK` defaults to 8 — small enough for a typical 8k-context chat prompt, big enough for cross-page evidence.

**Failing test:** seed two sources with two pages each, embed deterministically, assert page with both keyword overlap and closest vector ranks first.

**Commit:**

```bash
git commit -m "feat: searchSourcePages over source_pages (hybrid RRF, top-K for chat)"
```

---

## Task 7 — Citation marker schema + extraction

**Files:**
- Create: `src/lib/services/citations.ts`
- Create: `src/lib/services/citations.test.ts`

**Marker grammar:** `[[source:<slug>#page:<n>]]`  · `slug = [a-z0-9][a-z0-9-]*`  · `n = 1..N (1-based integer)`.

**Failing tests:**
- Single well-formed marker → `[{ sourceSlug, pageNumber, raw }]`.
- Multiple in order; exact-repeat dedup.
- Malformed (empty slug, page 0, non-integer, uppercase slug, single brackets, trailing dash) → `[]`.
- `pageCounts` map filters out-of-range page numbers.

**Implementation:**

```ts
export const CITATION_RE = /\[\[source:([a-z0-9][a-z0-9-]*)#page:(\d+)\]\]/g;

export type Citation = { sourceSlug: string; pageNumber: number; raw: string };

export function extractCitations(
  text: string,
  opts: { pageCounts?: Record<string, number> } = {},
): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const match of text.matchAll(CITATION_RE)) {
    const [raw, slug, pageStr] = match;
    const pageNumber = Number(pageStr);
    if (!slug || !Number.isInteger(pageNumber) || pageNumber < 1) continue;
    if (opts.pageCounts && (opts.pageCounts[slug] ?? 0) < pageNumber) continue;
    const key = `${slug}#${pageNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ sourceSlug: slug, pageNumber, raw });
  }
  return out;
}
```

Also export `validateCitations(text, knownSources)` returning `{ valid: Citation[]; invalid: string[] }` for routes that want to surface invalid markers in the response.

**Commit:**

```bash
git commit -m "feat: citation marker grammar + extractCitations with malformed/dup/out-of-range guards"
```

---

## Task 8 — `POST /api/chat-search` with `streamText`

**Files:**
- Create: `src/app/api/chat-search/route.ts` + `route.test.ts`
- Extend: `src/lib/providers/llm/openai-compat.ts` with a `createOpenAICompatChatModel` helper that returns an AI-SDK-compatible chat model (small additive helper, no breaking change to `LlmProvider`).

**Behaviour:**
1. POST body validated with Zod: `{ q: string (2..1000), history?: { role: 'user'|'assistant', content: string }[] }`.
2. Run `searchSourcePages({ ctx, q, topK: 8 })`. Chat-search does not gracefully degrade — returns 503 if no real embedding/LLM provider is configured.
3. Build a system prompt listing retrieved pages prefixed with `[source:<slug> page:<n>]\n<markdown>`, instructing the LLM to cite using the exact `[[source:<slug>#page:<n>]]` form whenever stating a fact derived from a retrieved page.
4. Compose `messages = [...history, { role: 'user', content: q }]`.
5. `streamText({ model, system, messages })` then `result.toDataStreamResponse({ headers: { 'x-citations-count': String(retrieved.length), 'x-retrieved': JSON.stringify(retrieved.map(r => ({ slug: r.sourceSlug, page: r.pageNumber }))) } })`.

**Failing tests:**
- Stub a deterministic fake chat model emitting `"foo [[source:sample-report#page:1]] bar"`. Assert `200`, body matches `/\[\[source:[a-z0-9-]+#page:\d+\]\]/`.
- `q` < 2 → 400.
- No real LLM provider configured → 503.

**Helper to add:**

```ts
// src/lib/providers/llm/openai-compat.ts
export function createOpenAICompatChatModel(config: OpenAICompatLlmConfig) {
  const client = createOpenAICompatible({
    name: 'openai-compat',
    baseURL: config.baseUrl,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
  });
  return client.chatModel(config.model);
}
```

The route imports this directly when `env.LLM_PROVIDER === 'openai-compatible'`. Tests use AI SDK testing helpers (`MockLanguageModelV1` / `simulateStreamingMiddleware` — pick whichever exists in the installed version at task time).

**Commit:**

```bash
git commit -m "feat: POST /api/chat-search streams hybrid-RAG over source_pages with citation markers"
```

---

## Task 9 — End-of-phase pipeline integration test

**Files:**
- Create: `tests/search.e2e.test.ts`

Mirror `tests/pipeline.e2e.test.ts` for boot/tear-down (one Testcontainers Postgres, migrate, seed taxonomy, register handlers). Then:
- Upload `fixtures/sources/sample-report.pdf` via `uploadSource`.
- Wait for `sources.status === 'ready'` (already exercised in Phase 2).
- `GET /api/search?q=auditor` → top hit asserts a known recommendation from `sample-report.recommendations.json`.
- `GET /api/keyword-search?q=auditor` → same row appears with `rrfScore: null`.
- `POST /api/chat-search { q: 'how often should auditors rotate?' }` → read the streamed body to completion; assert at least one `[[source:sample-report#page:N]]` marker appears.

**Commit:**

```bash
git commit -m "test(e2e): upload → /api/search hybrid + /api/keyword-search degrade + /api/chat-search citation"
```

---

## Task 10 — End-of-phase verify + PR

**Step 1 — Local verify:**

```bash
pnpm verify
docker compose down -v
docker compose up -d
docker compose exec app pnpm db:migrate && docker compose exec app pnpm db:seed
# Manual smoke after uploading a fixture:
curl -s 'http://localhost:3000/api/search?q=auditor' | jq .
curl -s 'http://localhost:3000/api/keyword-search?q=auditor' | jq .
curl -sN -X POST 'http://localhost:3000/api/chat-search' \
  -H 'content-type: application/json' \
  -d '{"q":"how often should auditors rotate?"}'
docker compose down
```

**Step 2 — Open PR:** `gh pr create --base master --title "phase 3: search surfaces"` with summary of exit criteria met.

**Step 3 — Update docs:**
- `PLAN.md`: tick Phase 3 done.
- `STATE.md`: move marker to Phase 4, flip search components to ✅.
- `docs/changelog.md`: Phase 3 entry — "three search surfaces — hybrid, keyword, chat — over the corpus".
- `docs/.docs-state.json`: bump to merge commit.

**Step 4:** Squash-merge when CI green.

---

## Carry-overs / flags to watch

- **`source_pages` lacks a generated `tsv` column.** Phase 3 computes it inline in `searchSourcePages`. If chat-search latency becomes an issue, add a generated tsvector + GIN index migration in Phase 4. Don't do it here — would force a corpus rebuild.
- **Nomic query/document prefixing.** `nomic-embed-text` recommends `search_query: ` / `search_document: ` for asymmetric retrieval. Skipped to stay aligned with how Phase-2 corpus was embedded; tracked against the embed handler.
- **Cross-encoder reranker.** Open question in design `:187`. RRF only in Phase 3.
- **Chat-search fake model.** Production stays strict (real provider only); tests stub the model via AI SDK testing helpers.
- **`/api/recommendations` legacy alias** intentionally kept (calls keyword service) so Phase 2 docs and external scripts don't 404. Remove in Phase 6 when the table UI lands.
- **Auth filter unification.** All three endpoints will share `composeAuthFilter` in `search-sql.ts`. When Phase 8 introduces real ownership, only that helper changes.
