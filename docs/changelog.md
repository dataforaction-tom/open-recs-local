# Changelog

All notable changes to open-recs-local will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

Nothing yet — Phase 4 (UI shell) is being planned.

## 2026-05-10 — Phase 3: Search surfaces

### Added

- **Hybrid search.** `GET /api/search?q=…` ranks recommendations by fusing keyword (Postgres tsvector) and vector (pgvector cosine) candidates with Reciprocal Rank Fusion (k=60). Filters: `source` (uuid), `theme` (uuid), `limit` (1–100).
- **Keyword-only search.** `GET /api/keyword-search?q=…` runs the keyword branch alone — same shape, `rrfScore` and `vectorRank` are `null`. This is also the graceful-degrade path for embedding-disabled deployments.
- **Chat search.** `POST /api/chat-search` retrieves the top eight source pages by hybrid RRF, feeds them to the configured streaming LLM via the AI SDK, and streams back a response laced with `[[source:<slug>#page:<n>]]` citation markers. The retrieved page set is also exposed via `x-citations-count` and `x-retrieved` response headers.
- **Query embedding cache.** A 60-second / 256-entry in-process LRU keyed by `(model, query)` so repeat queries within a minute don't re-call the embedding provider.
- **Citation marker grammar.** `extractCitations` and `validateCitations` parse the marker grammar (`[a-z0-9](-[a-z0-9])*` slug, 1-based page number) and partition into valid / invalid against a known-source map.

### Notes

- `/api/recommendations` (Phase 2) is intentionally left as the v1 keyword endpoint. It will be retired in Phase 6 alongside the recommendations table UI.
- `recommendations.status` filtering is deferred to Phase 6 — it lives on a history table and needs a latest-per-rec lookup.
- No rate limiting is configured on the new endpoints. Add before hosted mode (Phase 8); chat-search is the costliest request in the codebase.

## 2026-04-20 — Phase 2: Core pipeline

### Added

- **Job queues + worker.** pg-boss now runs in its own `pgboss` Postgres schema. A dedicated worker process registers handlers for the three pipeline stages (`source.parse`, `source.extract`, `source.embed`).
- **Upload endpoint.** `POST /api/sources` accepts a PDF, stores the original via the storage provider, and enqueues `source.parse`.
- **Pipeline handlers.** OCR via the OCR provider populates `source_pages` + canonical markdown; the LLM provider extracts structured recommendations against a Zod schema; embeddings are batched into vector columns. Sources transition `pending → parsing → extracting → embedding → ready`.
- **Real OCR adapters.** Docling (sidecar via `docker-compose.docling.yml`) and Mistral OCR (cloud, behind `OCR_PROVIDER=mistral`).
- **OpenAI-compatible LLM and embedding adapters.** Any local server (Ollama, LM Studio, vLLM) or cloud (OpenAI, Together, Groq) that speaks `/v1/chat/completions` + `/v1/embeddings` works via env: `LLM_BASE_URL`, `LLM_MODEL`, `EMBEDDING_BASE_URL`, `EMBEDDING_MODEL`.
- **Model discovery.** `GET /api/providers/llm/models` queries the configured endpoint's `/v1/models` so the UI can list what's actually installed.
- **Progress streaming.** `GET /api/jobs/:id/stream` emits Server-Sent Events backed by Postgres `LISTEN/NOTIFY` — no polling, no websockets.
- **Keyword recommendation search.** `GET /api/recommendations?q=…` returns matching recs with a tsvector-ranked snippet.
- **Fixture corpus.** Two synthetic PDFs (`sample-report.pdf`, `sample-policy.pdf`) plus their canonical markdown and expected recommendations now live under `fixtures/sources/` for tests and local smoke runs.

### Changed

- **`tsx` is now a runtime dependency.** Required so the worker image and `docker compose exec app pnpm db:migrate` both work in the production container.

## 2026-04-20 — Phase 1: Schema and providers

### Added

- **Database schema.** All 13 tables from the design are now in the database: sources, source files, source pages, recommendations, recommendation statuses, progress updates, thematic areas (with a many-to-many link to recommendations), evidence types, progress ratings, ownership requests, job results, and analytics cache.
- **Migrations.** Four migrations now land cleanly against an empty pgvector-enabled Postgres. A new `pnpm db:migrate` command applies them.
- **Provider abstractions.** The five cross-cutting services — language model, embedding model, OCR, storage, and authentication — each have a clean interface and a "fake" implementation for testing and local development. Real providers (Anthropic, OpenAI, Mistral, Ollama, Docling, S3, Better-auth) will slot into the same shape in later phases.
- **Provider factory.** A single call reads your `.env` and hands back a set of providers to use throughout the app. Choosing a provider that isn't wired up yet gives you a clear error, not a silent failure.
- **Taxonomy seed.** `pnpm db:seed` inserts or refreshes the default thematic areas, evidence types, and progress ratings. Safe to run repeatedly.
- **Source repository.** The first data-access layer, enforcing visibility rules (public sources visible to everyone, private sources only visible to their owner or a system user) in code rather than via database row-level security.
- **Realistic testing.** 45 tests now run in 13 files, including integration tests against a real pgvector Postgres container (via Testcontainers). No database mocks — every data-touching test exercises the real schema.

### Changed

- **Environment configuration.** The `.env` schema now understands provider selectors (`LLM_PROVIDER`, `EMBEDDING_PROVIDER`, `OCR_PROVIDER`, `STORAGE_PROVIDER`), all defaulting to `fake` so the app starts up without any API keys.

## 2026-04-19 — Phase 0: Foundation

### Added

- **The app itself.** Next.js 16 with strict TypeScript, Tailwind v4, ESLint v9, and the App Router scaffolding.
- **A verification loop.** `pnpm verify` runs type checking, linting, tests, and a production build in one command. Contributors and automation are expected to run this before declaring work done.
- **Continuous integration.** A GitHub Actions workflow runs `pnpm verify` on every push and every pull request to `master`.
- **Containerised local stack.** A multi-stage Dockerfile builds separate app and worker runtime images. A docker-compose file brings up Postgres (with pgvector), the app, and a worker — ready for development with a single `docker compose up`.
- **Environment validation.** A Zod-validated schema for environment variables, with a clean split between local and hosted mode requirements. Bad configuration fails fast with a readable error.

### Notes

This release has no user-facing features yet. It's the foundation the rest of the project will build on.
