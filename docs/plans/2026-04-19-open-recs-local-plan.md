# open-recs-local Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild Open Recommendations as a local-first, open-source app that runs on a Mac mini with optional cloud providers, and can also be deployed as a multi-user hosted instance with the same codebase.

**Architecture:** Next.js 15 (App Router, TypeScript) + Postgres (pgvector + tsvector) + pg-boss workers, orchestrated by docker-compose. All cross-cutting concerns (LLM, embedding, OCR, storage, auth) are pluggable provider interfaces driven by env vars. See `docs/plans/2026-04-19-open-recs-local-design.md` for full design.

**Tech Stack:** Next.js 15 · React 19 · TypeScript (strict) · Drizzle ORM · Zod · Better-auth · pg-boss · Vercel AI SDK · Tailwind · TanStack Query/Table · pdf.js · Vitest + Testcontainers · Playwright · Docker Compose.

---

## Phasing strategy

| Phase | Name | Exit criteria | Detail level below |
|---|---|---|---|
| 0 | Foundation | `docker compose up` runs empty Next.js + Postgres; CI green | Bite-sized |
| 1 | Schema + Providers | Drizzle schema migrates; all 5 provider interfaces land with fakes | Bite-sized |
| 2 | Core pipeline | Upload a PDF → parsed → extracted → embedded → searchable | Milestone |
| 3 | Search surfaces | Keyword, hybrid, chat-search all working | Milestone |
| 4 | UI shell | Navigation, DecisionFlow, layouts, dark mode, auth gates | Milestone |
| 5 | Source viewer | Split-pane markdown + PDF with synced scroll and citations | Milestone |
| 6 | Recommendations UI | Table (TanStack), NetworkViz, SimilarRecs, detail | Milestone |
| 7 | Progress updates | Form, list, status transitions, evidence attachments | Milestone |
| 8 | Hosted-mode features | Better-auth, ownership requests, admin dashboard | Milestone |
| 9 | Analytics | Source + recommendation analytics, charts | Milestone |
| 10 | Polish + docs | E2E coverage, running-locally guide, README, release | Milestone |

Before starting each milestone phase, re-enter `superpowers:writing-plans` with the design doc + that phase's exit criteria to decompose it into bite-sized tasks.

**Working rules throughout:**
- Every phase ends with `pnpm verify` green and a commit on a feature branch.
- No task completes without tests. Unit for logic, integration (Testcontainers) for anything touching Postgres.
- No provider implementation merges without a fake in the same folder.
- Commits follow the existing `feat:` / `fix:` / `chore:` / `docs:` / `test:` prefixes.
- Work on branches off `master`; squash-merge to master at end of each phase.

---

# Phase 0 — Foundation

**Outcome:** Empty Next.js + Postgres runs via `docker compose up`. Types, lint, test, build, and CI all work on a hello-world.

### Task 0.1 — Initialise Next.js project in-place

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `.eslintrc.json`, `.prettierrc`, `postcss.config.mjs`, `tailwind.config.ts`, `src/app/globals.css`

**Step 1:** Run `pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-install` (answer "No" to Turbopack for now to keep surface area small).

**Step 2:** Install deps: `pnpm install`.

**Step 3:** Add strict TypeScript config overrides to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true
  }
}
```

**Step 4:** Add scripts to `package.json`:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "verify": "pnpm typecheck && pnpm lint && pnpm test && pnpm build"
}
```

**Step 5:** Run `pnpm verify`. Expected: all green on hello-world.

**Step 6:** Commit: `git add . && git commit -m "feat: initialise next.js 15 app with strict ts + tailwind"`

---

### Task 0.2 — Add Vitest

**Files:**
- Create: `vitest.config.ts`, `tests/smoke.test.ts`

**Step 1:** Install: `pnpm add -D vitest @vitejs/plugin-react vite-tsconfig-paths`.

**Step 2:** Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: { provider: 'v8' },
  },
});
```

**Step 3:** Write smoke test `tests/smoke.test.ts`:
```ts
import { expect, it } from 'vitest';
it('vitest runs', () => expect(1 + 1).toBe(2));
```

**Step 4:** Run `pnpm test`. Expected: 1 test passes.

**Step 5:** Commit: `git add . && git commit -m "test: add vitest with smoke test"`

---

### Task 0.3 — Zod-validated env schema

**Files:**
- Create: `src/lib/env.ts`, `src/lib/env.test.ts`, `.env.example`

**Step 1:** Install: `pnpm add zod`.

**Step 2:** Write failing test `src/lib/env.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('fails when APP_MODE is missing', () => {
    expect(() => loadEnv({})).toThrow(/APP_MODE/);
  });

  it('accepts local mode without auth secret', () => {
    const env = loadEnv({ APP_MODE: 'local', DATABASE_URL: 'postgres://x/y' });
    expect(env.APP_MODE).toBe('local');
  });

  it('requires BETTER_AUTH_SECRET in hosted mode', () => {
    expect(() => loadEnv({ APP_MODE: 'hosted', DATABASE_URL: 'postgres://x/y' }))
      .toThrow(/BETTER_AUTH_SECRET/);
  });
});
```

**Step 3:** Run `pnpm test src/lib/env.test.ts`. Expected: fails (file not found).

**Step 4:** Implement `src/lib/env.ts`:
```ts
import { z } from 'zod';

const base = z.object({
  APP_MODE: z.enum(['local', 'hosted']),
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres://')),
});

const hosted = base.extend({
  APP_MODE: z.literal('hosted'),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
});

const local = base.extend({ APP_MODE: z.literal('local') });

const schema = z.discriminatedUnion('APP_MODE', [local, hosted]);

export type Env = z.infer<typeof schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Env validation failed:\n${issues}`);
  }
  return parsed.data;
}
```

**Step 5:** Run `pnpm test src/lib/env.test.ts`. Expected: all 3 pass.

**Step 6:** Write `.env.example` (see design doc Section H for full shape — use that verbatim).

**Step 7:** Commit: `git add . && git commit -m "feat: zod-validated env schema for dual-mode config"`

---

### Task 0.4 — Dockerfile (multi-stage, app + worker)

**Files:**
- Create: `docker/Dockerfile`, `.dockerignore`

**Step 1:** Write `.dockerignore`:
```
node_modules
.next
.git
docs
fixtures
tests
e2e
**/*.md
!CLAUDE.md
```

**Step 2:** Write `docker/Dockerfile` as multi-stage (base → deps → build → app-runtime, worker-runtime). Use `node:22-alpine`. Both runtimes copy built output; entrypoints differ.

**Step 3:** Build: `docker build -f docker/Dockerfile -t open-recs:test --target app-runtime .`. Expected: image builds successfully.

**Step 4:** Smoke-run: `docker run --rm -p 3000:3000 -e APP_MODE=local -e DATABASE_URL=postgres://x/y open-recs:test` — expect Next.js to start (it will fail to fetch DB but that's fine for this smoke).

**Step 5:** Commit: `git add . && git commit -m "build: multi-stage dockerfile for app + worker"`

---

### Task 0.5 — docker-compose base (postgres + app + worker)

**Files:**
- Create: `docker-compose.yml`, `.env` (gitignored, for local dev)

**Step 1:** Write `docker-compose.yml` with three services:
- `postgres` (image: `pgvector/pgvector:pg16`, expose 5432, volume `pgdata:/var/lib/postgresql/data`)
- `app` (build from Dockerfile target `app-runtime`, port 3000, depends_on postgres)
- `worker` (same image target `worker-runtime`, no ports)

Include a named volume `uploads:/data/uploads` mounted in both `app` and `worker`.

**Step 2:** Populate `.env` from `.env.example` with local defaults (APP_MODE=local, DATABASE_URL targeting `postgres` service).

**Step 3:** Run `docker compose up -d`. Expected: all three services healthy.

**Step 4:** Visit `http://localhost:3000`. Expected: Next.js landing page renders.

**Step 5:** Commit: `git add docker-compose.yml && git commit -m "build: docker-compose base for local dev"`

---

### Task 0.6 — GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1:** Write CI workflow:
- Triggers: `push` to any branch, `pull_request` to `master`
- Jobs: `verify` (pnpm install → `pnpm verify`)
- Node 22, cache pnpm store

**Step 2:** Push a branch. Expected: CI runs green on GitHub.

**Step 3:** Commit: `git add .github/ && git commit -m "ci: add verify workflow"`

---

### Task 0.7 — CLAUDE.md update for this project

**Files:** Modify: `CLAUDE.md`

**Step 1:** Fill in the template's architecture/commands/standards sections with:
- Architecture pointer: "See `docs/plans/2026-04-19-open-recs-local-design.md`"
- Commands: `pnpm dev`, `pnpm verify`, `docker compose up`
- Standards: "Every data-touching test uses Testcontainers; no SQLite stand-ins. Providers always have a fake implementation in-tree. No RLS; authorization goes through repositories."
- Verification: "Run `pnpm verify` before claiming a task done."

**Step 2:** Commit: `git add CLAUDE.md && git commit -m "docs: project-specific claude instructions"`

---

### Task 0.8 — End-of-phase verify

**Step 1:** Run `pnpm verify`. Expected: green.
**Step 2:** Run `docker compose up -d && curl -f http://localhost:3000 && docker compose down`. Expected: 200 OK.
**Step 3:** Open PR, squash-merge to master: `gh pr create --title "phase 0: foundation" --body "Completes Phase 0 exit criteria."`

---

# Phase 1 — Schema + provider skeleton

**Outcome:** Drizzle schema compiles and migrates. All five provider interfaces (LLM, Embedding, OCR, Storage, AuthContext) exist with fake implementations wired into a factory reading env. Tests run against real Postgres via Testcontainers.

### Task 1.1 — Drizzle install + postgres client

**Files:**
- Create: `src/lib/db/client.ts`, `drizzle.config.ts`, `src/lib/db/client.test.ts`

**Step 1:** Install: `pnpm add drizzle-orm postgres && pnpm add -D drizzle-kit @types/pg`.

**Step 2:** Install Testcontainers for integration tests: `pnpm add -D @testcontainers/postgresql`.

**Step 3:** Write test that spins up Postgres and queries `SELECT 1`:
```ts
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';

let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;

describe('db client', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  }, 60_000);
  afterAll(async () => container?.stop());

  it('connects and runs a query', async () => {
    const sql = postgres(container.getConnectionUri());
    const db = drizzle(sql);
    const result = await sql`select 1 as one`;
    expect(result[0]?.one).toBe(1);
    await sql.end();
  });
});
```

**Step 4:** Run test. Expected: pass (may take 30s on first run to pull image).

**Step 5:** Implement `src/lib/db/client.ts` that exports a `createDb(url)` factory returning `{ db, sql }`.

**Step 6:** Commit.

---

### Task 1.2 — Enable pgvector extension via migration

**Files:**
- Create: `src/lib/db/migrations/0000_init.sql`

**Step 1:** Write SQL: `CREATE EXTENSION IF NOT EXISTS vector;`
**Step 2:** Run migration through a test helper (we'll build it in Task 1.3).
**Step 3:** Commit.

---

### Task 1.3 — Drizzle schema for core tables

**Files:**
- Create: `src/lib/db/schema.ts`, `src/lib/db/schema.test.ts`

**Step 1:** Write failing test that after migrations, all expected tables exist:
```ts
// test queries information_schema.tables for each expected table name
```

**Step 2:** Implement schema in `src/lib/db/schema.ts` with Drizzle for all tables from the design (sources, source_files, source_pages, recommendations, recommendation_statuses, progress_updates, thematic_areas, recommendations_thematic_areas, evidence_types, progress_ratings, ownership_requests, job_results, analytics_cache).
  - Use `pgTable`, `uuid`, `text`, `integer`, `timestamp`, `jsonb`, `vector` (from `drizzle-orm/pg-core` + pgvector helpers).
  - `embedding vector(768)` configurable via a constant.
  - `tsv` as a generated column using `sql\`GENERATED ALWAYS AS ... STORED\`` pattern.

**Step 3:** Generate migration: `pnpm drizzle-kit generate`.

**Step 4:** Run schema test against Testcontainers Postgres. Expected: pass.

**Step 5:** Commit.

---

### Task 1.4 — Authorization context type + local implementation

**Files:**
- Create: `src/lib/providers/auth/types.ts`, `src/lib/providers/auth/local.ts`, `src/lib/providers/auth/local.test.ts`

**Step 1:** Write test that `LocalAuthContext.getContext(req)` returns `{ isSystem: true, user: { id: 'system' }, roles: ['admin'] }`.
**Step 2:** Fail the test.
**Step 3:** Implement.
**Step 4:** Pass the test.
**Step 5:** Commit.

---

### Task 1.5 — Provider interfaces + fakes (LLM, Embedding, OCR, Storage)

One task per provider, each following the same shape:

**For each of LLM, Embedding, OCR, Storage:**
- Define `Provider` interface in `src/lib/providers/<kind>/types.ts`
- Implement a `fake` in `src/lib/providers/<kind>/fake.ts` with in-memory deterministic behaviour
- Write unit test against the fake
- Commit

**Step 1 (LLM fake):** Returns echo of prompt + a marker; supports `generateStructured` via Zod parse.

**Step 2 (Embedding fake):** Deterministic — hash text to a stable 768-dim vector.

**Step 3 (OCR fake):** Reads a fixture markdown file keyed by input filename.

**Step 4 (Storage fake):** In-memory Map.

Each gets its own commit.

---

### Task 1.6 — Provider factory

**Files:**
- Create: `src/lib/providers/index.ts`, `src/lib/providers/index.test.ts`

**Step 1:** Test: `createProviders(env)` returns a typed container with the right implementations per env.
**Step 2:** In local mode + no LLM_PROVIDER set, returns fakes.
**Step 3:** Implement factory with a switch on env values.
**Step 4:** Commit.

---

### Task 1.7 — Taxonomy seed script

**Files:**
- Create: `seeds/taxonomy.ts`, `src/scripts/seed.ts`

**Step 1:** Define seed data for `thematic_areas`, `evidence_types`, `progress_ratings` as TS constants.
**Step 2:** Seed script connects via `DATABASE_URL`, runs upserts.
**Step 3:** Test that reseeding is idempotent.
**Step 4:** Commit.

---

### Task 1.8 — Repository layer skeleton

**Files:**
- Create: `src/lib/repositories/types.ts`, `src/lib/repositories/source.ts`, `src/lib/repositories/source.test.ts`

**Step 1:** Define `RepoContext` type (user, roles, isSystem).
**Step 2:** Test: `sourceRepo.create(ctx, data)` stores a row and returns it; `findBySlug(ctx, slug)` respects `is_private` per context.
**Step 3:** Implement.
**Step 4:** One rep per aggregate follows same pattern in later tasks.
**Step 5:** Commit.

---

### Task 1.9 — End-of-phase verify

**Step 1:** `pnpm verify`.
**Step 2:** PR and squash-merge.

---

# Phases 2–10 — Milestones

Each phase below lists the concrete tasks at milestone granularity. Re-enter `superpowers:writing-plans` with the design doc + that phase's exit criteria before starting, to decompose into TDD steps.

## Phase 2 — Core pipeline

**Exit criteria:** Upload a PDF via `/api/sources` → worker parses → extracts recs → embeds → source row is `status=ready`. Recommendations searchable via a simple `/api/recommendations?q=` endpoint (keyword-only for now).

**Tasks:**
- Install pg-boss + write `src/lib/jobs/queue.ts` with typed `enqueue` / handler registration.
- Worker entrypoint (`src/worker.ts`).
- Upload endpoint — stores original via StorageProvider, creates `sources` row, enqueues `source.parse`.
- `source.parse` handler — calls OCR provider (fake in tests, real in dev), writes `source_pages` + `canonical_markdown`.
- `source.extract` handler — calls LLM with structured Zod output schema, inserts recommendations.
- `source.embed` handler — batches embeddings, writes vectors.
- Integration test: end-to-end pipeline against fake providers, verifies final state in DB.
- Add `docker-compose.docling.yml` override + real Docling adapter.
- Add real Mistral OCR adapter behind `OCR_PROVIDER=mistral`.
- Real LLM adapter via Vercel AI SDK (`openai-compatible` first, covers Ollama + OpenAI).
- Real embedding adapter (same pattern).

## Phase 3 — Search surfaces

**Exit criteria:** Three working endpoints — `/api/search` (hybrid), `/api/keyword-search`, `/api/chat-search` (streaming). RRF SQL query shown in design works against seeded fixtures with expected top-hit.

**Tasks:**
- Hybrid search service in `src/lib/services/search.ts` with the RRF query.
- Keyword-only variant.
- Chat-search with streaming (Vercel AI SDK `streamText` + Vercel AI `toDataStreamResponse`).
- Citation marker extraction + structured response.
- Query embedding cache (60s LRU).
- Integration tests against fixture corpus.

## Phase 4 — UI shell

**Exit criteria:** Nav, dark mode, DecisionFlow landing, route groups (`(app)`, `(auth)`, `(marketing)`), `<FeatureGate>` hiding hosted features in local mode, public config bootstrap.

**Tasks:**
- Install Tailwind primitives (via `shadcn/ui` or a small handwritten set).
- `Navigation`, `Footer`, `DarkModeToggle`, `ThemeInitializer` ports.
- `DecisionFlow` component port.
- `getPublicConfig()` server util + client bootstrap.
- `<FeatureGate feature="auth">` and related wrappers.
- Basic dashboard page with job list.

## Phase 5 — Source viewer

**Exit criteria:** A source detail page shows canonical markdown and original PDF in a split pane with synchronised scroll. Image refs in markdown resolve via StorageProvider signed URLs.

**Tasks:**
- Install `pdfjs-dist`. Set up worker configuration for Next.js.
- `<SourceViewer>` with a resizer between panes.
- Scroll sync: track visible page in PDF → scroll matching `source_pages` anchor in markdown and vice versa.
- Image rendering — intercept markdown `![](...)` and map storage paths to signed URLs.
- `/api/files/[token]` signed-URL route.

## Phase 6 — Recommendations UI

**Exit criteria:** Recommendations index (TanStack Table) + single rec detail + NetworkViz graph route + SimilarRecommendations panel.

**Tasks:**
- Port `RecommendationsTable` using TanStack Table v8 (inline-editable cells via EditableSelectCell pattern).
- Add column-level filters that push to URL search params.
- `RecommendationCard`, `EnhancedRecommendationCard` ports.
- `SimilarRecommendations` — server action queries top-5 by cosine distance.
- `RecommendationNetworkViz` — port the canvas force-directed graph. Server endpoint returns `{ nodes, edges }` where edges have `similarity >= threshold`. Threshold is a query param.
- `/recommendations/[id]` detail page with tabs (Overview, Progress Updates, Similar).

## Phase 7 — Progress updates

**Exit criteria:** Stakeholders can post progress updates on a rec with `progress_notes`, `evidence_type`, `evidence_url`, `user_progress_rating`. Status transitions appended to `recommendation_statuses`.

**Tasks:**
- `progress_updates` repository + service.
- `ProgressUpdateForm` port.
- `ProgressUpdatesList` port.
- `StatusUpdateManager` port — appends to `recommendation_statuses`.
- Admin override for edits (hosted mode).
- Aggregate "current status" computed view in SQL.

## Phase 8 — Hosted-mode features

**Exit criteria:** With `APP_MODE=hosted`, user can sign up, log in, upload a private source that only they can see; admin can view/approve ownership requests.

**Tasks:**
- Install Better-auth; wire email/password auth.
- Implement `BetterAuthProvider` behind `AuthContext` interface.
- Sign up / login / reset / profile pages.
- Session middleware → fills `RepoContext.user`.
- Ownership request form + list + admin approve/reject.
- Admin dashboard page with ownership requests + jobs monitoring.
- Role assignment in `user_roles` table.
- E2E test: local-mode-only user can't see login; hosted-mode user flow works.

## Phase 9 — Analytics

**Exit criteria:** Per-source analytics page and global analytics dashboard render Chart.js charts from `analytics_cache` (computed by scheduled job).

**Tasks:**
- Port `SourceAnalytics` and `RecommendationAnalytics` components.
- `analytics.refresh` scheduled pg-boss job (cron at night) — populates `analytics_cache` rows.
- On-demand analytics endpoint that falls back to cache miss → live computation.
- Charts: recs per status, recs per thematic area, progress update cadence, source publication timeline.

## Phase 10 — Polish + docs + release

**Exit criteria:** README explains both deployment modes; `docs/running-locally.md` covers Mac mini + Linux setup; Playwright E2E covers both modes; tagged 1.0 release.

**Tasks:**
- Playwright tests for: upload → search → chat-search, both modes.
- CI matrix: `APP_MODE=local` and `APP_MODE=hosted`.
- README with setup, screenshots, dual-mode explanation.
- `docs/running-locally.md` — Mac mini native Ollama + Docling compose instructions; Linux one-command-with-GPU; hosted-mode guide.
- Changelog / v1.0 release notes.
- License file (ask user: MIT, AGPL, or other).
- Final `pnpm verify` + `docker compose up` smoke across all compose override combinations.

---

## Relevant skills to invoke as we go

- `superpowers:test-driven-development` for each bite-sized task inside detailed phases.
- `superpowers:writing-plans` — re-enter at the start of each milestone phase (2–10) to decompose into TDD tasks.
- `superpowers:systematic-debugging` when a test fails in an unexpected way.
- `superpowers:requesting-code-review` before squash-merging each phase PR.
- `superpowers:verification-before-completion` before claiming any phase's exit criteria met.

## Current state (for the executor)

- Repo bootstrapped from `claude-code-template` (commit `9032251`).
- Design doc at `docs/plans/2026-04-19-open-recs-local-design.md`.
- No app code yet. Start at **Task 0.1**.
- Branch: `design/initial-architecture` (this plan lives here). Phase 0 should branch off master once this plan is merged.
