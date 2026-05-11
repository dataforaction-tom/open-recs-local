# Phase 9 — Analytics

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A global analytics dashboard at `/analytics` and a per-source analytics view at `/sources/[slug]/analytics` render four Chart.js charts each: **recs per status**, **recs per thematic area**, **progress update cadence**, and **source publication timeline**. Aggregates are computed by a nightly `analytics.refresh` pg-boss cron job into the existing `analytics_cache` table; on-demand requests read the cache and transparently backfill on miss.

**Architecture:**

- **Aggregates as plain SQL.** Each chart corresponds to one query that returns `{ bucket, count }[]` (timelines) or `{ key, count, label?, color? }[]` (categorical). Queries live in `src/lib/services/analytics-sql.ts` — same shape as Phase 3's `search-sql.ts`. No views, no triggers; the cache stores the JSON result keyed by what was computed.
- **`analytics_cache` keyed by namespace.** Cache rows look like `key = 'analytics:global:recs-per-status' | 'analytics:source:<id>:progress-cadence' | …`, `value = jsonb`, `computed_at = timestamptz`. Existing table from Phase 1 — no DDL.
- **Cache strategy is cron + miss-backfill.** A pg-boss schedule (`boss.schedule('analytics.refresh', '0 2 * * *', …)`) fires nightly at 02:00 server time, computing every cache key in a single transaction and stamping `computed_at = now()`. Web requests read the cache; if a key is missing (first request after a deploy, new dimension added), the on-demand handler computes that key live, populates the cache, and returns. Stale-by-design: the user sees yesterday's numbers during the day; that's acceptable for the four aggregates above and avoids re-running heavy queries on every page hit.
- **Privacy:** global analytics is **admin-only in hosted mode** (404 for non-admins) and freely visible in local mode. Per-source analytics requires the viewer to be able to see the source (same auth filter as the source viewer). The cron job runs under a system context so it counts everything; the request context's role gate controls *who can see the dashboard*, not *what gets counted*.
- **Charts use `react-chartjs-2`** as the React wrapper around Chart.js v4. One small client component per chart type, server components hand them the JSON the cache stored. The data path is server-side; the client gets pre-shaped JSON and renders it.
- **Analytics is read-only in Phase 9.** No filters, no time-window pickers, no drilldowns. The four charts are exit-criteria sufficient; refinements ship in Phase 10 or as a fast-follow.

**Tech stack — new tooling at Task 1 (approval-gated):**

- `chart.js@^4` — chart primitives.
- `react-chartjs-2@^5` — the React wrapper. Bundle delta is small; ~30KB gzipped including Chart.js with tree-shaken modules.

**Out of scope for Phase 9 (called out explicitly):**

- **NetworkViz / force-directed similarity graph.** Phase 6 plan suggested Phase 9 alongside the analytics canvas tooling, but force-directed layout is a multi-day project on its own and isn't on the master plan's Phase 9 task list. Deferred to Phase 10 polish or its own carve-out.
- **Custom date ranges, drill-downs, status-by-theme cross-cuts.** Single fixed time window per chart (all-time for categorical, 12-month rolling for timelines).
- **CSV export from the charts.** Phase 10.
- **Edit / delete of progress updates** (Phase 8 carry-over).
- **Real email delivery** (Phase 8 carry-over — Phase 10).
- **Playwright E2E** (Phase 8 carry-over — Phase 10).
- **Per-user analytics ("my recommendations" view).** Single global + per-source split; per-user views are a refinement.
- **Live websockets / SSE updates.** Cache + reload.

---

## Phase 9 exit criteria

1. Visit `/analytics`. The page renders four charts: a donut for "recs per status", a bar for "recs per thematic area", a line for "progress update cadence" (12-month window), a line for "source publication timeline" (12-month window). All four pull from `analytics_cache` rows.
2. The first visit after `docker compose up` (cold cache) still works: each chart's key is computed on-demand, written back to the cache, and returned within the request. Subsequent visits hit the cache.
3. `docker compose up worker` runs the existing worker process, which now also schedules `analytics.refresh` at `0 2 * * *`. Triggering the job manually (`boss.send('analytics.refresh', {})`) recomputes every cache row and stamps fresh `computed_at` timestamps.
4. `/sources/<slug>/analytics` renders the per-source variants of the cadence and timeline charts plus a categorical "rec status distribution" donut. Cache keys are namespaced by source id.
5. With `APP_MODE=hosted`, only admins see `/analytics` — non-admins 404. Per-source analytics gates on source visibility (same filter as the source viewer).
6. `pnpm verify` green: typecheck, lint, all tests, Next.js build. New tests: aggregate SQL correctness for all four queries (Testcontainers), cache get/set behaviour, on-demand miss-backfill, the `analytics.refresh` handler, the analytics page composition.

---

## Preflight facts (resolve at plan time, then re-check during Task 1)

- **`analytics_cache` exists** from Phase 1: `(key text PK, value jsonb, computed_at timestamptz)`. No migration needed.
- **`analytics_refresh` queue** doesn't exist. pg-boss creates queues on first `send`/`schedule` so nothing in our DDL needs to change.
- **`boss.schedule(name, cron, data?, options?)`** is the pg-boss 12.x API for cron jobs. The worker registers handlers with `boss.work(name, handler)` as it does today; the schedule fires by inserting a job into the named queue, which the existing worker dispatches.
- **Worker file:** `src/worker.ts` registers `source.parse` / `source.extract` / `source.embed` handlers and starts the boss. Phase 9 adds `analytics.refresh` to the same worker — no new process.
- **Cron monitor must be enabled.** pg-boss's constructor takes `{ schedule: true }` (default true in 12.x — verify at Task 1) to start the cron monitor that promotes scheduled rows to runnable jobs.
- **`getLatestStatuses` (Phase 7)** gives us the latest-per-rec status batch helper we need for "recs per status". Reuse rather than re-derive.
- **Privacy on global analytics:** running under a system context counts every source / rec / update. The role gate is on the page — not the query. Documented in the architecture section above; revisit if a user reports counts feeling wrong.
- **Date bucketing:** Postgres `date_trunc('month', x)` for monthly buckets. Generate the empty bucket spine in SQL with `generate_series` so months with zero rows still appear on the line.

---

## Task list

| # | Task | Touches |
|---|---|---|
| 1 | Approval-gated deps: `chart.js` + `react-chartjs-2` | `package.json` |
| 2 | `analyticsCache` repo helpers (get / set / list) + tests | `src/lib/repositories/analytics-cache.ts`, `.test.ts` |
| 3 | `analytics-sql.ts` — four queries: recs-per-status, recs-per-theme, progress-cadence, source-timeline (global + per-source variants) + tests | `src/lib/services/analytics-sql.ts`, `.test.ts` |
| 4 | `analytics` service: `getOrCompute` (read cache, compute on miss, write back) + `computeAll` (for the cron job) + tests | `src/lib/services/analytics.ts`, `.test.ts` |
| 5 | `analytics.refresh` pg-boss handler + `boss.schedule` registration in `src/worker.ts` + tests | `src/lib/jobs/handlers/analytics-refresh.ts`, `.test.ts`, `src/worker.ts` |
| 6 | Chart components: `<StatusDonut>`, `<ThemeBar>`, `<CadenceLine>`, `<TimelineLine>` + tests | `src/components/analytics/*.tsx`, `.test.tsx` |
| 7 | `/analytics` server page (global, admin-gated in hosted mode) | `src/app/(app)/analytics/page.tsx`, nav update |
| 8 | `/sources/[slug]/analytics` server page (per-source) | `src/app/(app)/sources/[slug]/analytics/page.tsx`, link from source viewer |
| 9 | Smoke + verify + PR + docs (PLAN, STATE, changelog) | `tests/analytics.smoke.test.tsx`, `PLAN.md`, `STATE.md`, `docs/changelog.md` |

---

## Task 1 — Deps

```bash
pnpm add chart.js react-chartjs-2
```

No shadcn additions. Cards / typography reuse what's already in.

**Commit:**

```bash
git commit -m "build(ui): chart.js + react-chartjs-2"
```

---

## Task 2 — `analyticsCache` repo helpers

**Files:**
- `src/lib/repositories/analytics-cache.ts` + `.test.ts`

**API:**
- `getCached<T>(ctx, key): Promise<{ value: T; computedAt: Date } | null>`
- `setCached<T>(ctx, key, value: T): Promise<void>` — `INSERT … ON CONFLICT (key) DO UPDATE SET value = $2, computed_at = now()`.
- `listCachedKeys(ctx, prefix): Promise<string[]>` — useful for inspection / debug pages.

Open to any caller (cache reads don't leak data on their own — the keys are computed by service code with auth-aware inputs).

**Tests:** round-trip a value, overwrite a key, list by prefix.

**Commit:**

```bash
git commit -m "feat: analyticsCache repo helpers (get / set / listKeys)"
```

---

## Task 3 — `analytics-sql.ts`

**Files:**
- `src/lib/services/analytics-sql.ts` + `.test.ts`

**Functions:** each returns the JSON shape that the corresponding chart consumes.

```ts
type RecsPerStatusRow = { status: RecStatus; count: number };
type RecsPerThemeRow = { slug: string; name: string; colorHex: string; count: number };
type MonthlyCountRow = { bucket: string; count: number }; // ISO month YYYY-MM-01

export async function recsPerStatus(ctx, opts?: { sourceId?: string }): Promise<RecsPerStatusRow[]>;
export async function recsPerThematicArea(ctx, opts?: { sourceId?: string }): Promise<RecsPerThemeRow[]>;
export async function progressCadence(ctx, opts?: { sourceId?: string; months?: number }): Promise<MonthlyCountRow[]>;
export async function sourcePublicationTimeline(ctx, opts?: { months?: number }): Promise<MonthlyCountRow[]>;
```

Implementation notes:
- All four respect the standard auth filter via `composeAuthFilter` so a non-system caller can only count what they can see. The cron job calls them with `ctxSystem` to capture everything.
- "recs per status" uses `DISTINCT ON (recommendation_id) … ORDER BY created_at DESC` against `recommendation_statuses`, defaulting recs with no row to `'open'` via a `coalesce`. Reuses the pattern from `getLatestStatuses` (Phase 7).
- Timeline / cadence queries use `date_trunc('month', created_at)` + `generate_series(now() - interval 'N months', now(), '1 month')` so empty months appear with `count = 0`.

**Tests:** Testcontainers; seed a deterministic mix of statuses, themes, updates, and source createdAts; assert each query returns the expected shape and counts.

**Commit:**

```bash
git commit -m "feat: analytics SQL — recs-per-status, recs-per-theme, cadence, timeline"
```

---

## Task 4 — `analytics` service

**Files:**
- `src/lib/services/analytics.ts` + `.test.ts`

**`getOrCompute<T>(ctx, key, compute)`** — reads the cache, returns the value if present, otherwise runs `compute()`, stores the result with `setCached`, and returns it.

**`computeAll(ctx)`** — runs every global cache key + every per-source cache key in sequence. Used by the `analytics.refresh` job. Returns `{ wrote: number, errored: { key, error }[] }` so partial failures don't tank the whole run.

The service exposes higher-level façades like `getGlobalRecsPerStatus(ctx)` that wrap `getOrCompute` with the canonical key + the underlying SQL call. The page imports these.

**Tests:**
- `getOrCompute` returns cached when present.
- `getOrCompute` computes and stores on miss.
- `computeAll` walks every global key + at least one per-source key for each source.
- Partial failures (simulated by throwing a known error in one compute) don't stop the rest.

**Commit:**

```bash
git commit -m "feat: analytics service (getOrCompute + computeAll)"
```

---

## Task 5 — `analytics.refresh` pg-boss handler + cron registration

**Files:**
- `src/lib/jobs/handlers/analytics-refresh.ts` + `.test.ts`
- Modify: `src/worker.ts`

**Handler:** builds a system `RepoContext`, calls `computeAll(ctx)`, logs `{ wrote, errored }`. The handler itself has no Postgres state — it's a thin orchestrator.

**Worker registration:**

```ts
await boss.work('analytics.refresh', { newJobCheckIntervalSeconds: 30 }, analyticsRefreshHandler);
await boss.schedule('analytics.refresh', '0 2 * * *');
```

Runs daily at 02:00 server time. The worker is the existing process; no new sidecar.

**Tests:** Testcontainers + an in-process pg-boss instance. Send a `analytics.refresh` job, assert the handler runs and `analytics_cache` gains the expected keys.

**Commit:**

```bash
git commit -m "feat(jobs): analytics.refresh scheduled daily at 02:00"
```

---

## Task 6 — Chart components

**Files:**
- `src/components/analytics/status-donut.tsx` — Doughnut chart over the 5 statuses, colour-coded.
- `src/components/analytics/theme-bar.tsx` — horizontal Bar chart, one row per thematic area, colour from the taxonomy.
- `src/components/analytics/cadence-line.tsx` — Line chart over monthly buckets.
- `src/components/analytics/timeline-line.tsx` — same shape but counts sources rather than updates.
- One small `<EmptyChart label>` shared empty-state component for when the cached row has zero data points.
- Tests for each — render with fixture data, assert canvas mount + correct dataset shape passed to Chart.js (mock the chart constructor).

All four are `'use client'`. They accept the pre-shaped JSON as a prop and render. No data fetching inside the components.

**Commit:**

```bash
git commit -m "feat(ui): four Chart.js components (donut / bar / 2× line)"
```

---

## Task 7 — `/analytics` page

**Files:**
- `src/app/(app)/analytics/page.tsx`
- Modify: `src/components/nav/navigation.tsx` — add an Analytics link.

**Page:** server component. Loads the four global cache keys in parallel via `getOrCompute`. In hosted mode, 404s for non-admins. Renders a single-column stack of the four chart cards with friendly headings.

**Commit:**

```bash
git commit -m "feat: /analytics global dashboard"
```

---

## Task 8 — `/sources/[slug]/analytics` page

**Files:**
- `src/app/(app)/sources/[slug]/analytics/page.tsx`
- Modify: `src/app/(app)/sources/[slug]/page.tsx` — add a small "Analytics" link to the header (only when the source is visible).

**Page:** loads three charts scoped to the source — status distribution, progress cadence, and a mini "update count by author" once edit/delete UI lands (Phase 10 — leave a placeholder for now or just ship status + cadence).

Same `getOrCompute` pattern, keys namespaced `analytics:source:<id>:…`.

**Commit:**

```bash
git commit -m "feat: /sources/[slug]/analytics per-source view"
```

---

## Task 9 — Smoke, verify, PR, docs

**Files:**
- `tests/analytics.smoke.test.tsx` — composes the chart components against fixture cache data; asserts the page wiring.
- `PLAN.md`, `STATE.md`, `docs/changelog.md`.

`pnpm verify` → push → PR → squash-merge.

---

## Carry-overs / flags to watch

- **NetworkViz** — Phase 10 polish or its own carve-out.
- **Custom date-range / drill-down / cross-cut filters** — Phase 10.
- **CSV export** — Phase 10.
- **Per-user analytics ("my recommendations")** — Phase 10 / 1.x.
- **Cron schedule is fixed at 02:00 server time.** No env override yet. If self-hosters in other timezones complain, add `ANALYTICS_REFRESH_CRON` env var.
- **`@tailwindcss/typography`** still uninstalled — long-running Phase 5 carry-over.
- **Real email delivery** — Phase 8 → Phase 10.
- **Playwright browser E2E** — Phase 8 deferral → Phase 10.
- **Edit / delete of progress updates** — Phase 8 deferral; now unblocked, but no UI work yet.
- **Analytics cache invalidation on writes is intentionally skipped.** Aggregates can be a day stale by design — refresh runs nightly. If freshness matters, the user reloads the worker schedule or invokes `analytics.refresh` manually.
