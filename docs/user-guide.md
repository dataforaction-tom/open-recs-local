# User Guide

This guide covers everything you need to know about installing and using open-recs-local.

> **A note on status.** The project is under active development. This guide covers the parts that are built today. Sections for features still in development will appear as they land.

## Installing

### Requirements

- **Docker Desktop** (Windows, Mac) or Docker Engine (Linux). The full stack runs in containers.
- Roughly 2 GB of disk space for the database and container images.
- If you plan to use cloud AI providers (Anthropic, OpenAI, Mistral), an API key for at least one of them.

### Run the full stack

1. Clone the repository and change into it.
2. Copy the example environment file and open it in your editor:
   ```
   cp .env.example .env
   ```
3. Choose which mode you want to run in by setting `APP_MODE`:
   - `APP_MODE=local` — single user, no sign-in. This is the default.
   - `APP_MODE=hosted` — multi-user with sign-in (requires a Better-auth secret).
4. Start the stack:
   ```
   docker compose up -d
   ```
5. The app becomes available at http://localhost:3000 once the containers report healthy.

### Bringing it down

```
docker compose down
```

Your uploads and database state persist across restarts. To wipe everything and start fresh, add `-v` to remove the volumes:

```
docker compose down -v
```

## Configuring

All configuration is done through the `.env` file. The most important options:

### Mode

| Setting | Values | What it does |
|---|---|---|
| `APP_MODE` | `local`, `hosted` | Controls sign-in, ownership flows, and admin screens. |

### AI providers

The app uses three kinds of AI: an LLM (for extracting recommendations and answering questions), an embedding model (for semantic search), and an OCR engine (for turning PDFs into text).

| Setting | Values | Notes |
|---|---|---|
| `LLM_PROVIDER` | `openai-compatible`, `anthropic`, `mistral`, `fake` | Use `openai-compatible` with a local Ollama or LM Studio setup. `fake` is for testing only. |
| `EMBEDDING_PROVIDER` | `openai-compatible`, `voyage`, `fake` | |
| `OCR_PROVIDER` | `mistral`, `docling`, `firecrawl`, `tesseract-pdf`, `fake` | `docling` runs locally via a side-car container. |

Each provider has its own set of keys, model names, and base URLs — see `.env.example` for the complete list.

### Storage

By default, uploaded files are stored in a Docker volume on your machine. If you'd rather use object storage (for backups, or to share a hosted instance across multiple app containers), set `STORAGE_PROVIDER=s3` and supply the S3 credentials.

### Database

The default compose setup brings up its own Postgres instance with pgvector enabled. The `DATABASE_URL` in `.env.example` points at that service. If you want to use an external Postgres, point `DATABASE_URL` at it instead — but make sure the `vector` extension is installed.

## Using the app

> The user-facing features listed here are **planned**. They are not all built yet. Check the [changelog](changelog.md) for what's currently available.

### Uploading a report

A single report, or a batch. The app will:

1. Turn the PDF into clean, searchable markdown.
2. Pull out each recommendation as its own record, anchored to the page it came from.
3. Index everything so you can search it.

Progress is shown in the UI — long-running jobs don't block you.

### Searching

Three surfaces, all built on the same index:

- **Recommendation search** — the main one. Combines keyword and semantic search, ranks the combined results, lets you filter by source, theme, status, or date.
- **Keyword search** — same target, but skips the AI embedding call. Useful when your queries are exact and you want determinism.
- **Chat search** — ask a question in plain English. The answer comes back with inline citations you can click through to the original pages.

### Tracking progress on a recommendation

Each recommendation has a progress log. Authorised users can add:

- A written note of what's been done.
- A link to evidence (a document, a webpage, an internal note).
- A progress rating — no progress, some progress, significant, or fully implemented.

Over time this builds up a time series showing implementation trajectory.

### Managing sources

Reports can be public or private. Private reports are only visible to their owner (in hosted mode) or the system user (in local mode). Public reports are visible to everyone with access to the instance.

In hosted mode, other users can request ownership of a report if they'd like to add progress updates; owners or admins can approve or decline.

### Visualisations

- **Network view** — recommendations placed on a force-directed graph by similarity, so you can see clusters and connections across reports.
- **Thematic dashboard** — progress broken down by theme (governance, operations, finance, safeguarding, engagement, and anything else you add).

## For developers

If you want to work on the code or run parts of it outside Docker:

### One-off setup

```
pnpm install
```

### Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Next.js dev server on port 3000. |
| `pnpm verify` | Typecheck, lint, test, and build. Run this before declaring a piece of work done. |
| `pnpm test` | Just the tests (Vitest, includes real-Postgres tests via Testcontainers — Docker must be running). |
| `pnpm db:generate` | Regenerate migration SQL after changing the Drizzle schema. |
| `pnpm db:migrate` | Apply outstanding migrations to the database at `DATABASE_URL`. |
| `pnpm db:seed` | Insert or refresh the default taxonomy tables (thematic areas, evidence types, progress ratings). Idempotent. |

### Architecture notes

- Everything cross-cutting (LLM, embedding, OCR, storage, auth) goes through a provider interface in `src/lib/providers/<kind>/`. A factory in `src/lib/providers/index.ts` selects the implementation based on env vars.
- The Drizzle schema in `src/lib/db/schema.ts` is the source of truth for the database shape. Migrations are generated, not hand-written — with one exception: the initial `CREATE EXTENSION vector` lives in `0000_enable_extensions.sql`.
- Authorisation is enforced in the repository layer (`src/lib/repositories/`) through a `RepoContext` that carries the current user and roles. No Postgres RLS.
- Data-touching tests run against a real pgvector container started through Testcontainers. There are no mocks of the database.

### Contributing

- Work on a feature branch off `master`. Squash-merge when the phase completes.
- Run `pnpm verify` before opening a PR.
- Commits follow `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `build:`, `ci:` prefixes.

## Getting help

- **Issues and feature requests:** https://github.com/dataforaction-tom/open-recs-local/issues
- **Email:** tom@good-ship.co.uk
