# open-recs-local — Design

> Date: 2026-04-19
> Status: Approved
> Authors: Tom (product), Claude (drafting)
> Source app: https://github.com/dataforaction-tom/open-recommendations

A local-first, open-source rebuild of Open Recommendations. Full feature parity with v1, plus a dual-mode operating model: **local** (no auth, Mac-mini-friendly) and **hosted** (Better-auth, ownership/admin flows). Both modes share one codebase, one database schema, and one deployment shape.

## Goals

1. Run the full app on a Mac mini with no cloud dependencies required.
2. Preserve the option to deploy as a multi-user hosted instance with auth, ownership workflows, admin dashboard, and the ownership-request flow.
3. Support local LLMs and local OCR by default, with clean opt-in paths to cloud providers (Anthropic, OpenAI, Mistral, Mistral OCR, Firecrawl).
4. Preserve v1's domain depth: progress updates on recommendations, network viz, similar-rec discovery, thematic taxonomy, chat-search with citations.

## Non-goals

- Automated data migration from the v1 Supabase deployment (users can import, but not a v1.x → 2.0 upgrade path).
- Feature parity with AG Grid Enterprise — v1's use is light and covered by TanStack Table.
- Kubernetes, multi-region, horizontal autoscaling. Single-host docker-compose is the target.

## Key design decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Full-parity rebuild with dual-mode (local / hosted)** | Ships as a tool anyone can self-host, without forcing multi-user auth onto solo users. |
| 2 | **Plain Postgres + pgvector + tsvector** | One stack for both modes; boring, proven, handles hybrid search in-engine. |
| 3 | **Better-auth for hosted mode; no-auth context in local mode** | Pluggable auth via one `AuthContext` interface; local mode bypasses cleanly. |
| 4 | **Provider abstractions** for LLM, Embedding, OCR, Storage, Auth | Env-var-driven; swap Ollama for Anthropic or Docling for Mistral OCR without code changes. |
| 5 | **pg-boss for jobs** (not Redis/BullMQ) | Zero new infra; uses the Postgres we already have. |
| 6 | **SSE via Postgres LISTEN/NOTIFY for progress** | No websockets or polling; natural fit with pg-boss. |
| 7 | **Canonical markdown + pages JSON as the storage format** | One shape downstream of any OCR provider; preserves tables, images, page anchors. |
| 8 | **TypeScript + Drizzle + Zod** | Types for schema, runtime validation at boundaries, one source of truth. |
| 9 | **TanStack Table (not AG Grid)** | v1's direction already; fully OSS, lighter. |
| 10 | **No RLS; authorization in a repository layer** | Required for the mode switch to be portable and testable. |

## System overview

Three processes, one Postgres. Optional overrides add MinIO, Ollama, or Docling.

```
┌──────────────┐   ┌──────────────┐
│  app         │──▶│  worker      │   pg-boss queue
│  Next.js 15  │   │  handlers    │
│  (TS)        │   └──────┬───────┘
└──────┬───────┘          │
       └────── shared ────┤
                          ▼
                  ┌────────────────┐
                  │  postgres      │
                  │  + pgvector    │
                  │  + tsvector    │
                  │  + pgboss.*    │
                  └────────────────┘
volumes: /data/uploads (fs, default) | minio (optional)
```

**Mode switch:** one env var `APP_MODE=local|hosted` toggles the auth context, ownership UI, admin surface, and visibility enforcement. Repository layer reads `ctx.user` — `system` in local mode, real user in hosted mode — so business logic is mode-agnostic.

## Data model

| Table | Purpose |
|---|---|
| `users`, `sessions`, `accounts` | Better-auth schema — empty in local mode |
| `user_roles` | App-layer role (`admin`, `editor`, `viewer`) |
| `sources` | One per uploaded report; `canonical_markdown`, `metadata`, `is_private`, `status` |
| `source_files` | Original PDF + extracted images (role-tagged) |
| `source_pages` | Per-page `markdown`, `image_refs`, `embedding vector(dim)`, `embedding_model` |
| `recommendations` | Extracted items; `title`, `body`, `page_anchor`, `embedding`, `embedding_model` |
| `recommendation_statuses` | Append-only status log; current via view |
| `progress_updates` | Stakeholder time-series on rec implementation: `progress_notes`, `evidence_type`, `evidence_url`, `user_progress_rating` |
| `thematic_areas` | Reference taxonomy with `color_hex` |
| `recommendations_thematic_areas` | Many-to-many |
| `evidence_types`, `progress_ratings` | Reference taxonomies |
| `ownership_requests` | Same shape as v1 |
| `job_results` | UI-facing summary of long jobs; pg-boss internals live in `pgboss.*` schema |
| `analytics_cache` | Keyed JSON for expensive aggregates |

**Indexes:** HNSW on embedding columns; GIN on `tsvector` generated columns; B-tree on slugs and FKs.

**Embedding strategy:** vectors live on the rows they describe (`source_pages.embedding`, `recommendations.embedding`). `embedding_model` is stored with every vector — swapping the model is an explicit reindex job, not a mystery.

## Provider abstractions

All five follow the same shape: interface → implementations → factory reading env.

**LLM** — `generateText`, `generateStructured` via Vercel AI SDK. Implementations: `openai-compatible` (covers Ollama, LM Studio, vLLM, OpenAI), `anthropic`, `mistral`.

**Embedding** — `embed(texts)` + `modelName`, `dimensions`. Implementations: `openai-compatible`, `voyage`.

**OCR** — `parseDocument(file) → { markdown, pages[], metadata }`. Implementations: `mistral` (cloud default), `docling` (HTTP client), `firecrawl`, `tesseract-pdf`. Every adapter normalises to the same `ParsedDocument` shape.

**Storage** — `put`, `get`, `signedUrl`, `delete`, `exists`. Implementations: `fs` (default), `s3`.

**AuthContext** — `getContext(req)` returns `{ user, roles, isSystem }`. Implementations: `local` (always system/admin), `better-auth`.

## Jobs, workers, realtime

Queues (pg-boss, in `pgboss.*` schema):

| Queue | Handler | Retry | Idempotency |
|---|---|---|---|
| `source.parse` | OCR → `source_pages` + `canonical_markdown` | 3x expo | `source.parse:${id}` |
| `source.extract` | LLM → recommendations rows | 3x | `source.extract:${id}` |
| `source.embed` | Embedding → fill `.embedding` in batches | 3x | `source.embed:${id}:${model}` |
| `bulk-upload.process` | Fan out per-file parses; track `bulk_upload_jobs` | 1x, resumable | `bulk:${jobId}` |
| `reindex.embeddings` | Walk rows where `embedding_model != current` | 1x, resumable | `reindex:${model}` |

Pipeline for a single upload: `parse → extract → embed → status=ready`. Each stage is independently retryable.

**Progress to browser:** worker calls `pg_notify('job_progress', ...)`; Next.js `/api/jobs/:id/stream` opens an SSE response backed by a dedicated pg client running `LISTEN job_progress`; browser uses `EventSource` via a `useJobProgress(id)` hook.

**Failure handling:** terminal failures write `sources.status = failed` and a `job_results` row with stage + error. UI offers "retry from failed stage".

## Search

Three surfaces on the same primitives:

1. **Recommendation search** — hybrid tsvector + pgvector, fused via **Reciprocal Rank Fusion** (`k=60`) in SQL.
2. **Keyword search** — same target, keyword-only branch (skip vector + embedding call).
3. **Chat search / RAG** — hybrid over `source_pages`, top-K into LLM prompt, streamed response with `[[source:slug#page:N]]` citation markers that become interactive `<Citation>` components.

Query embedding is cached for 60s per exact-match text. If the embedding provider is disabled, queries degrade gracefully to keyword-only.

Filters (source, thematic area, status, date) compose as SQL `WHERE` clauses via Drizzle.

## UI / app layer

Next.js 15 App Router, TypeScript, Tailwind. Dark mode first-class.

Routes grouped by segment:
- `(marketing)/` — hosted-only landing + about
- `(app)/` — dashboard, sources, recommendations, search, chat-search, analytics, admin (admin hidden in local mode)
- `(auth)/` — hosted-only login/signup/reset/profile

Key components (ported or rebuilt):
- `DecisionFlow` — guided landing entry, click-through, framer-motion animated
- `RecommendationsTable` — **TanStack Table** with inline-editable cells (no AG Grid)
- `RecommendationNetworkViz` — force-directed canvas graph driven by similarity edges
- `SimilarRecommendations` — per-rec sidebar, top-5 by cosine distance
- `ProgressUpdateForm` / `ProgressUpdatesList` — stakeholder time-series on rec implementation
- `ChatInterface` with interactive `<Citation>` chips
- Source viewer split-pane: markdown + original PDF side-by-side (pdf.js), synced scroll

Libs kept from v1: TanStack Query, Zustand, react-hook-form + Zod, react-select, framer-motion, Chart.js, react-hot-toast, react-markdown + gfm + sanitize.

Mode-awareness: `<FeatureGate>` wrappers hide auth/ownership/admin UI in local mode; they render `null` rather than being absent from the tree.

## Testing & verification

| Layer | Tool | Scope |
|---|---|---|
| Types | `tsc` strict | compile-time |
| Runtime | Zod | every API boundary, forms |
| Unit/integration | Vitest + Testcontainers (real Postgres) | repos, services, providers |
| E2E | Playwright against composed stack | golden paths, both modes |

Fakes only for vendor APIs (LLM/OCR) — real Postgres/pg-boss always. Nightly CI job exercises real Mistral/Anthropic paths.

**Verify command:** `pnpm verify` = typecheck + lint + test + build. Claude runs this before claiming a task done (wired into CLAUDE.md).

## Repository layout

See `/src` tree in design — key points:
- `src/lib/providers/` — the five abstractions
- `src/lib/repositories/` — data access, context-aware authorization
- `src/lib/services/` — business logic (parse, extract, embed, search)
- `src/lib/jobs/` — pg-boss handlers
- `src/worker.ts` — worker entrypoint (shares the image with `app`)
- `docker-compose.yml` + three override files (minio, ollama, docling)
- `fixtures/` — canonical PDFs with expected markdown + recs for deterministic tests

## Deployment shapes

| Shape | Command | Use |
|---|---|---|
| Mac mini local (Ollama native + Docling) | `docker compose -f docker-compose.yml -f docker-compose.docling.yml up` | default single-user |
| Mac mini local (cloud providers) | `docker compose up` with cloud env vars | fastest to spin up |
| Linux one-command local | `docker compose -f .yml -f .ollama.yml -f .docling.yml up` | GPU box |
| Hosted multi-user | base + `docker-compose.minio.yml`, `APP_MODE=hosted` | team deployment |

## Open questions (tracked, not blocking)

- Whether to offer a v1-Supabase export importer for users with existing data.
- Whether sub-page chunking improves retrieval quality enough to justify the complexity.
- Whether to ship a cross-encoder reranker as optional (`RERANK_PROVIDER`) once core works.
- Final choice of default local LLM (Llama 3.1 8B vs Qwen vs Mistral) — decide via fixture benchmarking.

## Next step

Invoke the `writing-plans` skill to produce a phased implementation plan with concrete milestones, tracked in `PLAN.md`.
