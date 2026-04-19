# Project: open-recs-local

A local first rebuild of Open Recommendations

## Architecture

Authoritative design: `docs/plans/2026-04-19-open-recs-local-design.md`.
Implementation plan: `docs/plans/2026-04-19-open-recs-local-plan.md`.

- `src/app/` — Next.js App Router (routes, layouts, server components)
- `src/lib/` — shared code. Subfolders track the layers from the design: `db/`, `providers/<kind>/`, `repositories/`, `services/`, `jobs/`
- `tests/` — cross-cutting tests (smoke, e2e); unit tests live next to source as `*.test.ts`
- `docker/` — Dockerfile and compose overrides
- `public/` — static assets

Everything cross-cutting (LLM, embedding, OCR, storage, auth) goes through a provider interface in `src/lib/providers/<kind>/`. The factory is driven by `APP_MODE` and `*_PROVIDER` env vars.

## Commands

- `pnpm dev` — Next.js dev server
- `pnpm verify` — typecheck + lint + vitest + build (run before claiming a task done)
- `pnpm test` / `pnpm test:watch` — vitest
- `docker compose up` — full local stack (Postgres + app + worker)

## Standards

- TypeScript strict mode with `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes` all on.
- Every data-touching test uses Testcontainers (pgvector/pgvector:pg16). No SQLite stand-ins. No mocks of the database.
- Providers always ship with a fake implementation in the same folder (`fake.ts`). Real adapters land alongside.
- No Postgres RLS — authorization goes through the repository layer using `RepoContext`. The mode switch depends on this.
- Zod validates at every boundary (env, API routes, LLM structured output). Drizzle schema is the source of truth for the DB shape.
- Commits follow `feat:` / `fix:` / `chore:` / `docs:` / `test:` / `build:` / `ci:` prefixes.
- Work on feature branches off `master`; squash-merge at end of each phase.

## Verification

Run `pnpm verify` before claiming a task done. For anything touching Postgres, ensure the relevant Testcontainers-backed integration test exists and passes. For Docker / compose changes, verify `docker compose up -d` brings all services healthy and `curl -f http://localhost:3000` returns 200.

## Working Rules

- Always check for existing patterns before creating new ones
- Prefer small, incremental changes over big rewrites
- If a task will take more than ~50 lines of changes, use plan mode first
- Don't add dependencies without asking
- Don't refactor code that wasn't part of the task
- Don't create files without explaining what and why

## State & Progress

> Updated: 2026-04-19
> Current focus: [what we're working on]
> Status: [where things stand]

See PLAN.md for task tracking, STATE.md for system state, HANDOFF.md for session notes.

## Known Issues

- **Docker Desktop must be started manually** on this Windows dev box before any `docker` / `docker compose` command. The daemon isn't auto-started; commands fail with `error during connect ... docker_engine: The system cannot find the file specified` until it's running. If you see that error, stop and ask the user to launch Docker Desktop.
- **Vitest is pinned to `^3.1.x`** (not 4.x). Vitest 4 ships a pre-release `rolldown` whose Windows native binding fails under pnpm. The pinning applies as a group: `vitest@^3.1.0`, `@vitejs/plugin-react@^4`, `vite-tsconfig-paths@^5`, `vite@^6`. Do **not** bump piecemeal.
- **`vitest.config.mts`** (not `.ts`) — `vite-tsconfig-paths@5` is ESM-only and this package is not `"type": "module"`. The `.mts` extension forces ESM loading.
- Next.js 16, React 19.2, Tailwind v4, ESLint v9 flat-config are current — not Next 15 as some earlier plan prose suggests.

## Lessons Learned

Things Claude has got wrong on this project — don't repeat these:

- **Plan docs drift from installed versions.** Before executing a multi-task plan, do a 2-minute pre-flight check: resolve `@latest` for each major named dep, walk the verify/test script graph for ordering bugs, confirm any cross-doc references actually exist. Flag deltas with the user before committing time.
- **Don't install native-binding test tooling with `@latest` on Windows.** Pin the known-good combo above. See MISTAKES.md for the trail.

<!-- 
Keep this file concise. ~150 instructions max before Claude starts ignoring things.
If Claude already does something correctly without being told, don't add it here.
Focus on: things Claude gets wrong, patterns it can't infer, commands it needs.
-->
