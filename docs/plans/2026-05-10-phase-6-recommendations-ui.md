# Phase 6 — Recommendations UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the search service from Phase 3 visible to users. `/recommendations` lists every recommendation in a TanStack Table — sortable, filterable, URL-driven so links round-trip a search state. Click a row → `/recommendations/[id]` detail page with tabs (Overview, Similar, Progress Updates). The Similar tab shows the top-5 most-similar recs by pgvector cosine distance. NetworkViz is in the design but deferred — see "Out of scope" below.

**Architecture:**

- `/recommendations` is a server component reading the URL search params (`q`, `source`, `theme`, `mode`, `limit`). It calls the existing `searchRecommendations` service directly (not an HTTP fetch — server components avoid the round trip), and hands the results to `<RecommendationsTable>` (client) which uses TanStack Table v8 for column rendering, sorting, and pagination. Filter changes update the URL via `useRouter().push(...)` so the back button and shareable links work; the server component re-runs on each navigation.
- `/recommendations/[id]` is a second server component that loads a single rec via a new `findRecommendationById` repo helper. Renders shadcn `tabs`: Overview (rec body + metadata), Similar (server-loads top-5 cosine neighbours via `findSimilarRecommendations`), Progress Updates (Phase 7 will fill this; ships as an empty-state card now).
- The Similar list is fetched in the same server pass, not lazily — keeps the page boring and SSR-friendly. If load times suffer with bigger corpora, switch to `<Suspense>` + a server action.

**Tech Stack — new tooling at Task 1 (approval-gated):**

- `@tanstack/react-table@^8` — table primitive. The design names it explicitly as the AG Grid replacement.
- shadcn additions: `tabs`, `badge`, `select` (for filter chips). All codegenned, no manual JS to write.

**Out of scope for Phase 6 (called out explicitly):**

- **Inline-editable cells.** The design lists "TanStack Table with inline-editable cells via EditableSelectCell" as the Phase 6 contract, but the only editable field today would be status — and status writes belong with Phase 7's progress-update flow (recommendation_statuses is a history table). Phase 6 ships read-only; Phase 7 adds the EditableSelectCell with status writes routed through the same API the form uses.
- **NetworkViz.** Canvas force-directed graph is a genuine multi-day project of its own (layout tuning, hit-testing, perf). Deferred to its own slot — likely Phase 9 alongside the analytics work, where Chart.js + canvas tooling already lands. The detail page leaves an empty Network tab that lights up later.
- **Multi-select column filters / saved filter presets.** Single value per filter, persistent only in the URL.
- **Bulk row actions.** Individual rec navigation only.
- **Mobile-friendly table layout.** Desktop-first; horizontal scroll below `md:`.

---

## Phase 6 exit criteria

1. `GET /recommendations` renders a TanStack Table with the Phase 2/3 fixture corpus visible: title, source, thematic area, created_at columns; sortable by created_at and title.
2. URL-driven filters work: `?q=auditor&source=<uuid>&mode=keyword` round-trips through the server component, the table re-renders the filtered set, and a refresh / share preserves the filter state.
3. `/recommendations/[id]` loads a single rec; the three tabs are present; Overview + Similar are populated with real data; Progress Updates renders an empty-state card.
4. Similar panel returns the top-5 by cosine distance, excluding the current rec.
5. `pnpm verify` green: typecheck, lint, tests, Next.js build.
6. CI green; manual smoke against the seeded fixture corpus shows table data + a working detail page.

---

## Preflight facts (resolve at plan time, then re-check during Task 1)

- **Search service** (`src/lib/services/search.ts`) already returns `RrfRow[]` with `id`, `title`, `body`, `sourceId`, `sourceSlug`, `rrfScore`, `keywordRank`, `vectorRank`. The page columns use this shape directly — no shape adapter needed.
- **Hybrid vs keyword mode** is already a parameter on the service. Phase 6 exposes a UI toggle that flips `mode` in the URL.
- **`recommendations.embedding`** is `vector(768)` with an HNSW cosine index. `findSimilarRecommendations` is a single SQL — `ORDER BY embedding <=> $self_embedding LIMIT 6` minus the row itself.
- **Thematic-area filter** in `searchRecommendations` already joins through `recommendations_thematic_areas` when supplied. Phase 6 wires a `theme` chip up to that filter.
- **`pageAnchor`** column exists on the recommendations table but isn't populated yet. Phase 6's detail page reads it; renders nothing when null. (When the chat-search citation flow finally writes per-rec page anchors, the detail page links to `/sources/<slug>#page=N`.)
- **Status column.** The current status of a rec lives on the latest `recommendation_statuses` row. The table needs a tiny `latestStatusBySource` SQL join — but since the status filter is OOS, the column shows "—" until Phase 7 wires the lateral join. Alternatively, omit the column entirely in Phase 6 and add it in Phase 7 with the EditableSelectCell. Going with the latter — fewer moving parts.

---

## Task list

| # | Task | Touches |
|---|---|---|
| 1 | Approval-gated dep + shadcn additions: `@tanstack/react-table`, shadcn `tabs`/`badge` | `package.json`, `src/components/ui/{tabs,badge}.tsx` |
| 2 | `findRecommendationById` + `findSimilarRecommendations` repo helpers + tests | `src/lib/repositories/recommendation.ts`, `.test.ts` |
| 3 | `<RecommendationsTable>` client component + tests | `src/components/recommendations/recommendations-table.tsx`, `.test.tsx` |
| 4 | URL-driven filters (`useFilters` hook + filter chips) + tests | `src/lib/hooks/use-search-params-state.ts`, `.test.tsx`, `<FilterChips>` |
| 5 | `/recommendations` server page wires URL → service → table | `src/app/(app)/recommendations/page.tsx` |
| 6 | `<RecommendationCard>` + `<RecommendationDetailHeader>` for the detail page | `src/components/recommendations/*.tsx`, tests |
| 7 | `/recommendations/[id]` detail page with tabs (Overview / Similar / Progress) | `src/app/(app)/recommendations/[id]/page.tsx` |
| 8 | UI smoke + end-of-phase verify + PR + doc updates | `tests/recommendations.smoke.test.tsx`, `PLAN.md`, `STATE.md`, `docs/changelog.md` |

---

## Task 1 — TanStack Table + shadcn additions

**Approval gate:** before `pnpm add`, confirm with the user. CLAUDE.md "Don't add dependencies without asking."

**Steps:**

```bash
pnpm add @tanstack/react-table
pnpm dlx shadcn@latest add tabs badge --yes
```

The `select` shadcn primitive isn't strictly required in Phase 6 — filter inputs are simple `<input>` + the existing `<Button>` for the mode toggle. Add `select` later if a richer filter UI is needed.

**Commit:**

```bash
git commit -m "build(ui): @tanstack/react-table + shadcn tabs/badge"
```

---

## Task 2 — Repository helpers

**Files:**
- Modify: `src/lib/repositories/recommendation.ts` — add `findRecommendationById`, `findSimilarRecommendations`.
- Modify: tests for both.

**`findRecommendationById(ctx, id)`** returns `{ id, title, body, sourceId, sourceSlug, sourceTitle, pageAnchor, embedding } | null` (with sourceSlug + sourceTitle joined). Auth filter via the standard `canRead`. Returns null if not visible / not found.

**`findSimilarRecommendations(ctx, id, k = 5)`** returns `Array<{ id, title, sourceSlug, distance }>`. Single SQL:

```sql
WITH self AS (
  SELECT embedding FROM recommendations WHERE id = $1::uuid
)
SELECT r.id::text, r.title, s.slug AS "sourceSlug",
       (r.embedding <=> (SELECT embedding FROM self)) AS distance
FROM recommendations r
JOIN sources s ON s.id = r.source_id
WHERE r.id != $1::uuid
  AND r.embedding IS NOT NULL
  AND (SELECT embedding FROM self) IS NOT NULL
  AND <auth_filter>
ORDER BY r.embedding <=> (SELECT embedding FROM self)
LIMIT $2;
```

If the source rec has no embedding (still being processed), returns `[]`.

Tests: Testcontainers; seed three recs with engineered vectors so the ordering is deterministic. Cover: rec-with-embedding returns top-k, rec-without-embedding returns empty, auth filter excludes private siblings.

**Commit:**

```bash
git commit -m "feat: findRecommendationById + findSimilarRecommendations repo helpers"
```

---

## Task 3 — `<RecommendationsTable>`

**Files:**
- `src/components/recommendations/recommendations-table.tsx` (client)
- `.test.tsx`

**Contract:** `<RecommendationsTable rows={RrfRow[]} sort={...} onSortChange={...} />`. Columns: Title (link to `/recommendations/[id]`), Source (link to `/sources/[slug]`), Created. TanStack Table handles client-side sort; the parent decides whether to push the sort state to the URL.

**Why client-side sort:** the row set is already filtered server-side. Sorting a 50-row page locally is instant; remote sort would add a round trip.

Tests: render with three rows, click the Title sort header, assert order flips. Click the Source link, assert correct href. No data fetching.

**Commit:**

```bash
git commit -m "feat(ui): <RecommendationsTable> via TanStack Table"
```

---

## Task 4 — URL-driven filters + chips

**Files:**
- `src/lib/hooks/use-search-params-state.ts` — generic `useSearchParamsState<T>()` hook tying React state to `URLSearchParams` via `useRouter().push`.
- `src/components/recommendations/filter-chips.tsx` — small component rendering active filters (q, source, theme, mode) as removable chips.
- Tests for both.

**Hook contract:** `const [state, setState] = useSearchParamsState({ q: '', mode: 'hybrid', limit: 50 })`. On call, computes from `useSearchParams()`; on `setState(partial)`, builds a new URLSearchParams and calls `router.push(`?${params}`)`. Removes empty / default values from the URL so a clean state has a clean URL.

**Chips contract:** for each non-default filter, render `<Badge>` with an "x" that clears it.

Tests use vi.mock for `next/navigation`'s `useRouter` + `useSearchParams`.

**Commit:**

```bash
git commit -m "feat(ui): useSearchParamsState + <FilterChips>"
```

---

## Task 5 — `/recommendations` server page

**Files:**
- `src/app/(app)/recommendations/page.tsx`

Reads the URL search params, validates with Zod (re-using the same schema as `/api/search`), opens a request-bound `RepoContext` via `getContext(req)`, calls `searchRecommendations({ ctx, q, filters, mode, limit })`. If `q` is empty, falls back to a "browse mode" that lists the most-recent recs via a small new `listRecentRecommendations` helper (one-line addition to the recommendation repository — keep the surface tight).

Renders: a `<Container>` header with the active filters as `<FilterChips>`, a search input that updates `?q=...`, a mode toggle (hybrid / keyword), then `<RecommendationsTable rows={results} />`. Empty-state card when results are empty.

**Commit:**

```bash
git commit -m "feat: /recommendations server page wires URL → search service → table"
```

---

## Task 6 — Detail components

**Files:**
- `src/components/recommendations/recommendation-detail-header.tsx`
- `src/components/recommendations/similar-recommendations.tsx`
- Tests for each.

**Detail header** shows title, body (markdown rendered with `<SourceMarkdown>` reuse — single page entry), source link, thematic-area badges, page anchor link if set.

**Similar list** is `<SimilarRecommendations rows={[]} />`. Pure presentational — the detail page does the data load.

**Commit:**

```bash
git commit -m "feat(ui): <RecommendationDetailHeader> + <SimilarRecommendations>"
```

---

## Task 7 — `/recommendations/[id]` page with tabs

**Files:**
- `src/app/(app)/recommendations/[id]/page.tsx`

Server component:
1. `findRecommendationById(ctx, id)` → 404 if null.
2. `findSimilarRecommendations(ctx, id, 5)` in parallel.
3. Renders `<Tabs>` (shadcn) with Overview / Similar / Progress Updates panels. Progress Updates is a placeholder card pointing at Phase 7.

**Commit:**

```bash
git commit -m "feat: /recommendations/[id] detail page with tabs"
```

---

## Task 8 — Smoke + verify + PR + docs

**Files:**
- `tests/recommendations.smoke.test.tsx` — integration of the table, filter chips, and detail header against mock data.
- `PLAN.md`, `STATE.md`, `docs/changelog.md`.

`pnpm verify` → push → PR → squash-merge.

---

## Carry-overs / flags to watch

- **Inline-editable status cell + EditableSelectCell** — Phase 7 picks this up alongside progress updates.
- **NetworkViz** — Phase 9 (or its own scoped phase) once force-directed canvas tooling lands with analytics.
- **Status column on the table** — empty until Phase 7 wires the latest-status lateral join.
- **Server-side sort** — client-side is fine for ≤200-row pages. If pagination grows past that, push sort to the URL and re-query.
- **`@tailwindcss/typography`** is still uninstalled (Phase 5 carry-over). The detail page's markdown body uses the same `prose` classes; if it looks unstyled, install the plugin or hand-write rules.
