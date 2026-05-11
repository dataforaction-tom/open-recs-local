# Changelog

All notable changes to open-recs-local will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

Nothing yet — Phase 8 (hosted-mode auth) is up next.

## 2026-05-11 — Phase 7: Progress updates

### Added

- **Progress updates on a recommendation.** The Progress tab on `/recommendations/<id>` is now interactive — post a notes-and-evidence update with optional taxonomy slugs (evidence type, progress rating). Updates render in a time-ordered list above the form.
- **Status transitions.** Each rec now has a current status (`open`, `in_progress`, `done`, `blocked`, `withdrawn`). Change it from the Progress tab via an inline select; transitions append to a history table so we keep a full timeline.
- **Inline status editing on the recommendations table.** A new Status column on `/recommendations` shows the current status as a badge; click to change it inline. Optimistic update; rolls back if the write fails.

### Notes

- Edit/delete of existing progress updates is intentionally deferred to Phase 8, where Better-auth provides per-user roles. The local-mode workaround is to post a corrective second update.
- File uploads for the evidence reference are deferred to Phase 10 polish; the field accepts a free-text URL or storage path for now.

## 2026-05-10 — Phase 6: Recommendations UI

### Added

- **Recommendations index.** `/recommendations` lists every recommendation across every source in a sortable table. Type to filter by hybrid or keyword search; the URL keeps the filter state so links are shareable and the back button works.
- **Recommendation detail.** `/recommendations/<id>` opens a single rec with three tabs: Overview, Similar (top-5 most-related recs by embedding distance), and Progress (placeholder until Phase 7).
- **Mode toggle.** A button in the index switches between hybrid (RRF) and keyword search without leaving the page.

### Notes

- The "current status" column on the table and inline status editing are intentionally deferred to Phase 7, where the progress-update writes naturally fit.
- The Network graph view from the design is deferred to Phase 9, alongside the analytics canvas tooling.

## 2026-05-10 — Phase 5: Source viewer

### Added

- **Source detail page.** Visit `/sources/<slug>` to read a processed source's canonical markdown side-by-side with the original PDF. The split is resizable and remembers your preferred ratio.
- **Signed file URLs.** Files now flow through `/api/files/<token>`, an HMAC-signed short-lived URL route. Storage paths never appear in the page; tokens last five minutes by default.
- **Image rendering inside markdown.** Markdown image refs that point at storage keys get rewritten to signed URLs at render time so attachments and page images load correctly.
- **PDF viewer.** Powered by react-pdf with the pdfjs worker bundled at build time. Page navigation chrome lets you step through; the active page is plumbed for scroll synchronisation in upcoming polish.

### Notes

- Live scroll sync between the markdown and PDF panes uses a debounced state hook but the per-pane IntersectionObserver wiring follows in Phase 6.
- Mobile (narrow-screen) layout still presents the desktop split-pane; a stacked layout for narrow widths is Phase 10 polish.

## 2026-05-10 — Phase 4: App shell

### Added

- **App shell.** A real app shell now wraps every authenticated page: top navigation, dark mode (with no flash on load), a footer, and three route groups — `(app)` for the application, `(marketing)` for the public landing, `(auth)` reserved for sign-in flows.
- **First-launch flow.** A three-step DecisionFlow card greets new users on the dashboard and remembers when you've dismissed it.
- **Dashboard.** A stub dashboard surfaces recent processing jobs and recently-uploaded sources side-by-side. Real source listing and the recommendations table land in Phase 5/6.
- **Mode-aware UI.** A `<FeatureGate>` wrapper hides hosted-only features (auth, ownership, admin) when the app is running in local mode — the same code, two surfaces.
- **shadcn/ui primitives.** Buttons and cards are now driven by shadcn so future components have a consistent look and dark-mode contract for free.

### Notes

- The visible app today is shell only — page content for sources, search, and chat lands in Phases 5 and 6.

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
