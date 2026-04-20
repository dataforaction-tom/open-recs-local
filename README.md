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

## Project status

Early days. The foundation is in place, the user-facing features are not yet.

- **Phase 0** — Next.js + Tailwind + Vitest + env schema + CI + Docker — done
- **Phase 1** — Drizzle schema + migrations + provider fakes + repository layer + seed — done
- **Phase 2+** — real providers, parse/extract/embed pipeline, search, UI — in progress

See [`docs/plans/2026-04-19-open-recs-local-design.md`](docs/plans/2026-04-19-open-recs-local-design.md) for the full design and [`PLAN.md`](PLAN.md) for the phase roadmap.

## Documentation

- **Design doc:** [`docs/plans/2026-04-19-open-recs-local-design.md`](docs/plans/2026-04-19-open-recs-local-design.md)
- **User guide:** [`docs/user-guide.md`](docs/user-guide.md)
- **Changelog:** [`docs/changelog.md`](docs/changelog.md)

## Licence

MIT. See [`LICENSE`](LICENSE).
