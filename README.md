# open-recs-local

A local-first, open-source rebuild of [Open Recommendations](https://github.com/dataforaction-tom/open-recommendations) — a tool for tracking and making sense of the recommendations inside inquiry reports, reviews, and evaluations.

Runs on a Mac mini with no cloud dependencies, or as a multi-user hosted instance. Same codebase, same database schema, one env var to choose.

## What it does

- **Ingest reports.** Drop in a PDF. It's OCR'd, turned into canonical markdown, and per-page content is embedded for search.
- **Extract recommendations.** An LLM pulls out each recommendation as its own record with a page anchor back to the source.
- **Track progress.** Stakeholders add updates against each recommendation — notes, evidence links, progress ratings — building a time series of implementation over time.
- **Search three ways.** Hybrid keyword + vector over recommendations, the same across source pages, and a chat interface that answers questions with inline citations back to the report.
- **Visualise.** Recommendation networks by similarity, thematic taxonomies, progress dashboards.

Designed for charities, non-profits, regulators, and anyone else who ends up reading a lot of reports and wants to actually do something with them.

## Two modes, one codebase

| Mode | `APP_MODE` | Who it's for |
|---|---|---|
| **Local** | `local` | One person or one team, running on their own hardware. No sign-in. Everything is theirs. |
| **Hosted** | `hosted` | Multi-user deployment with Better-auth, ownership requests, admin surfaces, and visibility controls. |

The repository layer honours a `RepoContext` (who you are, what you can do) rather than relying on database row-level security — so the same business logic works in both modes without duplication.

## Providers are swappable

Everything cross-cutting — LLM, embedding, OCR, object storage, auth — goes through a provider interface selected via env var. Swap Ollama for Anthropic, Docling for Mistral OCR, or local filesystem for S3 without changing app code.

Supported (or planned) providers:

| Layer | Options |
|---|---|
| LLM | `openai-compatible` (Ollama, LM Studio, vLLM, OpenAI), `anthropic`, `mistral`, `fake` |
| Embedding | `openai-compatible`, `voyage`, `fake` |
| OCR | `mistral`, `docling`, `firecrawl`, `tesseract-pdf`, `fake` |
| Storage | `fs`, `s3`, `fake` |
| Auth | `local` (system user), `better-auth` |

## Tech stack

Next.js 16 (App Router) · TypeScript (strict) · Drizzle ORM · Postgres 16 + pgvector + tsvector · Zod at every boundary · pg-boss for jobs · SSE over Postgres `LISTEN/NOTIFY` · Tailwind v4 · Vitest + Testcontainers (real Postgres, no mocks).

## Quick start

### Run the stack

```bash
cp .env.example .env
docker compose up -d
```

Postgres + app + worker come up. App serves on http://localhost:3000.

### Develop

```bash
pnpm install
pnpm dev          # Next.js dev server
pnpm verify       # typecheck + lint + test + build (run before you claim done)
```

### Database

```bash
pnpm db:generate  # regenerate migration SQL from schema changes
pnpm db:migrate   # apply migrations
pnpm db:seed      # insert taxonomy defaults (idempotent)
```

### Hosted mode

For a multi-user deployment, set:

```bash
APP_MODE=hosted
BETTER_AUTH_SECRET=<32+ random chars>      # rotate to invalidate all sessions
BETTER_AUTH_URL=https://your.app.example   # used in email links
FILE_TOKEN_SECRET=<32+ random chars>
```

The first user to sign up becomes the admin (one-shot bootstrap). Subsequent
signups are `viewer` by default — admins can promote at `/admin`.

For real email delivery (production deployments), also set:

```bash
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_…
RESEND_FROM=noreply@your.domain
```

Without those, password-reset and magic-link URLs go to stdout — fine for
evaluation, not for a live deployment.

The first user to sign up becomes the admin (one-shot bootstrap). Subsequent
signups are `viewer` by default — admins can promote at `/admin`.

For a step-by-step walkthrough including Ollama / Docling setup on Mac mini
and Linux, see [`docs/running-locally.md`](docs/running-locally.md).

### Local LLM setup (Ollama)

For local-mode pipeline extraction, create a derived Ollama model with a
larger context window than the stock `llama3.1:8b`:

```bash
ollama pull llama3.1:8b
ollama create llama3.1-extract -f - <<'EOF'
FROM llama3.1:8b
PARAMETER num_ctx 12288
EOF
```

Then point the app at it in `.env`:

```bash
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=llama3.1-extract
```

For chat-search, any streaming model works — a lighter model keeps latency
down on the Mac mini:

```bash
ollama pull qwen2.5:0.5b
CHAT_MODEL=qwen2.5:0.5b
```

`CHAT_MODEL` overrides `LLM_MODEL` for the streaming chat path only; the
extract pipeline keeps using `llama3.1-extract`. See
[`docs/running-locally.md`](docs/running-locally.md) for the full setup
walkthrough (Docker, Docling, env vars, hosted mode).

## Screenshots

| Dashboard | Source viewer | Recommendations |
|---|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Source viewer](docs/screenshots/source-viewer.png) | ![Recommendations](docs/screenshots/recommendations.png) |

(If these don't render, the project is mid-screenshot-capture before the 1.0 cut — paths are reserved.)

## Project status

Approaching 1.0. Every phase of the master plan has shipped through analytics; Phase 10 is the final polish + release cycle.

- **Phases 0–1** — Next.js + Tailwind + Vitest + env schema + CI + Docker; Drizzle schema + migrations + provider fakes + repository layer + seed.
- **Phases 2–3** — pg-boss queues + worker sidecar + parse/extract/embed pipeline; real LLM/OCR/embedding adapters; hybrid + keyword + chat search.
- **Phases 4–6** — app shell, dark mode, mode-aware feature gates; split-pane source viewer with signed URLs; recommendations index + detail with inline status edit.
- **Phase 7** — progress updates: form, list, status transitions, EditableSelectCell.
- **Phase 8** — hosted mode: Better-auth (email+password + magic link), ownership requests, admin dashboard, first-signup-becomes-admin.
- **Phase 9** — analytics: Chart.js dashboards at `/analytics` and `/sources/[slug]/analytics`, nightly `analytics.refresh` cron, on-demand miss-backfill.
- **Phase 10** — polish + docs + 1.0 release (in progress).

See [`docs/plans/2026-04-19-open-recs-local-design.md`](docs/plans/2026-04-19-open-recs-local-design.md) for the full design, [`PLAN.md`](PLAN.md) for the phase roadmap, and [`docs/running-locally.md`](docs/running-locally.md) for the step-by-step setup guide.

## Documentation

- **Design doc:** [`docs/plans/2026-04-19-open-recs-local-design.md`](docs/plans/2026-04-19-open-recs-local-design.md)
- **User guide:** [`docs/user-guide.md`](docs/user-guide.md)
- **Changelog:** [`docs/changelog.md`](docs/changelog.md)

## Licence

MIT. See [`LICENSE`](LICENSE).
