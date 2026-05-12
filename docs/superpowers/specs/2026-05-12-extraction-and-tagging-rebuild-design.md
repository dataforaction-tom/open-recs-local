# Extraction & tagging rebuild — Design

> Date: 2026-05-12
> Status: Approved (pending user review of written spec)
> Authors: Tom (product), Claude (drafting)
> Supersedes (scope-only): the extraction prompt + single-axis thematic tagging shipped in v1.0.

## Why

v1.0 shipped a working extraction pipeline but the data model is much thinner than the v1 Supabase app it replaces. Concretely, today:

- `recommendations` has only `title`, `body`, `page_anchor`, `embedding`. Themes are M2M-capable but extraction sets at most one per rec.
- `sources` has `title`, `slug`, `is_private`, `canonical_markdown`, `metadata` (unused). No authors, no publication date, no `org_owner`, no `original_url`, no source-level tags at all.
- The taxonomy is **5 hardcoded thematic areas** vs v1's **29 themes + 9 purposes + 10 source types + 14 audiences + 5 location scopes + 4 priority timescales + 9 role relevances**.
- The extract prompt is a single pass with a flat schema; small models like `llama3.1:8b` skip optional fields and return inconsistent tag assignments.
- There is no manual edit UI for tags, so a non-deterministic LLM pass is the **only** way data gets onto a recommendation.

This design closes those gaps and lifts the data model to roughly v1 parity, with adjustments where 1.0's primitives (M2M tables, repository auth filter, pg-boss pipeline) give us a cleaner home for the same data.

## Goals

1. **Bring source-level metadata to parity with v1** — authors, publication date, organisational owner, original URL, summary, multi-axis tags, datasets list.
2. **Bring recommendation-level tagging to parity with v1** — multiple themes per rec, plus purpose / target audience / location scope / priority timescale / target organisation / notes / confidence.
3. **Make extraction reliably populate the new fields** via a two-pass, section-aware pipeline that compensates for small-model limitations.
4. **Provide manual editing** so humans can correct or fill the gaps the LLM leaves.
5. **Let the taxonomy grow organically** — when the LLM proposes a tag we don't know, accept it as `unverified` and queue it for admin review.

## Non-goals

- Search filters for the new axes (themes filter exists; purpose / audience / etc. filters land in 1.2).
- New analytics charts beyond the four shipped in 1.0 (e.g. source-type breakdown, audience-mix).
- Inline multi-select edits on the catalogue / index tables (multi-select happens on dedicated edit pages).
- Bulk re-tag UI.
- Hierarchical tags (sub-themes, parent-child).
- Data migration from v1.0 — we wipe + re-migrate. There is no production data to preserve.

## Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **One reference table + one M2M join per axis** | Proper relational shape; per-tag metadata (color, description, `unverified`); FK integrity; matches the existing `thematic_areas` pattern. |
| 2 | **Two-pass extraction (metadata then recommendations)** | Small models handle focused schemas better. Pass 1 sees the first 10k chars; Pass 2 sees recommendation sections or the full doc. |
| 3 | **Section-aware Pass 2** | Regex-detect `# Recommendations`, `# Next steps`, `# Conclusions`, etc. Use a strict prompt when sections are found; fall back to a looser full-document prompt when they aren't. |
| 4 | **Unknown LLM tags → auto-create with `unverified=true`** | Taxonomy grows organically without LLM hallucinations going silently dropped. Admin review queue (`/admin/tags`) promotes / merges / renames / deletes. |
| 5 | **Configurable extract model** | Default to Claude Haiku 4.5 in hosted mode for accuracy; `llama3.1:8b` works in local mode but accuracy is documented as lower. Uses the existing `CHAT_*` / `LLM_*` env split. |
| 6 | **Wipe + re-migrate, no preservation** | 1.0 has no production data; local test data is disposable. Saves a full additive-migration design. |
| 7 | **Split into three PRs** | Schema + taxonomy seed; extraction pipeline; UI. Each PR is independently reviewable + revertible. After all three merge, tag `v1.1.0`. |
| 8 | **`<TagMultiSelect>` + `<TagChips>` carry the UI** | Two reusable components used everywhere tags appear. Edit pages compose them; existing pages add `<TagChips>` for read display. |

## Data model

### Reference tables (one per axis)

All reference tables share the same shape:

```sql
CREATE TABLE {axis}s (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  color_hex   text,                  -- only set for axes with visual colours (themes)
  description text,
  unverified  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

| Axis | Table | Seeded defaults |
|---|---|---|
| Thematic areas | `thematic_areas` | 29 (expand from current 5; v1 default list) |
| Purposes | `purposes` | 9 |
| Source types | `source_types` | 10 |
| Target audience types | `target_audience_types` | 14 |
| Location scopes | `location_scopes` | 5 |
| Role relevances | `role_relevances` | 9 |
| Priority timescales | `priority_timescales` | 4 |

`thematic_areas` is amended: `unverified BOOLEAN NOT NULL DEFAULT false` column added.

### New columns on `sources`

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `summary` | `text` | yes | 2-3 sentence abstract |
| `authors` | `text[]` | no, default `'{}'` | List of author names; no taxonomy infrastructure needed |
| `publication_date` | `date` | yes | Document publication date |
| `org_owner` | `text` | yes | Organisation that owns / published the report (distinct from `owner_user_id`) |
| `original_url` | `text` | yes | URL where the document was originally published |
| `attachment_url` | `text` | yes | Durable file path (complements the existing signed-token route) |
| `datasets` | `jsonb` | no, default `'[]'` | Array of `{description, url}` linked datasets |

### New columns on `recommendations`

| Column | Type | Nullable | Purpose |
|---|---|---|---|
| `target_organization` | `text` | yes | Specific named org (single value) |
| `priority_timescale_id` | `uuid` | yes, FK → `priority_timescales` | Single-value priority |
| `notes` | `text` | yes | LLM commentary or human notes |
| `confidence` | `text` | yes, CHECK in `('high','medium','low')` | LLM's confidence in the extraction |

### M2M join tables

Sources side (5 new):
- `sources_thematic_areas`
- `sources_source_types`
- `sources_purposes`
- `sources_role_relevances`
- `sources_target_audience_types`

Recommendations side (3 new; `recommendations_thematic_areas` already exists):
- `recommendations_purposes`
- `recommendations_target_audience_types`
- `recommendations_location_scopes`

All M2M tables: `(parent_id, axis_id, PRIMARY KEY (parent_id, axis_id))` with both FKs `ON DELETE CASCADE`.

### Indexes

- HNSW on embedding columns (unchanged).
- GIN on `tsvector` generated columns (unchanged).
- B-tree on M2M `axis_id` columns to support reverse lookup ("which sources are tagged X").

## Extraction pipeline

The pipeline shape stays: `parse → extract → embed → ready`. The `extract` handler becomes a sequenced two-pass call.

### Pass 1 — Source metadata

**Input:** first 10,000 chars of canonical markdown.

**System prompt:** lists the valid slugs for every multi-select axis plus an instruction to return a new slug only when no listed slug truly fits.

**Schema (Zod):**
```ts
const SourceMetadataSchema = z.object({
  summary: z.string().nullable(),
  authors: z.array(z.string()).default([]),
  publication_date: z.string().nullable(),         // ISO date or null
  org_owner: z.string().nullable(),
  thematic_area_slugs: z.array(z.string()).default([]),
  source_type_slugs: z.array(z.string()).default([]),
  purpose_slugs: z.array(z.string()).default([]),
  role_relevance_slugs: z.array(z.string()).default([]),
  target_audience_type_slugs: z.array(z.string()).default([]),
});
```

**Persistence:** update the existing `sources` row with the new columns. For each multi-select axis, clear existing M2M rows for this source, resolve slugs to ids via `resolveOrCreateSlugs(...)`, insert new M2M rows.

### Section detection (between passes)

Apply regex patterns to canonical markdown:

```
/# Recommendations\s*(?:and\s+next\s+steps)?/gi
/# Next\s+steps/gi
/# Conclusions?\s*(?:and\s+recommendations)?/gi
/# Actions?/gi
/# We will/gi
/# Summary/gi
```

For each match, slice from the heading to the start of the next match (or to the next "non-recommendation" major heading like `# About`, `# Introduction`, `# Methodology`, `# Appendix`, `# Bibliography`, `# References`, `# Conclusion` (singular), `# Overview` — patterns ported from v1).

If sections found: `processText` = concatenation of all matched sections; use **strict prompt**.
If no sections found: `processText` = canonical markdown truncated at 100k chars; use **looser prompt**.

### Pass 2 — Recommendations

**Input:** `processText` from section detection.

**System prompt (strict, sections-only branch):**
> *You are a recommendation extraction assistant. EXTRACT ONLY ACTIONABLE RECOMMENDATIONS that prescribe specific actions. Skip needs / wishes / background. For each recommendation: full title + body (header + main explanation, stop at subsections), tags from the listed slugs (return a new slug only when none fit), `confidence` ∈ {high, medium, low}.*

**System prompt (looser, full-document branch):**
> *You are a recommendation extraction assistant. Find section headers and numbered items that are actionable recommendations. Extract the core text (header + first 1-2 paragraphs); stop at subsections. Skip background, descriptions, questions. Tags from the listed slugs; new slug only when none fit; `confidence` required.*

Both prompts include the system-wide instruction listing valid slugs for: `thematic_area`, `purpose`, `target_audience_type`, `location_scope`, `priority_timescale`.

**Schema (Zod):**
```ts
const RecommendationsSchema = z.object({
  recommendations: z.array(z.object({
    title: z.string().min(5),
    body: z.string().min(20),
    thematic_area_slugs: z.array(z.string()).default([]),
    purpose_slugs: z.array(z.string()).default([]),
    target_audience_type_slugs: z.array(z.string()).default([]),
    location_scope_slugs: z.array(z.string()).default([]),
    priority_timescale_slug: z.string().nullable().optional(),
    target_organization: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    confidence: z.enum(['high', 'medium', 'low']),
    page_start: z.number().int().nullable().optional(),
    page_end: z.number().int().nullable().optional(),
  })),
});
```

**Persistence:** same idempotent delete-then-insert pattern as today. Each rec gets:
- Direct columns written.
- `priority_timescale_id` resolved via `resolveOrCreateSlug('priority_timescales', slug)`.
- Each multi-axis tag list resolved via `resolveOrCreateSlugs(axis, slugs)` and inserted into the matching M2M table.

### `resolveOrCreateSlugs(ctx, axisTable, slugs[]) → ids[]`

One service-layer helper used by both passes:

1. Lowercase + normalise slugs.
2. SELECT ids by `slug IN (...)`.
3. For missing slugs: INSERT `{ slug, name: humanize(slug), unverified: true }` and capture new ids.
4. Return ids in original slug order.

Lives in `src/lib/services/taxonomy.ts`. Tests cover known, unknown, and mixed cases plus the idempotency of repeated calls.

### Model configuration

Uses the `CHAT_*` / `LLM_*` env split shipped in 1.0:
- **Local mode default**: `LLM_PROVIDER=openai-compatible`, `LLM_MODEL=llama3.1:8b`. `docs/running-locally.md` is updated to document that local extraction accuracy is meaningfully lower than Claude.
- **Hosted mode recommended**: `LLM_PROVIDER=anthropic`, `LLM_MODEL=claude-haiku-4-5`. Cents per doc.

The handler reads `env.LLM_*` (not `env.CHAT_*`) for extraction — `CHAT_*` remains the streaming-chat path.

### Failure handling

- LLM returns invalid JSON / schema mismatch → existing `openai-compat` adapter Zod retry (3 retries, then throws → `sources.status='failed'`, `job_results` row written).
- Pass 1 throws → source flips to `failed`; Pass 2 doesn't run.
- Pass 2 throws → source flips to `failed`; Pass 1's metadata stays (no rollback). The retry mechanism re-runs both passes.
- Section regex finds nothing on a doc that clearly has recs → automatic fall-through to looser full-document prompt.
- LLM returns `recommendations: []` → source flips to `ready` with zero recs. Not an error.

## UI

### `/sources/[slug]/edit` (new)

Server-rendered form, server action on submit. Fields:

- **Text inputs**: title, summary (textarea), org_owner, original_url, publication_date (date picker), attachment_url.
- **Authors**: tag-input — chips, type-to-add. Persisted as `text[]`.
- **Multi-selects**: thematic areas, source types, purposes, role relevances, target audiences. Each renders `<TagMultiSelect axis="...">`.
- **Datasets**: repeatable section — `{description, url}` per row, add / remove rows. Persisted as `jsonb`.
- **`is_private`** toggle: hosted mode only.

Server action:
1. Zod-validates the payload.
2. Updates the sources row.
3. For each axis, computes the diff (added / removed slugs) and reflects it in the M2M table.
4. Revalidates `/sources/[slug]` and `/sources`.

### `/recommendations/[id]/edit` (new)

Same shape:

- **Text inputs**: title, body (textarea), target_organization, notes (textarea), page_start, page_end.
- **Single selects**: priority_timescale (dropdown of `priority_timescales`), confidence (`high | medium | low`).
- **Multi-selects**: thematic areas, purposes, target audiences, location scopes.

Server action mirrors the sources edit action.

### `/admin/tags` (new — hosted mode only)

Per-axis section. Each section lists unverified tags with row actions:

- **Promote** — `UPDATE {axis} SET unverified=false WHERE id=?`.
- **Rename** — modal: edit `name` and / or `slug`. Slug change rewrites references via FK.
- **Merge into existing** — modal: pick a target verified tag from the same axis; all M2M rows pointing at the unverified one are UPDATE'd to the target id; unverified tag is DELETE'd.
- **Delete** — DELETE the unverified tag (M2M rows cascade).

Page hides itself in local mode (no admin role concept). Same gate as the existing `/admin` route.

### Existing pages — additions only

- **`/sources` catalogue**: each row gets a single chip for the primary source type (first M2M row) + a small count badge for themes.
- **`/sources/[slug]`** header: `<TagChips>` for every axis above the markdown body. New section "Metadata" surfaces summary, authors, publication date, org_owner, original_url, datasets list.
- **`/recommendations`** index: existing theme chips column stays. Adds a priority chip column. Inline status edit unchanged.
- **`/recommendations/[id]`** Overview tab: full chips per axis + "Edit" button linking to the new edit page.

### Components

- **`<TagMultiSelect axis="purposes" value={Slug[]} onChange={(slugs) => ...} />`** — fetches reference rows server-side at parent boundary, passes a list down; client multi-select with type-to-search and "Add `<query>`" affordance that creates `unverified=true` rows on submit. Built on the existing `base-ui` combobox primitive.
- **`<TagChips tags={[{slug, name, color_hex, unverified}]} />`** — read-only chips; unverified tags render with a dotted border + muted color regardless of `color_hex`.

## Migration

1. Local dev tear-down: `docker compose down -v` (drops pgdata).
2. New Drizzle migrations:
   - `0006_taxonomy_reference_tables.sql` — create 6 new reference tables; add `unverified` to `thematic_areas`.
   - `0007_source_metadata_columns.sql` — add 7 columns to `sources`.
   - `0008_recommendation_metadata_columns.sql` — add 4 columns to `recommendations`; add `priority_timescale_id` FK.
   - `0009_m2m_join_tables.sql` — create 8 new M2M tables (5 source-side + 3 rec-side).
3. `seeds/taxonomy.ts` is rebuilt: existing 5-item `THEMATIC_AREAS` becomes the v1 29-item list; new arrays for each of the other 6 axes.
4. `seedTaxonomy()` in `src/lib/db/seed-taxonomy.ts` is upgraded to seed every axis idempotently (extend the existing `onConflictDoUpdate` pattern).

No production deployments exist today. If a hosted deployment lands before 1.1 ships, the four migrations are written so they can be applied additively — all new columns are nullable / defaulted, all new tables are empty until written into. Wipe-and-reseed remains the local-dev path.

## Testing

| Layer | Tool | Scope |
|---|---|---|
| Schema | Drizzle + Testcontainers | Migrations apply cleanly; FKs + uniqueness enforced. |
| Repo | Vitest + Testcontainers | Each reference table gets `list()`, `findBySlugs()`, `resolveOrCreate()` tests. M2M repos get auth-filtered `attach()`, `detach()`, `replaceForParent()` tests. |
| Service | Vitest | `resolveOrCreateSlugs(axis, slugs[])` — known / unknown / mixed slugs; idempotent re-runs; rejects empty slugs. |
| Extract handler | Vitest with fake LLM | Pass 1 + Pass 2; known + unknown slugs (verify `unverified=true` rows created); missing optional fields (graceful); confidence persisted; re-extract is idempotent. |
| API / server actions | Vitest + Testcontainers | Edit-page payloads: Zod validation, auth filter, persisted M2M diffs. |
| E2E (Playwright) | Existing local-mode + hosted-mode harnesses | `local-mode.spec.ts` adds: upload → extract populates source tags + multi-tagged recs → assertion. `hosted-mode.spec.ts` adds: edit a rec via `/recommendations/[id]/edit` → tag persisted across reload. |

Fixture LLM outputs are extended to exercise the new schema. Real Ollama in CI remains the smoke for the streaming chat path; extract is exercised via the fake LLM for determinism.

## Sequencing

Three PRs, merged in order, then tag `v1.1.0`.

### PR 1 — Schema + taxonomy seed (`feat: extraction-tagging-rebuild — schema`)

- Migrations 0006–0009.
- Updated `src/lib/db/schema.ts` (Drizzle definitions).
- `seeds/taxonomy.ts` rebuilt with v1 defaults across 7 axes.
- `src/lib/db/seed-taxonomy.ts` updated for the new shape.
- Repo layer files for every new axis + every new M2M (consistent shape: `list`, `findBySlugs`, `resolveOrCreate`, `attach/detach/replaceForParent`).
- Tests for all of the above.
- `pnpm verify` green.
- **No UI changes, no extract changes.** Existing extract handler is left alone; the new columns are NULL / empty M2M for now.

### PR 2 — Extraction pipeline rebuild (`feat: extraction-tagging-rebuild — pipeline`)

- `src/lib/services/taxonomy.ts` — `resolveOrCreateSlugs` helper.
- `src/lib/services/extraction-schema.ts` — new Pass 1 + Pass 2 Zod schemas.
- `src/lib/jobs/handlers/extract.ts` — full rewrite: section detection, two-pass, persistence.
- Updated prompts (strict + looser variants).
- Existing extract handler tests rewritten against the new schema.
- Fixture LLM provider extended with sample Pass 1 + Pass 2 outputs for the existing two fixtures.
- `pnpm verify` green.

### PR 3 — Edit pages + admin review + chip displays (`feat: extraction-tagging-rebuild — UI`)

- `<TagMultiSelect>` + `<TagChips>` components + their tests.
- `/sources/[slug]/edit` + server action + tests.
- `/recommendations/[id]/edit` + server action + tests.
- `/admin/tags` page + actions + tests.
- `<TagChips>` added to: `/sources` catalogue, `/sources/[slug]` header, `/recommendations/[id]` Overview tab. Priority chip column added to `/recommendations`.
- E2E spec extensions (one new flow per mode).
- `docs/running-locally.md` updated to document the model-quality trade-off.
- `docs/changelog.md` gets a 1.1.0 section.
- `package.json` bumped to 1.1.0. Tag `v1.1.0` after merge.

## Risks / open questions

1. **Prompt size with 80+ tags listed**: 6 multi-select axes × seeded defaults ≈ 80 slugs. Should fit comfortably under 4k tokens in the system prompt. If a model context limit becomes an issue (very long documents on the user prompt side), the seeded defaults can be trimmed in PR 2; UI still surfaces them via `<TagMultiSelect>`.
2. **`llama3.1:8b` on Pass 1**: 9-field structured output is a stretch for a small local model. The two-pass split helps; worst case Pass 1 returns nulls and the user fills via edit page. Documented as expected.
3. **Tag bloat in auto-create**: the LLM can grow the taxonomy unbounded. Admin review in hosted mode tames it; local mode operators get the same `/admin/tags` page since tag review is operational (not auth-gated). `/admin/tags` therefore renders in both modes, unlike `/admin` (ownership requests, role table) which stays hosted-only.
4. **Confidence has no UI surface yet**: persisted but unused for sort / filter in 1.1. 1.2 hooks it into the recs index.
5. **`thematic_areas` already has rows seeded for 1.0**: PR 1's migration adds the `unverified` column with `DEFAULT false` so the 5 existing rows are preserved as verified. The wipe-and-reseed approach makes this moot in practice (everything is regenerated), but the migration is shaped to work additively for any future deployments.

## Out of scope (deferred to 1.2 / later)

- Search filters by purpose, audience, source type, location scope, priority.
- Analytics charts for source-type breakdown, audience mix, location-scope distribution.
- Inline multi-select edits on the catalogue / index tables.
- Bulk re-tag UI.
- Hierarchical tags (sub-themes, parent-child).
- Confidence-driven sort / filter on the recommendations index.
- Migration tooling for v1 Supabase data export.

## Next step

Invoke `superpowers:writing-plans` against this spec to decompose **PR 1 (schema + taxonomy seed)** into TDD-sized tasks. PR 2 and PR 3 each get their own writing-plans pass when PR 1 lands.
