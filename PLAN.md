# Plan

> Last updated: 2026-05-25
> Status: Phase 10 — polish + 1.0 release (pipeline perf + UI enhancements underway)

## Objective

Rebuild Open Recommendations as a local-first, open-source app that runs on a Mac mini with optional cloud providers, and can also be deployed as a multi-user hosted instance with the same codebase. Full parity with v1 (upstream: https://github.com/dataforaction-tom/open-recommendations).

## Approach

Next.js 15 + TypeScript monolith with a worker sidecar. Postgres (pgvector + tsvector) as the single data/queue/search substrate via pg-boss. All cross-cutting concerns (LLM, embedding, OCR, storage, auth) are pluggable provider interfaces driven by env vars. One mode switch (`APP_MODE=local|hosted`) toggles auth + ownership + admin features with zero business-logic branching.

**Canonical documents:**
- Design: `docs/plans/2026-04-19-open-recs-local-design.md`
- Implementation plan: `docs/plans/2026-04-19-open-recs-local-plan.md`

## Current phase

**Phase 10 — Polish + 1.0 release.** Pipeline performance + UI enhancements per `docs/plans/2025-05-25-pipeline-ui-improvements-plan.md`. 

Current work:
- **Phase 10a** ✓ complete: Pipeline perf — batch taxonomy ✓, parallel LLM ✓, batch embed ✓ (bulk `UPDATE ... FROM (VALUES)`)
- **Phase 10b** (next): UI enhancements — source list, filters, tags, metadata
- **Phase 10c**: tsvector column migration
- **Phase 10d**: Playwright E2E + CI + 1.0 tag

## Tasks (phase-level)

- [x] Phase 0 — Foundation (merged as PR #1)
- [x] Phase 1 — Schema + provider skeleton (merged as PR #2)
- [x] Docs — README + mkdocs site (merged as PR #3)
- [x] Phase 2 — Core pipeline (merged as PR #4)
- [x] Phase 3 — Search surfaces (merged as PR #5)
- [x] Phase 4 — UI shell (merged as PR #7)
- [x] Phase 5 — Source viewer (merged as PR #8)
- [x] Phase 6 — Recommendations UI (merged as PR #9)
- [x] Phase 7 — Progress updates (form, list, status transitions, EditableSelectCell)
- [x] Phase 8 — Hosted-mode (Better-auth, ownership, admin)
- [x] Phase 9 — Analytics (Chart.js, cache, scheduled refresh)
- [~] **CURRENT** Phase 10 — Pipeline perf + UI enhancements (see `docs/plans/2025-05-25-pipeline-ui-improvements-plan.md`)

Before each phase after 0/1, re-enter `superpowers:writing-plans` with the design + phase exit criteria to decompose into TDD-sized tasks.

## Decisions Made

| Decision | Rationale | Date |
|----------|-----------|------|
| Full-parity rebuild with dual-mode (local no-auth / hosted with-auth) | Ships as an OSS tool anyone can self-host without forcing multi-user auth | 2026-04-19 |
| Plain Postgres + pgvector + tsvector; no Supabase | One stack for both modes, lighter on Mac mini, cleaner auth decoupling | 2026-04-19 |
| Better-auth for hosted mode; no-auth context in local mode | Pluggable auth via one `AuthContext` interface | 2026-04-19 |
| Provider abstraction for LLM / Embedding / OCR / Storage / Auth | Env-var driven; swap Ollama for Anthropic or Docling for Mistral OCR without code changes | 2026-04-19 |
| pg-boss for jobs (not Redis/BullMQ) | Zero new infra; Postgres already there | 2026-04-19 |
| SSE via Postgres LISTEN/NOTIFY for progress updates | No websockets or polling | 2026-04-19 |
| Canonical markdown + pages JSON as storage format | One shape downstream of any OCR provider; preserves tables, images, page anchors | 2026-04-19 |
| TypeScript + Drizzle + Zod | Schema as source of truth; runtime validation at boundaries | 2026-04-19 |
| TanStack Table, not AG Grid | Lighter, fully OSS; already the direction v1 was moving | 2026-04-19 |
| No RLS — authorization in a repository layer | Required for the mode switch to be portable and testable | 2026-04-19 |
| MIT license | Friendlier for adoption than AGPL | 2026-04-19 |
| Phase 10 pipeline perf + UI plan | Created `docs/plans/2025-05-25-pipeline-ui-improvements-plan.md` covering N+1 taxonomy, parallel LLM, batch embed, source list metadata, filter expansion, tag labels. | 2026-05-25 |

## Open Questions

- [ ] Whether to offer a v1-Supabase export importer for users with existing data (non-blocking; decide in Phase 10).
- [ ] Whether sub-page chunking improves retrieval quality enough to justify the complexity (decide after Phase 3 via fixture benchmarks — still open, defer to Phase 6 once UI exposes hit quality).
- [ ] Whether to add a generated `tsv` column on `source_pages` to put chat-search retrieval back on the GIN index path (decide if Phase 4+ surfaces latency).
- [ ] Whether to retire `/api/recommendations` immediately or in Phase 6 with the table UI (currently scheduled for Phase 6).
- [x] ~~Final choice of default local LLM model — Llama 3.1 8B vs Qwen vs Mistral~~ — resolved at start of Phase 2: defaults are `llama3.1:8b` for chat and `nomic-embed-text` for embeddings (both env-overridable).

## Out of Scope

- Automated data migration from the v1 Supabase deployment.
- AG Grid Enterprise feature parity.
- Kubernetes, multi-region, horizontal autoscaling.
- Turbopack (revisit after 1.0).
