# Finish-Line Plan — 1.0 Release

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Fix the last failing test, complete configurable providers PR2/PR3, add rate limiting, update README, and tag 1.0.

**Architecture:** Additive changes to the existing Next.js + Postgres monolith. No new infrastructure. Provider test-connection and model discovery extend the existing `/api/settings/providers` route group. Rate limiting is an in-memory token bucket (no Redis dependency for local mode).

**Tech Stack:** Next.js 16, Drizzle ORM, Postgres 16, Zod, vitest, Playwright

---

## Performance Review

### What's already been done ✅

- **Batch taxonomy resolution** — all slug→ID lookups in one query per kind, eliminating 400+ sequential DB calls for a 50-rec source
- **Parallel LLM passes** — Pass 1 (metadata) + Pass 2 (recommendations) run via `Promise.all`
- **Batch embedding updates** — single `UPDATE ... FROM (VALUES)` per batch instead of one UPDATE per row
- **Batch extract handler DB writes** — extract handler writes recommendations in batches, shared DB pool
- **tsvector generated columns + GIN indexes** — `sources`, `source_pages`, and `recommendations` all have `tsv` columns with GIN indexes; `WHERE` clauses use the column for GIN-accelerated filtering
- **SSE progress via pg_notify** — no polling, no websockets
- **Query embedding cache** — 60s TTL / 256 entries, in-process LRU
- **Provider config cache + NOTIFY invalidation** — 30s TTL with instant invalidation on save

### Current performance state

The pipeline and search paths are well-optimised. The remaining performance concerns are:

1. **Worker smoke test reliability** (not a runtime perf issue, but blocks 1.0)
2. **Rate limiting on `/api/chat-search`** — the costliest endpoint (LLM streaming) has no protection against abuse
3. **Web-side provider config lag** — web processes rely on 30s TTL; a NOTIFY listener would make config changes instant on the web path too

### Potential future improvements (not blocking 1.0)

- **Asymmetric embedding prefixes** — `nomic-embed-text` recommends `search_query:` / `search_document:` prefixes; currently unprefixed for corpus alignment. Revisit if corpus is re-embedded.
- **Sub-page chunking** — may improve retrieval quality for long documents. Defer until UI exposes hit quality feedback.
- **`ts_rank_cd` using generated column** — recommendations ranking computes `setweight(to_tsvector(...))` inline for weighted ranking (title=A, body=B). The generated `tsv` column is unweighted. If ranking performance matters on large corpora, add a weighted generated column or use `ts_rank_cd(r.tsv, ...)` (unweighted but GIN-compatible). Standard PG FTS pattern — not a problem at current scale.
- **Vitest `test.projects` migration** — `environmentMatchGlobs` is deprecated; migrate before vitest 4 lands.
- **pg-boss `pgboss.job` direct reads** — `listRecentJobs` reads the job table directly; a pg-boss major bump (v13+) may rename columns.

---

## Tasks

### Task 1: Fix flaky worker smoke test

**Objective:** Make `tests/worker.smoke.test.ts` pass reliably on macOS.

**Files:**
- Investigate: `tests/worker.smoke.test.ts`
- Investigate: `src/worker.ts`
- Investigate: `tests/helpers/pg-container.ts`

**Step 1: Reproduce the failure**

Run the test in isolation, repeated 3×:

```bash
pnpm vitest run tests/worker.smoke.test.ts --reporter=verbose
```

Observe: does it fail consistently, intermittently, or only under load?

**Step 2: Diagnose root cause**

Likely causes (investigate in order):
1. **Testcontainers startup race** — the worker may try to connect before Postgres is ready. Check if `startPostgres()` waits for `pg_isready` or just container start.
2. **Worker boot timing** — `registerHandlers` may take too long before printing `[worker] ready`. Check the worker's stdout buffering — `console.log` may not flush before the test's 100ms polling interval checks.
3. **pg-boss schema installation** — `createQueue` may fail silently if the database isn't fully ready. Check for unhandled promise rejections in stderr.
4. **stdout buffering** — the test reads `child.stdout.on('data')` but Node child process stdout may be line-buffered. Check if adding `stdio: ['pipe', 'pipe', 'pipe', 'pipe']` or flushing helps.

**Step 3: Fix**

Based on diagnosis, likely fixes:
- Increase the ready timeout from 20s to 30s (Testcontainers on macOS can be slow)
- Add a `pg_isready` wait loop in `startPostgres()` if not already present
- Ensure `[worker] ready` is printed with `process.stdout.write` + explicit flush, or `console.log('\n[worker] ready\n')` with newline
- If pg-boss queue creation is the bottleneck, move the `console.log('[worker] ready')` to after `registerHandlers` completes (check current placement)

**Step 4: Verify**

```bash
pnpm vitest run tests/worker.smoke.test.ts --reporter=verbose
# Run 3× to confirm reliability
```

Expected: PASS on all 3 runs.

**Step 5: Full verify**

```bash
pnpm test
```

Expected: 562/562 pass.

**Step 6: Commit**

```bash
git add tests/worker.smoke.test.ts src/worker.ts tests/helpers/pg-container.ts
git commit -m "fix: worker smoke test reliability — ready signal timing"
```

---

### Task 2: Wire chat model to DB provider config

**Objective:** Make `/api/chat-search` use DB-configured chat model settings instead of raw env only.

**Files:**
- Modify: `src/lib/providers/llm/chat-model.ts`
- Modify: `src/app/api/chat-search/route.ts`
- Test: `src/lib/providers/llm/chat-model.test.ts` (create if doesn't exist)

**Step 1: Write failing test**

Test that `getChatModel` accepts a merged config object (from `loadProviderConfig`) and resolves `chat` → `llm` fallback correctly:

```typescript
import { describe, it, expect } from 'vitest';
import { getChatModelFromConfig } from './chat-model';
import type { ProviderConfig } from '../config';

describe('getChatModelFromConfig', () => {
  it('returns null when no chat or llm provider is configured', () => {
    const config: ProviderConfig = { /* empty config */ };
    expect(getChatModelFromConfig(config)).toBeNull();
  });

  it('uses chat config when present', () => {
    const config: ProviderConfig = {
      chat: { provider: 'openai-compatible', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:0.5b' },
    };
    const model = getChatModelFromConfig(config);
    expect(model).not.toBeNull();
    // model is a LanguageModel — verify it's constructed
  });

  it('falls back to llm config when chat is absent', () => {
    const config: ProviderConfig = {
      llm: { provider: 'openai-compatible', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1:8b' },
    };
    const model = getChatModelFromConfig(config);
    expect(model).not.toBeNull();
  });
});
```

**Step 2: Run test to verify failure**

```bash
pnpm vitest run src/lib/providers/llm/chat-model.test.ts
```

Expected: FAIL — `getChatModelFromConfig` not exported.

**Step 3: Implement**

Add `getChatModelFromConfig(config: ProviderConfig)` to `chat-model.ts` that reads from the merged config object instead of raw `Env`. Keep `getChatModel(env)` as a backwards-compatible wrapper. Update `chat-search/route.ts` to call `getProviders()` and pass the config to the new function.

**Step 4: Run test to verify pass**

```bash
pnpm vitest run src/lib/providers/llm/chat-model.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/providers/llm/chat-model.ts src/lib/providers/llm/chat-model.test.ts src/app/api/chat-search/route.ts
git commit -m "feat(providers): wire chat model to DB provider config"
```

---

### Task 3: Provider test-connection endpoint

**Objective:** Implement `POST /api/settings/providers/[kind]/test` for live round-trip testing before saving.

**Files:**
- Create: `src/app/api/settings/providers/[kind]/test/route.ts`
- Test: `src/app/api/settings/providers/[kind]/test/route.test.ts`

**Step 1: Write failing test**

Test the endpoint with fake providers — assert it returns 200 with a success body for LLM, embedding (with dimension), and OCR kinds. Assert admin gating (hosted mode denies non-admins). Assert it never persists (no DB writes).

**Step 2: Run test to verify failure**

```bash
pnpm vitest run src/app/api/settings/providers/[kind]/test/route.test.ts
```

Expected: FAIL — route doesn't exist.

**Step 3: Implement**

Create the route. It should:
- Accept `POST` with `{ provider, baseUrl, model, apiKey }` in the body
- If `apiKey` is blank, fall back to the stored decrypted key for that kind
- For `llm`/`chat`: send a tiny completion request, return `{ ok: true, response: "..." }`
- For `embedding`: embed one probe string, return `{ ok: true, dimensions: N }`
- For `ocr`: check endpoint reachability, return `{ ok: true }`
- Never persist anything
- Admin-gated via `AuthContext`

**Step 4: Run test to verify pass**

**Step 5: Commit**

```bash
git add src/app/api/settings/providers/[kind]/test/route.ts src/app/api/settings/providers/[kind]/test/route.test.ts
git commit -m "feat(api): provider test-connection endpoint"
```

---

### Task 4: Embedding dimension guard

**Objective:** Block save/test when the embedding model returns vectors with a dimension that doesn't match `EMBEDDING_DIM` (768).

**Files:**
- Modify: `src/app/(app)/admin/providers/actions.ts` (add dimension check to `saveProviderSettings`)
- Modify: `src/app/api/settings/providers/[kind]/test/route.ts` (return dimension in test response)
- Test: update existing action/route tests

**Step 1: Write failing test**

Test that saving an embedding config with a mismatched dimension returns an error with an actionable message.

**Step 2: Implement**

In `saveProviderSettings`, when `kind === 'embedding'`, after upserting, embed a probe string via the new config and compare the returned dimension to `EMBEDDING_DIM`. If mismatched, rollback the upsert and throw with a message like `"model returns 1536-dim vectors; this instance is fixed at 768 — re-embedding isn't supported yet"`.

**Step 3: Verify**

**Step 4: Commit**

```bash
git commit -m "feat(providers): embedding dimension guard on save"
```

---

### Task 5: Model discovery generalisation

**Objective:** Generalise `GET /api/providers/llm/models` to accept any kind and ad-hoc base/key for pre-save model listing.

**Files:**
- Modify: `src/app/api/providers/llm/models/route.ts` → move to `src/app/api/settings/providers/[kind]/models/route.ts`
- Or create new route alongside the existing one (keep old for backwards compat)
- Test: corresponding test file

**Step 1: Write failing test**

Test that `GET /api/settings/providers/[kind]/models?baseUrl=...&apiKey=...` returns a list of models for the given kind.

**Step 2: Implement**

Generalise the existing `listModels` call to work with any openai-compatible endpoint. Accept `kind` as a path param and `baseUrl`/`apiKey` as query params (for pre-save discovery). For `embedding`, the endpoint is the same (`/v1/models` on Ollama/OpenRouter).

**Step 3: Verify**

**Step 4: Commit**

```bash
git commit -m "feat(api): generalised model discovery for all provider kinds"
```

---

### Task 6: Rate limiting on chat-search

**Objective:** Add in-memory token-bucket rate limiting to `/api/chat-search` to prevent abuse.

**Files:**
- Create: `src/lib/middleware/rate-limit.ts`
- Modify: `src/app/api/chat-search/route.ts`
- Test: `src/lib/middleware/rate-limit.test.ts`

**Step 1: Write failing test**

Test the rate limiter: allows N requests per window, rejects the (N+1)th with 429, resets after the window.

**Step 2: Implement**

In-memory token bucket keyed by IP (from `x-forwarded-for` or `request.ip`). Configurable rate (default: 10 requests/minute for chat-search). Returns 429 with `Retry-After` header when exceeded.

This is intentionally simple — no Redis, no persistent state. Adequate for local mode and small hosted deployments. For larger deployments, swap for a Redis-backed limiter later.

**Step 3: Wire into chat-search route**

Add the rate limiter at the top of the `POST` handler. Return 429 before any LLM call if the bucket is empty.

**Step 4: Verify**

```bash
pnpm test
```

**Step 5: Commit**

```bash
git add src/lib/middleware/rate-limit.ts src/lib/middleware/rate-limit.test.ts src/app/api/chat-search/route.ts
git commit -m "feat(api): rate limiting on chat-search endpoint"
```

---

### Task 7: Web-side NOTIFY listener for provider config

**Objective:** Add a provider-settings NOTIFY listener to the web process so config changes take effect instantly (not after 30s TTL).

**Files:**
- Modify: `src/lib/providers/config.ts` (export a `startWebProviderSettingsListener` function)
- Modify: `src/app/layout.tsx` or a server-side initialization point (start listener on app boot)
- Test: `src/lib/providers/config.integration.test.ts` (add test case)

**Step 1: Write failing test**

Test that a NOTIFY event clears the web-side cache (same pattern as the worker listener test).

**Step 2: Implement**

The web process is Next.js — there's no single "boot" point like the worker. Use a module-level singleton that starts listening on first import (lazy init). The listener calls `clearProviderCache()` on NOTIFY. Guard against double-listening in dev mode (hot reloads).

**Step 3: Verify**

**Step 4: Commit**

```bash
git commit -m "feat(providers): web-side NOTIFY listener for instant config refresh"
```

---

### Task 8: README local-mode setup

**Objective:** Add Ollama Modelfile instructions and local-mode setup guide to the README.

**Files:**
- Modify: `README.md`
- Check: `docs/running-locally.md` (create if it doesn't exist)

**Step 1: Check existing docs**

```bash
ls docs/running-locally.md 2>/dev/null
```

If it doesn't exist, create it with the full local setup guide.

**Step 2: Update README**

Add to the "Quick start" or "Develop" section:

```markdown
### Local LLM setup (Ollama)

For local-mode pipeline extraction, create the extract model:

```bash
ollama create llama3.1-extract -f - <<'EOF'
FROM llama3.1:8b
PARAMETER num_ctx 12288
EOF
```

Then set in `.env`:
```
LLM_MODEL=llama3.1-extract
```

For chat-search, any streaming model works. A lighter model is fine:
```
CHAT_MODEL=qwen2.5:0.5b
```
```

**Step 3: Commit**

```bash
git add README.md docs/running-locally.md
git commit -m "docs: local-mode Ollama setup instructions"
```

---

### Task 9: 1.0 tag

**Objective:** Bump version, create git tag, verify clean release.

**Files:**
- Modify: `package.json` (version → `1.0.0`)

**Step 1: Final verify**

```bash
pnpm verify   # typecheck + lint + test + build — all green
```

**Step 2: Version bump**

```bash
# In package.json, change "version": "1.1.0" to "version": "1.0.0"
```

**Step 3: Commit and tag**

```bash
git add package.json
git commit -m "chore: 1.0.0 release"
git tag -a v1.0.0 -m "open-recs-local 1.0.0 — local-first recommendations platform"
git push origin master --tags
```

---

## Task dependency graph

```
Task 1 (worker smoke fix)     — independent, do first (unblocks green CI)
Task 2 (chat model DB wiring) — independent
Task 3 (test-connection)      — independent
Task 4 (dimension guard)      — depends on Task 3 (uses test endpoint logic)
Task 5 (model discovery)      — independent
Task 6 (rate limiting)        — independent
Task 7 (web NOTIFY listener)  — independent
Task 8 (README)               — independent
Task 9 (1.0 tag)              — depends on all above
```

**Parallelisable:** Tasks 2, 3, 5, 6, 7, 8 can be dispatched to separate subagents simultaneously (no file overlap). Task 1 should be done first to restore green CI. Task 4 follows Task 3. Task 9 is last.

## Out of scope (post-1.0)

- OAuth providers (Google/GitHub)
- 2FA, GDPR data export, audit log
- Email rate limiting
- Progress update edit/delete UI
- File-attachment uploads for evidence
- NetworkViz (force-directed graph)
- Redis-backed rate limiting
- Re-embedding / vector column migration
- v1 Supabase data import tool