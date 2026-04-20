# Changelog

All notable changes to open-recs-local will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

Nothing yet — Phase 2 work is being planned.

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
