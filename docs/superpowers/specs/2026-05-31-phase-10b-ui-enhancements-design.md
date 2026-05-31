# Phase 10b — UI Enhancements Design

**Date:** 2026-05-31
**Status:** Approved
**Parent:** `PLAN.md` Phase 10b; `docs/plans/2025-05-25-pipeline-ui-improvements-plan.md` Tasks 4–7

## Objective

Make sources and recommendations more useful and discoverable in the UI:
surface source metadata in the list and on the detail page, give tag chips
category context, and let users filter recommendations across every tagged
axis. Pure UI/data-shape polish — no pipeline or auth changes.

## Context

The codebase uses a distinctive editorial/typographic design system
(`section-num`, `eyebrow`, `ref`, `status`, serif italics, `paper-2`,
`rule`/`rule-strong`). All new UI must follow it rather than introduce new
visual idioms. Server components load data through the repository layer with a
`RepoContext`; the auth-visibility filter pattern in `listRecentSources` /
`recommendation.ts` must be preserved so `APP_MODE` stays a no-op on query
shape.

### Axis ownership (critical)

Confirmed from the schema's M2M join tables:

| Axis | Level | Join table | Keyed on |
|------|-------|------------|----------|
| Thematic area | rec | `recommendations_thematic_areas` | `r.id` |
| Purpose | rec | `recommendations_purposes` | `r.id` |
| Target audience | rec | `recommendations_target_audience_types` | `r.id` |
| Location scope | rec | `recommendations_location_scopes` | `r.id` (not filtered — out of scope) |
| Source type | **source** | `sources_source_types` | `r.source_id` |
| Role relevance | **source** | `sources_role_relevances` | `r.source_id` |

Recommendations do **not** carry source type or role relevance directly.
Filtering recs by those axes goes through the rec's source.

## Tasks

### Task 4 — Source-list metadata

**Query** — extend `listRecentSources` (`src/lib/repositories/jobs-list.ts`)
and its `RecentSource` type with:
- `recCount: number` — scalar subquery
  `(SELECT count(*) FROM recommendations r WHERE r.source_id = s.id)`.
- `summary: string | null` — existing `sources.summary` column.
- `primaryTheme: string | null` — lateral
  `(SELECT ta.name FROM sources_thematic_areas sta JOIN thematic_areas ta ON ta.id = sta.thematic_area_id WHERE sta.source_id = s.id ORDER BY ta.name LIMIT 1)`.

The auth-visibility `WHERE` filter is unchanged.

**UI** — `src/app/(app)/sources/page.tsx` list item gains, within the existing
grid: a ~120-char truncated summary excerpt, a "N recommendations" count badge
(`ref`/`eyebrow` styling), and a primary-theme chip. Rows with no
recommendations / no theme omit the respective element.

**Tests** — `jobs-list.test.ts` (Testcontainers): assert `recCount`,
`summary`, `primaryTheme` are populated and that the count is correct across a
seeded source with N recs and a source with none.

### Task 7 — Source-detail metadata block

**Component** — new presentational `SourceMeta`
(`src/components/sources/source-meta.tsx`) rendering a definition-style block:
- **Published** — `publicationDate` via the existing `en-GB` formatter.
- **Organisation** — `orgOwner`.
- **Authors** — `authors` array joined with `, `.

Each row is omitted when its value is null/empty. Renders nothing if all three
are absent. Eyebrow-styled labels to match the design system.

**Wiring** — placed below the title and above the tag block on
`src/app/(app)/sources/[slug]/page.tsx`. Confirm `getSourceWithPagesBySlug`
selects `summary`, `authors`, `publicationDate`, `orgOwner`; add to the select
if missing.

**Tests** — `source-meta.test.tsx`: renders supplied fields; omits null rows;
renders nothing when all absent.

### Task 6 — Tag category labels (stacked eyebrow)

**Component** — add an optional `label?: string` prop to `TagChips`
(`src/components/tags/tag-chips.tsx`). When set, render an `.eyebrow`-style
label line above the chip row. Unlabelled behaviour unchanged. Still returns
`null` for an empty tag list (so a labelled-but-empty axis renders nothing).

**Wiring** — `sources/[slug]/page.tsx` passes labels: Themes / Type / Purpose /
Roles / Audience. Apply the same labelled variant to the recommendation detail
tag display if present.

**Tests** — extend `tag-chips.test.tsx` for the labelled variant (label shown;
empty list still renders nothing even with a label).

### Task 5 — Expanded recommendation filters (combobox multi-select)

**URL state** — comma-joined slug lists per axis, e.g.
`?theme=housing,welfare&purpose=accountability&type=audit-report&role=officers&audience=funders`.
`useSearchParamsState` stays string-only; the controls component splits on `,`
to read and joins on `,` to write. No hook change.

**Server** — `src/app/(app)/recommendations/page.tsx`:
1. Load options for the five axes via existing `list*` functions:
   `listThematicAreas`, `listPurposes`, `listTargetAudienceTypes` (rec axes),
   `listSourceTypes`, `listRoleRelevances` (source axes). These feed the
   comboboxes and the slug→id resolution.
2. Parse each axis's comma-list from the URL.
3. Resolve slugs→ids against the loaded option lists (unknown slugs dropped).
4. Pass id arrays into the filter object.

**Filter shape** — `SearchFilters` (`src/lib/services/search-sql.ts`):
- Migrate `thematicAreaId?: string` → `thematicAreaIds?: string[]`.
- Add `purposeIds?: string[]`, `targetAudienceTypeIds?: string[]` (rec-level).
- Add `sourceTypeIds?: string[]`, `roleRelevanceIds?: string[]` (source-level).
- Keep `sourceId?: string` single; keep `createdAfter`/`createdBefore`.
The recommendations page is the only caller of the changed field.

**SQL** — `composeRecFilters` swaps the single `themaJoin` for `EXISTS`
subqueries, one per active axis, to avoid row multiplication across multiple
M2M joins. Each uses `= ANY(${ids}::uuid[])`:
- Rec axis example:
  `EXISTS (SELECT 1 FROM recommendations_purposes rp WHERE rp.recommendation_id = r.id AND rp.purpose_id = ANY(${ids}::uuid[]))`
- Source axis example:
  `EXISTS (SELECT 1 FROM sources_source_types sst WHERE sst.source_id = r.source_id AND sst.source_type_id = ANY(${ids}::uuid[]))`
`sourceId` stays a direct `r.source_id = …` predicate. Empty/absent arrays add
no predicate. Applies to both the keyword and hybrid/RRF builders (both call
`composeRecFilters`).

**Browse path** — `listRecentRecommendations` (`recommendation.ts`) accepts the
same extended filter shape for the no-query path, using the same `EXISTS`
predicates.

**Controls** — `recommendations-index-controls.tsx`: one `TagMultiSelect` per
axis (reuse). Add an `allowCreate?: boolean` prop to `TagMultiSelect`
(default `true`, backwards-compatible); set `false` for filters so users can't
coin a nonexistent tag to filter by. Selected values surface in the existing
`FilterChips` with per-axis clear.

**Tests** — Testcontainers search-sql / search-service tests: multi-value
within one axis, multiple axes combined (AND across axes), a rec-level axis and
a source-level axis together, and the empty-filter passthrough. Controls render
+ URL round-trip (the hook itself is already tested).

## Sequencing

Four independent TDD commits, dependency order:
1. Task 4 — source-list metadata (query + UI).
2. Task 7 — source-detail metadata block (component + wiring).
3. Task 6 — tag category labels (component + wiring).
4. Task 5 — expanded filters (filter shape → SQL → server → controls).

## Out of scope (YAGNI)

- `location_scope` filtering (not requested).
- Multi-select on the source (document) filter — stays single.
- Saved filters / filter presets.
- Any pipeline, auth, or schema-migration change.

## Testing strategy

Every data-touching change keeps its Testcontainers (pgvector pg16) coverage —
no DB mocks. Presentational components get vitest + Testing Library render
tests. `pnpm verify` (typecheck + lint + vitest + build) green before each
commit.
