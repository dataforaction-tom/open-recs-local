# Plan

> Last updated: 2026-04-19
> Status: In progress — Phase 0 (Foundation)

## Objective

Rebuild Open Recommendations as a local-first, open-source app that runs on a Mac mini with optional cloud providers, and can also be deployed as a multi-user hosted instance with the same codebase. Full parity with v1 (upstream: https://github.com/dataforaction-tom/open-recommendations).

## Approach

Next.js 15 + TypeScript monolith with a worker sidecar. Postgres (pgvector + tsvector) as the single data/queue/search substrate via pg-boss. All cross-cutting concerns (LLM, embedding, OCR, storage, auth) are pluggable provider interfaces driven by env vars. One mode switch (`APP_MODE=local|hosted`) toggles auth + ownership + admin features with zero business-logic branching.

**Canonical documents:**
- Design: `docs/plans/2026-04-19-open-recs-local-design.md`
- Implementation plan: `docs/plans/2026-04-19-open-recs-local-plan.md`

## Current phase

**Phase 0 — Foundation.** Start at Task 0.1 in the plan doc. Exit criteria: `docker compose up` runs empty Next.js + Postgres; CI green.

## Tasks (phase-level)

- [~] **CURRENT** Phase 0 — Foundation (8 tasks)
- [ ] Phase 1 — Schema + provider skeleton (9 tasks)
- [ ] Phase 2 — Core pipeline (upload → parse → extract → embed)
- [ ] Phase 3 — Search surfaces (keyword, hybrid, chat)
- [ ] Phase 4 — UI shell (nav, DecisionFlow, dark mode, feature gates)
- [ ] Phase 5 — Source viewer (split-pane markdown + PDF)
- [ ] Phase 6 — Recommendations UI (TanStack Table, NetworkViz, SimilarRecs)
- [ ] Phase 7 — Progress updates (form, list, status transitions)
- [ ] Phase 8 — Hosted-mode (Better-auth, ownership, admin)
- [ ] Phase 9 — Analytics (Chart.js, cache, scheduled refresh)
- [ ] Phase 10 — Polish + docs + 1.0 release

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

## Open Questions

- [ ] Whether to offer a v1-Supabase export importer for users with existing data (non-blocking; decide in Phase 10).
- [ ] Whether sub-page chunking improves retrieval quality enough to justify the complexity (decide after Phase 3 via fixture benchmarks).
- [ ] Final choice of default local LLM model — Llama 3.1 8B vs Qwen vs Mistral (decide at start of Phase 2).

## Out of Scope

- Automated data migration from the v1 Supabase deployment.
- AG Grid Enterprise feature parity.
- Kubernetes, multi-region, horizontal autoscaling.
- Turbopack (revisit after 1.0).
