# Extraction & Tagging Rebuild — PR 1 (Schema + Seed + Repos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the database schema, seed expansion, and repository functions needed by the rest of the extraction-and-tagging rebuild. No UI changes, no extraction-handler changes; this PR is purely the data layer.

**Architecture:** Add six new taxonomy reference tables (`purposes`, `source_types`, `target_audience_types`, `location_scopes`, `role_relevances`, `priority_timescales`) with a uniform shape; expand `thematic_areas` with an `unverified` column; add metadata columns to `sources` and `recommendations`; create eight new many-to-many join tables. Replace the hardcoded 5-item `THEMATIC_AREAS` seed with the v1 29-item list plus new seeded defaults for each of the other six axes. Provide reference-table repo functions (`list`, `findBySlugs`, `resolveOrCreate`) and M2M repo functions (`attach`, `detach`, `replaceForParent`, `listForParent`) ready for PR 2 to wire into the extract handler.

**Tech Stack:** TypeScript, Drizzle ORM, Postgres + pgvector, Vitest with Testcontainers (`pgvector/pgvector:pg16`), `pnpm db:generate` + `pnpm db:migrate`.

**Spec:** `docs/superpowers/specs/2026-05-12-extraction-and-tagging-rebuild-design.md`.

**Migration numbering:** The current highest migration tag is `0006_lonely_maginty`. The four PR-1 migrations will be `0007_…`, `0008_…`, `0009_…`, `0010_…` (Drizzle picks the suffix slug; the order is what matters).

---

## File Structure

**Files created:**

- `src/lib/db/migrations/0007_*.sql` — reference tables + `unverified` on `thematic_areas`
- `src/lib/db/migrations/0008_*.sql` — source metadata columns
- `src/lib/db/migrations/0009_*.sql` — recommendation metadata columns
- `src/lib/db/migrations/0010_*.sql` — M2M join tables
- `src/lib/db/migrations/meta/000{7,8,9,10}_snapshot.json` — Drizzle snapshots (auto-generated)
- `src/lib/repositories/source-tags.ts` — sources × {axis} M2M operations
- `src/lib/repositories/source-tags.test.ts` — paired tests
- `src/lib/repositories/recommendation-tags.ts` — recommendations × {axis} M2M operations
- `src/lib/repositories/recommendation-tags.test.ts` — paired tests
- `src/lib/repositories/taxonomy.test.ts` — paired tests for the existing repo file (file does not currently have tests)

**Files modified:**

- `src/lib/db/schema.ts` — new tables, columns, M2M tables, `unverified` boolean on `thematic_areas`
- `seeds/taxonomy.ts` — expand `THEMATIC_AREAS`, add six new arrays
- `src/lib/db/seed-taxonomy.ts` — seed every axis (current implementation only handles `thematic_areas` / `evidence_types` / `progress_ratings`)
- `src/scripts/seed.test.ts` — expand row-count assertions to cover the new axes
- `src/lib/repositories/taxonomy.ts` — add `list*`, `findBySlugsFor*`, `resolveOrCreate*` for each new axis plus `thematic_areas` (the file currently only has `listEvidenceTypes` + `listProgressRatings`)

**Files NOT touched in this PR (deliberate — PR 2 territory):**

- `src/lib/jobs/handlers/extract.ts`
- `src/lib/services/extraction-schema.ts`
- `src/lib/services/taxonomy.ts` (this file does not yet exist; the `resolveOrCreateSlugs` service helper lands in PR 2)
- Any UI under `src/app/` or `src/components/`

---

## Pre-flight

- [ ] **Step 1: Confirm clean tree on master**

Run: `git status && git log --oneline -3`
Expected: clean tree, master at `dff1cb1 fix(analytics): …` or later.

- [ ] **Step 2: Branch off master**

Run:
```bash
git checkout master
git pull --ff-only
git checkout -b feat/extraction-tagging-schema
```
Expected: switched to a new branch.

- [ ] **Step 3: Confirm Drizzle CLI works**

Run: `pnpm db:generate --help 2>&1 | head -5`
Expected: drizzle-kit help text. If this fails, stop and ask — the rest of the plan depends on it.

---

## Task 1: Add reference tables + `unverified` to `thematic_areas`

**Files:**
- Modify: `src/lib/db/schema.ts:238-272` (the thematic_areas / evidence_types / progress_ratings block)
- Generate: `src/lib/db/migrations/0007_*.sql`

- [ ] **Step 1: Add `unverified` column to the existing `thematicAreas` table**

In `src/lib/db/schema.ts`, replace the existing `thematicAreas` definition (lines 238-245) with:

```typescript
export const thematicAreas = pgTable('thematic_areas', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  colorHex: text('color_hex').notNull(),
  description: text('description'),
  unverified: boolean('unverified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Add six new reference tables**

In `src/lib/db/schema.ts`, immediately after the `recommendationsThematicAreas` block (around line 260), insert:

```typescript
/**
 * Shared shape for taxonomy axes added in the 1.1 extraction-and-tagging
 * rebuild. Each axis is a flat reference table with a unique slug. Tags
 * created from extraction-time LLM output that don't match a seeded slug
 * land here with `unverified=true` for admin review at /admin/tags.
 *
 * `color_hex` is nullable — only some axes (themes) carry a visual palette.
 */
export const purposes = pgTable('purposes', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  colorHex: text('color_hex'),
  description: text('description'),
  unverified: boolean('unverified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sourceTypes = pgTable('source_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  colorHex: text('color_hex'),
  description: text('description'),
  unverified: boolean('unverified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const targetAudienceTypes = pgTable('target_audience_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  colorHex: text('color_hex'),
  description: text('description'),
  unverified: boolean('unverified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const locationScopes = pgTable('location_scopes', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  colorHex: text('color_hex'),
  description: text('description'),
  unverified: boolean('unverified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const roleRelevances = pgTable('role_relevances', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  colorHex: text('color_hex'),
  description: text('description'),
  unverified: boolean('unverified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const priorityTimescales = pgTable('priority_timescales', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  colorHex: text('color_hex'),
  description: text('description'),
  unverified: boolean('unverified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file `src/lib/db/migrations/0007_<some-slug>.sql` is created plus `0007_snapshot.json` in `meta/`. Drizzle prints what it generated.

- [ ] **Step 4: Inspect the generated SQL**

Run: `ls src/lib/db/migrations/0007_*.sql && cat src/lib/db/migrations/0007_*.sql`
Expected: SQL contains `CREATE TABLE "purposes"`, `CREATE TABLE "source_types"`, `CREATE TABLE "target_audience_types"`, `CREATE TABLE "location_scopes"`, `CREATE TABLE "role_relevances"`, `CREATE TABLE "priority_timescales"`, and `ALTER TABLE "thematic_areas" ADD COLUMN "unverified"`. Confirm each new table has a UNIQUE on `slug`.

- [ ] **Step 5: Apply migrations against a fresh database and confirm**

Run:
```bash
docker compose down -v
docker compose up -d postgres
set -a; source .env; set +a
pnpm db:migrate
```
Expected: the script prints `migrations applied`. If it errors, stop and check the SQL.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/0007_*.sql src/lib/db/migrations/meta/0007_snapshot.json src/lib/db/migrations/meta/_journal.json
git commit -m "feat(schema): six taxonomy reference tables + unverified flag on thematic_areas"
```

---

## Task 2: Add source metadata columns

**Files:**
- Modify: `src/lib/db/schema.ts` — the `sources` table definition (around lines 118-139)
- Generate: `src/lib/db/migrations/0008_*.sql`

- [ ] **Step 1: Add new columns to the `sources` table**

In `src/lib/db/schema.ts`, find the `sources` pgTable definition. Within its column object, add these columns (keep alphabetical or insertion order — Drizzle doesn't care, just be consistent):

```typescript
summary: text('summary'),
authors: text('authors').array().notNull().default(sql`'{}'::text[]`),
publicationDate: timestamp('publication_date', { mode: 'date', withTimezone: false }),
orgOwner: text('org_owner'),
originalUrl: text('original_url'),
attachmentUrl: text('attachment_url'),
datasets: jsonb('datasets').$type<Array<{ description: string; url: string }>>().notNull().default([]),
```

Note: the `publication_date` is intentionally a calendar date with no timezone — the field captures when a document was published, not an instant. Drizzle's `mode: 'date'` returns a JS `Date` clamped to midnight UTC.

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: `0008_<slug>.sql` + matching snapshot is created.

- [ ] **Step 3: Inspect the generated SQL**

Run: `cat src/lib/db/migrations/0008_*.sql`
Expected: `ALTER TABLE "sources" ADD COLUMN "summary" text`, `"authors" text[] DEFAULT '{}' NOT NULL`, `"publication_date" date`, `"org_owner" text`, `"original_url" text`, `"attachment_url" text`, `"datasets" jsonb DEFAULT '[]' NOT NULL`.

- [ ] **Step 4: Apply and confirm**

Run:
```bash
set -a; source .env; set +a
pnpm db:migrate
```
Expected: `migrations applied`.

- [ ] **Step 5: Smoke-check the resulting column list**

Run: `docker exec open-recs-local-postgres-1 psql -U postgres -d openrecs -c "\d sources"`
Expected: the seven new columns appear with the right types.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/0008_*.sql src/lib/db/migrations/meta/0008_snapshot.json src/lib/db/migrations/meta/_journal.json
git commit -m "feat(schema): source metadata columns (authors, publication_date, summary, org_owner, original_url, attachment_url, datasets)"
```

---

## Task 3: Add recommendation metadata columns

**Files:**
- Modify: `src/lib/db/schema.ts` — the `recommendations` table definition (around lines 176-201)
- Generate: `src/lib/db/migrations/0009_*.sql`

- [ ] **Step 1: Add new columns to `recommendations`**

In `src/lib/db/schema.ts`, find the `recommendations` pgTable definition. Within its column object, add:

```typescript
targetOrganization: text('target_organization'),
priorityTimescaleId: uuid('priority_timescale_id').references(() => priorityTimescales.id, {
  onDelete: 'set null',
}),
notes: text('notes'),
confidence: text('confidence', { enum: ['high', 'medium', 'low'] }),
```

The `priorityTimescaleId` FK uses `ON DELETE SET NULL` so deleting a taxonomy entry doesn't cascade-delete recommendations.

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: `0009_<slug>.sql` + snapshot.

- [ ] **Step 3: Inspect the generated SQL**

Run: `cat src/lib/db/migrations/0009_*.sql`
Expected: `ALTER TABLE "recommendations" ADD COLUMN "target_organization" text`, `"priority_timescale_id" uuid REFERENCES "priority_timescales"("id") ON DELETE SET NULL`, `"notes" text`, `"confidence" text` (the enum check is enforced at the Drizzle layer; Postgres may show it as a plain text column or a CHECK depending on Drizzle's emit).

- [ ] **Step 4: Apply and confirm**

Run:
```bash
set -a; source .env; set +a
pnpm db:migrate
```
Expected: `migrations applied`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/0009_*.sql src/lib/db/migrations/meta/0009_snapshot.json src/lib/db/migrations/meta/_journal.json
git commit -m "feat(schema): recommendation metadata columns (target_organization, priority_timescale_id, notes, confidence)"
```

---

## Task 4: Add eight new M2M join tables

**Files:**
- Modify: `src/lib/db/schema.ts` — new pgTable definitions
- Generate: `src/lib/db/migrations/0010_*.sql`

- [ ] **Step 1: Add the five sources-side M2M tables**

In `src/lib/db/schema.ts`, after the existing `recommendationsThematicAreas` definition, add:

```typescript
export const sourcesThematicAreas = pgTable(
  'sources_thematic_areas',
  {
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    thematicAreaId: uuid('thematic_area_id')
      .notNull()
      .references(() => thematicAreas.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.sourceId, t.thematicAreaId] }),
    byThematicAreaIdx: index('sources_thematic_areas_thematic_area_id_idx').on(t.thematicAreaId),
  }),
);

export const sourcesSourceTypes = pgTable(
  'sources_source_types',
  {
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    sourceTypeId: uuid('source_type_id')
      .notNull()
      .references(() => sourceTypes.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.sourceId, t.sourceTypeId] }),
    bySourceTypeIdx: index('sources_source_types_source_type_id_idx').on(t.sourceTypeId),
  }),
);

export const sourcesPurposes = pgTable(
  'sources_purposes',
  {
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    purposeId: uuid('purpose_id')
      .notNull()
      .references(() => purposes.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.sourceId, t.purposeId] }),
    byPurposeIdx: index('sources_purposes_purpose_id_idx').on(t.purposeId),
  }),
);

export const sourcesRoleRelevances = pgTable(
  'sources_role_relevances',
  {
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    roleRelevanceId: uuid('role_relevance_id')
      .notNull()
      .references(() => roleRelevances.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.sourceId, t.roleRelevanceId] }),
    byRoleRelevanceIdx: index('sources_role_relevances_role_relevance_id_idx').on(t.roleRelevanceId),
  }),
);

export const sourcesTargetAudienceTypes = pgTable(
  'sources_target_audience_types',
  {
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    targetAudienceTypeId: uuid('target_audience_type_id')
      .notNull()
      .references(() => targetAudienceTypes.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.sourceId, t.targetAudienceTypeId] }),
    byTargetAudienceTypeIdx: index('sources_target_audience_types_target_audience_type_id_idx').on(
      t.targetAudienceTypeId,
    ),
  }),
);
```

- [ ] **Step 2: Add the three recommendations-side M2M tables**

Immediately after the sources-side M2M tables:

```typescript
export const recommendationsPurposes = pgTable(
  'recommendations_purposes',
  {
    recommendationId: uuid('recommendation_id')
      .notNull()
      .references(() => recommendations.id, { onDelete: 'cascade' }),
    purposeId: uuid('purpose_id')
      .notNull()
      .references(() => purposes.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.recommendationId, t.purposeId] }),
    byPurposeIdx: index('recommendations_purposes_purpose_id_idx').on(t.purposeId),
  }),
);

export const recommendationsTargetAudienceTypes = pgTable(
  'recommendations_target_audience_types',
  {
    recommendationId: uuid('recommendation_id')
      .notNull()
      .references(() => recommendations.id, { onDelete: 'cascade' }),
    targetAudienceTypeId: uuid('target_audience_type_id')
      .notNull()
      .references(() => targetAudienceTypes.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.recommendationId, t.targetAudienceTypeId] }),
    byTargetAudienceTypeIdx: index(
      'recommendations_target_audience_types_target_audience_type_id_idx',
    ).on(t.targetAudienceTypeId),
  }),
);

export const recommendationsLocationScopes = pgTable(
  'recommendations_location_scopes',
  {
    recommendationId: uuid('recommendation_id')
      .notNull()
      .references(() => recommendations.id, { onDelete: 'cascade' }),
    locationScopeId: uuid('location_scope_id')
      .notNull()
      .references(() => locationScopes.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.recommendationId, t.locationScopeId] }),
    byLocationScopeIdx: index('recommendations_location_scopes_location_scope_id_idx').on(
      t.locationScopeId,
    ),
  }),
);
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm db:generate`
Expected: `0010_<slug>.sql` + snapshot. Drizzle should detect the eight new tables.

- [ ] **Step 4: Inspect the SQL**

Run: `cat src/lib/db/migrations/0010_*.sql`
Expected: eight `CREATE TABLE`, each with a composite PRIMARY KEY and an index on the axis-side column.

- [ ] **Step 5: Apply and confirm**

Run:
```bash
set -a; source .env; set +a
pnpm db:migrate
```
Expected: `migrations applied`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations/0010_*.sql src/lib/db/migrations/meta/0010_snapshot.json src/lib/db/migrations/meta/_journal.json
git commit -m "feat(schema): m2m join tables for sources×{theme,type,purpose,role,audience} and recommendations×{purpose,audience,location}"
```

---

## Task 5: Expand `seeds/taxonomy.ts` with v1 defaults

**Files:**
- Modify: `seeds/taxonomy.ts`

- [ ] **Step 1: Replace `THEMATIC_AREAS` with the v1 29-item list**

Replace the existing `THEMATIC_AREAS` export entirely with:

```typescript
export const THEMATIC_AREAS = [
  { slug: 'arts-culture', name: 'Arts & Culture', colorHex: '#f59e0b' },
  { slug: 'climate-change', name: 'Climate Change', colorHex: '#0ea5e9' },
  { slug: 'education', name: 'Education', colorHex: '#a855f7' },
  { slug: 'healthcare', name: 'Healthcare', colorHex: '#ef4444' },
  { slug: 'housing', name: 'Housing', colorHex: '#f97316' },
  { slug: 'heritage', name: 'Heritage', colorHex: '#b45309' },
  { slug: 'children-young-people', name: 'Children & Young People', colorHex: '#3b82f6' },
  { slug: 'older-people', name: 'Older People', colorHex: '#64748b' },
  { slug: 'neighbourhoods', name: 'Neighbourhoods', colorHex: '#14b8a6' },
  { slug: 'disability', name: 'Disability', colorHex: '#8b5cf6' },
  { slug: 'poverty-reduction', name: 'Poverty Reduction', colorHex: '#e11d48' },
  { slug: 'funding-commissioning', name: 'Funding & Commissioning', colorHex: '#0891b2' },
  { slug: 'clean-water-sanitation', name: 'Clean Water & Sanitation', colorHex: '#06b6d4' },
  { slug: 'renewable-energy', name: 'Renewable Energy', colorHex: '#84cc16' },
  { slug: 'economic-development', name: 'Economic Development', colorHex: '#d97706' },
  { slug: 'infrastructure', name: 'Infrastructure', colorHex: '#6b7280' },
  { slug: 'urban-planning', name: 'Urban Planning', colorHex: '#0d9488' },
  { slug: 'agriculture', name: 'Agriculture', colorHex: '#65a30d' },
  { slug: 'biodiversity', name: 'Biodiversity', colorHex: '#16a34a' },
  { slug: 'technology', name: 'Technology', colorHex: '#2563eb' },
  { slug: 'governance', name: 'Governance', colorHex: '#4f46e5' },
  { slug: 'human-rights', name: 'Human Rights', colorHex: '#dc2626' },
  { slug: 'criminal-justice', name: 'Criminal Justice', colorHex: '#7c3aed' },
  { slug: 'philanthropy', name: 'Philanthropy', colorHex: '#0369a1' },
  { slug: 'data', name: 'Data', colorHex: '#7c2d12' },
  { slug: 'ai', name: 'AI', colorHex: '#1e40af' },
  { slug: 'sustainability', name: 'Sustainability', colorHex: '#059669' },
  { slug: 'food', name: 'Food', colorHex: '#ca8a04' },
  { slug: 'open-infrastructure', name: 'Open Infrastructure', colorHex: '#475569' },
] as const;
```

Note: colors are a sensible palette assignment per area; review and adjust to taste — the spec doesn't pin specific hexes for new themes, only that each has a colour.

- [ ] **Step 2: Add the six new taxonomy arrays after `THEMATIC_AREAS`**

Append (still in `seeds/taxonomy.ts`, before the existing `EVIDENCE_TYPES`):

```typescript
export const PURPOSES = [
  { slug: 'strategy', name: 'Strategy' },
  { slug: 'policy-development', name: 'Policy development' },
  { slug: 'practice-service-improvement', name: 'Practice / service improvement' },
  { slug: 'learning-development', name: 'Learning & development' },
  { slug: 'system-change', name: 'System change' },
  { slug: 'research', name: 'Research' },
  { slug: 'funding-decision-making', name: 'Funding decision-making' },
  { slug: 'advocacy', name: 'Advocacy' },
  { slug: 'infrastructure-building', name: 'Infrastructure building' },
] as const;

export const SOURCE_TYPES = [
  { slug: 'evaluation', name: 'Evaluation' },
  { slug: 'learning-report', name: 'Learning report' },
  { slug: 'needs-assessment', name: 'Needs assessment' },
  { slug: 'research-study', name: 'Research study' },
  { slug: 'policy-paper', name: 'Policy paper' },
  { slug: 'strategy-document', name: 'Strategy document' },
  { slug: 'evidence-review', name: 'Evidence review' },
  { slug: 'case-study', name: 'Case study' },
  { slug: 'annual-review', name: 'Annual review' },
  { slug: 'framework', name: 'Framework' },
] as const;

export const TARGET_AUDIENCE_TYPES = [
  { slug: 'government-national', name: 'Government - national' },
  { slug: 'government-devolved', name: 'Government - devolved' },
  { slug: 'government-local', name: 'Government - local' },
  { slug: 'front-line-vcse', name: 'Front line VCSE' },
  { slug: 'public-sector', name: 'Public sector (NHS, schools, etc.)' },
  { slug: 'infrastructure-orgs', name: 'Infrastructure orgs' },
  { slug: 'communities', name: 'Communities' },
  { slug: 'funders', name: 'Funders' },
  { slug: 'commissioning-bodies', name: 'Commissioning bodies' },
  { slug: 'cross-sector-collaboration', name: 'Cross sector collaboration' },
  { slug: 'private-sector', name: 'Private Sector' },
  { slug: 'academia', name: 'Academia' },
  { slug: 'civil-society', name: 'Civil Society' },
  { slug: 'general-public', name: 'General Public' },
] as const;

export const LOCATION_SCOPES = [
  { slug: 'local', name: 'Local' },
  { slug: 'regional', name: 'Regional' },
  { slug: 'national', name: 'National' },
  { slug: 'international', name: 'International' },
  { slug: 'global', name: 'Global' },
] as const;

export const ROLE_RELEVANCES = [
  { slug: 'policy-maker', name: 'Policy Maker' },
  { slug: 'practitioner', name: 'Practitioner' },
  { slug: 'researcher', name: 'Researcher' },
  { slug: 'senior-leader', name: 'Senior Leader' },
  { slug: 'community-leader', name: 'Community Leader' },
  { slug: 'educator', name: 'Educator' },
  { slug: 'advocate', name: 'Advocate' },
  { slug: 'funder', name: 'Funder' },
  { slug: 'commissioner', name: 'Commissioner' },
] as const;

export const PRIORITY_TIMESCALES = [
  { slug: 'short-term', name: 'Short-term' },
  { slug: 'medium-term', name: 'Medium-term' },
  { slug: 'long-term', name: 'Long-term' },
  { slug: 'urgent', name: 'Urgent' },
] as const;
```

- [ ] **Step 3: Verify the file typechecks**

Run: `pnpm typecheck`
Expected: 0 errors. The existing `seedTaxonomy()` will fail in the next task if anything references the old `THEMATIC_AREAS` shape — but with `colorHex` preserved, the existing call site should still work. Confirm there are no TS errors before moving on.

- [ ] **Step 4: Commit**

```bash
git add seeds/taxonomy.ts
git commit -m "feat(seed): expand THEMATIC_AREAS to v1 29 items and seed 6 new taxonomy axes"
```

---

## Task 6: Update `seedTaxonomy()` to seed every axis

**Files:**
- Modify: `src/lib/db/seed-taxonomy.ts`

- [ ] **Step 1: Read the current file to anchor the edit**

Run: `cat src/lib/db/seed-taxonomy.ts`
Expected: it imports `thematicAreas`, `evidenceTypes`, `progressRatings` from `./schema` and `THEMATIC_AREAS`, `EVIDENCE_TYPES`, `PROGRESS_RATINGS` from `../../../seeds/taxonomy`.

- [ ] **Step 2: Replace `seed-taxonomy.ts` with the expanded version**

Replace the entire file content with:

```typescript
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  evidenceTypes,
  locationScopes,
  priorityTimescales,
  progressRatings,
  purposes,
  roleRelevances,
  sourceTypes,
  targetAudienceTypes,
  thematicAreas,
} from './schema';
import {
  EVIDENCE_TYPES,
  LOCATION_SCOPES,
  PRIORITY_TIMESCALES,
  PROGRESS_RATINGS,
  PURPOSES,
  ROLE_RELEVANCES,
  SOURCE_TYPES,
  TARGET_AUDIENCE_TYPES,
  THEMATIC_AREAS,
} from '../../../seeds/taxonomy';

/**
 * Upsert all taxonomy rows by `slug`. Safe to call repeatedly — updates
 * non-key fields on conflict and never produces duplicate key errors.
 *
 * Each call seeds every axis; `unverified` is implicitly `false` for seeded
 * rows because they exist in our hand-curated defaults. The extract handler
 * is the only writer that sets `unverified=true`.
 */
export async function seedTaxonomy(db: PostgresJsDatabase): Promise<void> {
  for (const row of THEMATIC_AREAS) {
    await db
      .insert(thematicAreas)
      .values({ slug: row.slug, name: row.name, colorHex: row.colorHex, unverified: false })
      .onConflictDoUpdate({
        target: thematicAreas.slug,
        set: { name: row.name, colorHex: row.colorHex, unverified: false },
      });
  }
  for (const row of PURPOSES) {
    await db
      .insert(purposes)
      .values({ slug: row.slug, name: row.name, unverified: false })
      .onConflictDoUpdate({
        target: purposes.slug,
        set: { name: row.name, unverified: false },
      });
  }
  for (const row of SOURCE_TYPES) {
    await db
      .insert(sourceTypes)
      .values({ slug: row.slug, name: row.name, unverified: false })
      .onConflictDoUpdate({
        target: sourceTypes.slug,
        set: { name: row.name, unverified: false },
      });
  }
  for (const row of TARGET_AUDIENCE_TYPES) {
    await db
      .insert(targetAudienceTypes)
      .values({ slug: row.slug, name: row.name, unverified: false })
      .onConflictDoUpdate({
        target: targetAudienceTypes.slug,
        set: { name: row.name, unverified: false },
      });
  }
  for (const row of LOCATION_SCOPES) {
    await db
      .insert(locationScopes)
      .values({ slug: row.slug, name: row.name, unverified: false })
      .onConflictDoUpdate({
        target: locationScopes.slug,
        set: { name: row.name, unverified: false },
      });
  }
  for (const row of ROLE_RELEVANCES) {
    await db
      .insert(roleRelevances)
      .values({ slug: row.slug, name: row.name, unverified: false })
      .onConflictDoUpdate({
        target: roleRelevances.slug,
        set: { name: row.name, unverified: false },
      });
  }
  for (const row of PRIORITY_TIMESCALES) {
    await db
      .insert(priorityTimescales)
      .values({ slug: row.slug, name: row.name, unverified: false })
      .onConflictDoUpdate({
        target: priorityTimescales.slug,
        set: { name: row.name, unverified: false },
      });
  }
  for (const row of EVIDENCE_TYPES) {
    await db
      .insert(evidenceTypes)
      .values({ slug: row.slug, name: row.name })
      .onConflictDoUpdate({
        target: evidenceTypes.slug,
        set: { name: row.name },
      });
  }
  for (const row of PROGRESS_RATINGS) {
    await db
      .insert(progressRatings)
      .values({ slug: row.slug, name: row.name, weight: row.weight })
      .onConflictDoUpdate({
        target: progressRatings.slug,
        set: { name: row.name, weight: row.weight },
      });
  }
}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 4: Run the existing seed test to confirm it still works for the unchanged axes** (it will fail on the row counts — fixed in the next task)

Run: `pnpm vitest run src/scripts/seed.test.ts`
Expected: the test runs through to completion but the assertion `expect(tRows[0]?.n).toBe(5)` fails because there are now 29 thematic areas. The `eRows` and `pRows` assertions still pass. **This is the expected failure** that we fix in Task 7.

- [ ] **Step 5: Commit** (the test will be updated next)

```bash
git add src/lib/db/seed-taxonomy.ts
git commit -m "feat(seed): seedTaxonomy() seeds every taxonomy axis (themes, purposes, source types, audiences, locations, roles, priorities, evidence, progress)"
```

---

## Task 7: Update the seed test to cover every axis

**Files:**
- Modify: `src/scripts/seed.test.ts`

- [ ] **Step 1: Replace the test with the expanded version**

Replace the entire file content with:

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../tests/helpers/pg-container';
import { applyMigrations } from '../../tests/helpers/migrate';
import { createDb } from '../lib/db/client';
import { seedTaxonomy } from './seed';

let pg: StartedPg;
let client: ReturnType<typeof createDb>;

beforeAll(async () => {
  pg = await startPostgres();
  const migrated = await applyMigrations(pg.url);
  await migrated.sql.end();
  client = createDb(pg.url);
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

describe('seedTaxonomy', () => {
  it('inserts the expected row count for every taxonomy axis', async () => {
    await seedTaxonomy(client.db);
    const themes = await client.sql<{ n: number }[]>`select count(*)::int as n from thematic_areas`;
    expect(themes[0]?.n).toBe(29);
    const purposesRows = await client.sql<{ n: number }[]>`select count(*)::int as n from purposes`;
    expect(purposesRows[0]?.n).toBe(9);
    const types = await client.sql<{ n: number }[]>`select count(*)::int as n from source_types`;
    expect(types[0]?.n).toBe(10);
    const audiences = await client.sql<{ n: number }[]>`select count(*)::int as n from target_audience_types`;
    expect(audiences[0]?.n).toBe(14);
    const locations = await client.sql<{ n: number }[]>`select count(*)::int as n from location_scopes`;
    expect(locations[0]?.n).toBe(5);
    const roles = await client.sql<{ n: number }[]>`select count(*)::int as n from role_relevances`;
    expect(roles[0]?.n).toBe(9);
    const priorities = await client.sql<{ n: number }[]>`select count(*)::int as n from priority_timescales`;
    expect(priorities[0]?.n).toBe(4);
    const evidence = await client.sql<{ n: number }[]>`select count(*)::int as n from evidence_types`;
    expect(evidence[0]?.n).toBe(4);
    const ratings = await client.sql<{ n: number }[]>`select count(*)::int as n from progress_ratings`;
    expect(ratings[0]?.n).toBe(4);
  });

  it('is idempotent — re-running does not duplicate rows or error', async () => {
    await seedTaxonomy(client.db);
    await seedTaxonomy(client.db);
    const rows = await client.sql<{ n: number }[]>`select count(*)::int as n from thematic_areas`;
    expect(rows[0]?.n).toBe(29);
  });

  it('seeds taxonomy rows with unverified=false', async () => {
    await seedTaxonomy(client.db);
    const rows = await client.sql<{ n: number }[]>`select count(*)::int as n from thematic_areas where unverified = true`;
    expect(rows[0]?.n).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `pnpm vitest run src/scripts/seed.test.ts`
Expected: all three tests pass. The first test produces the row-count check for every axis; the second confirms idempotency; the third confirms `unverified=false` on seeded rows.

- [ ] **Step 3: Commit**

```bash
git add src/scripts/seed.test.ts
git commit -m "test(seed): expand seedTaxonomy assertions to cover every taxonomy axis + unverified flag"
```

---

## Task 8: Add taxonomy repo functions for the new axes

**Files:**
- Modify: `src/lib/repositories/taxonomy.ts`
- Create: `src/lib/repositories/taxonomy.test.ts`

The existing `taxonomy.ts` has `listEvidenceTypes` + `listProgressRatings`. We extend it with `list*`, `findBySlugsFor*`, and `resolveOrCreate*` for each of the seven new/expanded axes. The naming is per-axis so callers don't need to thread axis identifiers around.

- [ ] **Step 1: Write the test for `listThematicAreas`**

Create `src/lib/repositories/taxonomy.test.ts` with:

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type DbClient } from '../db/client';
import { seedTaxonomy } from '../db/seed-taxonomy';
import {
  listLocationScopes,
  listPriorityTimescales,
  listPurposes,
  listRoleRelevances,
  listSourceTypes,
  listTargetAudienceTypes,
  listThematicAreas,
  resolveOrCreateLocationScopes,
  resolveOrCreatePriorityTimescales,
  resolveOrCreatePurposes,
  resolveOrCreateRoleRelevances,
  resolveOrCreateSourceTypes,
  resolveOrCreateTargetAudienceTypes,
  resolveOrCreateThematicAreas,
} from './taxonomy';
import type { RepoContext } from './types';

let pg: StartedPg;
let client: DbClient;
let ctx: RepoContext;

beforeAll(async () => {
  pg = await startPostgres();
  const migrated = await applyMigrations(pg.url);
  await migrated.sql.end();
  client = createDb(pg.url);
  await seedTaxonomy(client.db);
  ctx = {
    db: client.db,
    auth: { user: { id: 'system', name: 'system' }, roles: ['admin'], isSystem: true },
  };
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

describe('list* functions', () => {
  it('listThematicAreas returns all 29 seeded rows ordered by name', async () => {
    const rows = await listThematicAreas(ctx);
    expect(rows).toHaveLength(29);
    const names = rows.map((r) => r.name);
    expect(names).toEqual([...names].sort());
    expect(rows[0]).toHaveProperty('slug');
    expect(rows[0]).toHaveProperty('colorHex');
    expect(rows[0]?.unverified).toBe(false);
  });

  it('listPurposes returns 9 seeded rows', async () => {
    const rows = await listPurposes(ctx);
    expect(rows).toHaveLength(9);
  });

  it('listSourceTypes returns 10 seeded rows', async () => {
    expect(await listSourceTypes(ctx)).toHaveLength(10);
  });

  it('listTargetAudienceTypes returns 14 seeded rows', async () => {
    expect(await listTargetAudienceTypes(ctx)).toHaveLength(14);
  });

  it('listLocationScopes returns 5 seeded rows', async () => {
    expect(await listLocationScopes(ctx)).toHaveLength(5);
  });

  it('listRoleRelevances returns 9 seeded rows', async () => {
    expect(await listRoleRelevances(ctx)).toHaveLength(9);
  });

  it('listPriorityTimescales returns 4 seeded rows', async () => {
    expect(await listPriorityTimescales(ctx)).toHaveLength(4);
  });
});

describe('resolveOrCreate*', () => {
  it('returns ids for existing slugs without creating new rows', async () => {
    const before = await listPurposes(ctx);
    const ids = await resolveOrCreatePurposes(ctx, ['strategy', 'advocacy']);
    expect(ids).toHaveLength(2);
    const after = await listPurposes(ctx);
    expect(after).toHaveLength(before.length);
  });

  it('creates unverified rows for unknown slugs and returns their ids', async () => {
    const ids = await resolveOrCreatePurposes(ctx, ['strategy', 'made-up-purpose']);
    expect(ids).toHaveLength(2);
    const all = await listPurposes(ctx);
    const created = all.find((r) => r.slug === 'made-up-purpose');
    expect(created).toBeDefined();
    expect(created?.unverified).toBe(true);
    expect(created?.name).toBe('Made up purpose');
  });

  it('returns ids in the same order as the input slugs', async () => {
    const ids = await resolveOrCreateLocationScopes(ctx, ['regional', 'global', 'local']);
    expect(ids).toHaveLength(3);
    const rows = await listLocationScopes(ctx);
    const bySlug = new Map(rows.map((r) => [r.slug, r.id]));
    expect(ids[0]).toBe(bySlug.get('regional'));
    expect(ids[1]).toBe(bySlug.get('global'));
    expect(ids[2]).toBe(bySlug.get('local'));
  });

  it('deduplicates the input slugs', async () => {
    const ids = await resolveOrCreateSourceTypes(ctx, ['evaluation', 'evaluation', 'case-study']);
    expect(new Set(ids).size).toBe(2);
  });

  it('handles an empty slug array', async () => {
    expect(await resolveOrCreatePurposes(ctx, [])).toEqual([]);
  });

  it('normalises slugs (trim + lowercase) before lookup', async () => {
    const ids = await resolveOrCreatePurposes(ctx, ['  Strategy  ', 'advocacy']);
    expect(ids).toHaveLength(2);
    // 'Strategy' lowercased+trimmed = 'strategy', already exists. No new row.
    const all = await listPurposes(ctx);
    const strategyRows = all.filter((r) => r.slug === 'strategy');
    expect(strategyRows).toHaveLength(1);
  });
});

describe('resolveOrCreateThematicAreas + resolveOrCreateRoleRelevances + resolveOrCreatePriorityTimescales + resolveOrCreateTargetAudienceTypes', () => {
  it('all axes work the same way', async () => {
    expect((await resolveOrCreateThematicAreas(ctx, ['governance'])).length).toBe(1);
    expect((await resolveOrCreateRoleRelevances(ctx, ['policy-maker'])).length).toBe(1);
    expect((await resolveOrCreatePriorityTimescales(ctx, ['urgent'])).length).toBe(1);
    expect((await resolveOrCreateTargetAudienceTypes(ctx, ['funders'])).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm vitest run src/lib/repositories/taxonomy.test.ts`
Expected: import errors — `listThematicAreas` / `listPurposes` / `resolveOrCreatePurposes` etc. do not exist yet.

- [ ] **Step 3: Implement the repo functions**

Replace the entire content of `src/lib/repositories/taxonomy.ts` with:

```typescript
import { asc, inArray } from 'drizzle-orm';
import {
  evidenceTypes,
  locationScopes,
  priorityTimescales,
  progressRatings,
  purposes,
  roleRelevances,
  sourceTypes,
  targetAudienceTypes,
  thematicAreas,
} from '../db/schema';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { RepoContext } from './types';

/**
 * Reusable taxonomy axis row shape. Every taxonomy axis (thematic_areas,
 * purposes, source_types, target_audience_types, location_scopes,
 * role_relevances, priority_timescales) returns rows in this shape from
 * the `list*` functions. `colorHex` is null for axes without a palette;
 * `description` is reserved for future hover-text use.
 */
export type TaxonomyRow = {
  id: string;
  slug: string;
  name: string;
  colorHex: string | null;
  description: string | null;
  unverified: boolean;
};

/**
 * Normalise an LLM-supplied slug: lowercase, trim, collapse runs of
 * whitespace to a single dash. Empty strings are rejected upstream by the
 * `filter` call inside `resolveOrCreate*`.
 */
function normaliseSlug(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Humanise a slug into a default display name when the LLM coins a new tag.
 * 'made-up-purpose' -> 'Made up purpose'. The first letter is capitalised;
 * subsequent dashes become spaces. Admins can rename via /admin/tags.
 */
function humaniseSlug(slug: string): string {
  const spaced = slug.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Generic list-all helper. Returns rows ordered by `name`. Cast through
 * the shared TaxonomyRow shape — every taxonomy table has these columns.
 * Tables without `color_hex` or `description` populated return null.
 */
async function listAxis(ctx: RepoContext, table: PgTable): Promise<TaxonomyRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic taxonomy shape; all tables share these columns
  const t = table as any;
  const rows = await ctx.db
    .select({
      id: t.id,
      slug: t.slug,
      name: t.name,
      colorHex: t.colorHex,
      description: t.description,
      unverified: t.unverified,
    })
    .from(table)
    .orderBy(asc(t.name));
  return rows as TaxonomyRow[];
}

/**
 * Generic resolve-or-create helper. For each input slug:
 *  - normalise it (trim, lowercase)
 *  - skip empties and dedupe
 *  - look up existing rows by slug
 *  - insert missing slugs with `unverified=true` and a humanised name
 *  - return ids in the original input order (deduped)
 */
async function resolveOrCreateAxis(
  ctx: RepoContext,
  table: PgTable,
  slugs: readonly string[],
): Promise<string[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic taxonomy shape; all tables share these columns
  const t = table as any;
  const normalised: string[] = [];
  const seen = new Set<string>();
  for (const raw of slugs) {
    const slug = normaliseSlug(raw);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    normalised.push(slug);
  }
  if (normalised.length === 0) return [];

  const existing = await ctx.db
    .select({ id: t.id, slug: t.slug })
    .from(table)
    .where(inArray(t.slug, normalised));
  const idBySlug = new Map<string, string>(
    (existing as Array<{ id: string; slug: string }>).map((r) => [r.slug, r.id]),
  );

  const missing = normalised.filter((s) => !idBySlug.has(s));
  if (missing.length > 0) {
    const inserted = await ctx.db
      .insert(table)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table generic
      .values(missing.map((slug) => ({ slug, name: humaniseSlug(slug), unverified: true } as any)))
      .returning({ id: t.id, slug: t.slug });
    for (const row of inserted as Array<{ id: string; slug: string }>) {
      idBySlug.set(row.slug, row.id);
    }
  }

  return normalised.map((slug) => idBySlug.get(slug)!);
}

// -- per-axis list functions --------------------------------------------------

export const listThematicAreas = (ctx: RepoContext) => listAxis(ctx, thematicAreas);
export const listPurposes = (ctx: RepoContext) => listAxis(ctx, purposes);
export const listSourceTypes = (ctx: RepoContext) => listAxis(ctx, sourceTypes);
export const listTargetAudienceTypes = (ctx: RepoContext) => listAxis(ctx, targetAudienceTypes);
export const listLocationScopes = (ctx: RepoContext) => listAxis(ctx, locationScopes);
export const listRoleRelevances = (ctx: RepoContext) => listAxis(ctx, roleRelevances);
export const listPriorityTimescales = (ctx: RepoContext) => listAxis(ctx, priorityTimescales);

// -- per-axis resolveOrCreate functions ---------------------------------------

export const resolveOrCreateThematicAreas = (ctx: RepoContext, slugs: readonly string[]) =>
  resolveOrCreateAxis(ctx, thematicAreas, slugs);
export const resolveOrCreatePurposes = (ctx: RepoContext, slugs: readonly string[]) =>
  resolveOrCreateAxis(ctx, purposes, slugs);
export const resolveOrCreateSourceTypes = (ctx: RepoContext, slugs: readonly string[]) =>
  resolveOrCreateAxis(ctx, sourceTypes, slugs);
export const resolveOrCreateTargetAudienceTypes = (ctx: RepoContext, slugs: readonly string[]) =>
  resolveOrCreateAxis(ctx, targetAudienceTypes, slugs);
export const resolveOrCreateLocationScopes = (ctx: RepoContext, slugs: readonly string[]) =>
  resolveOrCreateAxis(ctx, locationScopes, slugs);
export const resolveOrCreateRoleRelevances = (ctx: RepoContext, slugs: readonly string[]) =>
  resolveOrCreateAxis(ctx, roleRelevances, slugs);
export const resolveOrCreatePriorityTimescales = (ctx: RepoContext, slugs: readonly string[]) =>
  resolveOrCreateAxis(ctx, priorityTimescales, slugs);

// -- pre-existing functions (kept) --------------------------------------------

export async function listEvidenceTypes(
  ctx: RepoContext,
): Promise<Array<{ slug: string; name: string }>> {
  const rows = await ctx.db
    .select({ slug: evidenceTypes.slug, name: evidenceTypes.name })
    .from(evidenceTypes)
    .orderBy(asc(evidenceTypes.name));
  return rows;
}

export async function listProgressRatings(
  ctx: RepoContext,
): Promise<Array<{ slug: string; name: string; weight: number }>> {
  const rows = await ctx.db
    .select({
      slug: progressRatings.slug,
      name: progressRatings.name,
      weight: progressRatings.weight,
    })
    .from(progressRatings)
    .orderBy(asc(progressRatings.weight));
  return rows;
}
```

- [ ] **Step 4: Re-run the test**

Run: `pnpm vitest run src/lib/repositories/taxonomy.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Typecheck the whole project**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/repositories/taxonomy.ts src/lib/repositories/taxonomy.test.ts
git commit -m "feat(repo): list/resolveOrCreate for every taxonomy axis with unverified auto-create"
```

---

## Task 9: M2M repo for the sources side

**Files:**
- Create: `src/lib/repositories/source-tags.ts`
- Create: `src/lib/repositories/source-tags.test.ts`

The M2M operations are uniform across axes; we expose one function per `(parent_axis)` pair: `replaceForSource{Axis}` (set the full membership for a source), plus `listFor{Axis}` for one composite read. PR 2's extract handler uses `replaceForSource*` to refresh tag membership on each re-extract; the edit page in PR 3 uses the same call.

- [ ] **Step 1: Write the failing test**

Create `src/lib/repositories/source-tags.test.ts`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type DbClient } from '../db/client';
import { seedTaxonomy } from '../db/seed-taxonomy';
import { sources } from '../db/schema';
import {
  listSourcePurposes,
  listSourceRoleRelevances,
  listSourceSourceTypes,
  listSourceTargetAudienceTypes,
  listSourceThematicAreas,
  replaceSourcePurposes,
  replaceSourceRoleRelevances,
  replaceSourceSourceTypes,
  replaceSourceTargetAudienceTypes,
  replaceSourceThematicAreas,
} from './source-tags';
import {
  resolveOrCreatePurposes,
  resolveOrCreateRoleRelevances,
  resolveOrCreateSourceTypes,
  resolveOrCreateTargetAudienceTypes,
  resolveOrCreateThematicAreas,
} from './taxonomy';
import type { RepoContext } from './types';

let pg: StartedPg;
let client: DbClient;
let ctx: RepoContext;
let sourceId: string;

beforeAll(async () => {
  pg = await startPostgres();
  const migrated = await applyMigrations(pg.url);
  await migrated.sql.end();
  client = createDb(pg.url);
  await seedTaxonomy(client.db);
  ctx = {
    db: client.db,
    auth: { user: { id: 'system', name: 'system' }, roles: ['admin'], isSystem: true },
  };
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

beforeEach(async () => {
  const [s] = await client.db
    .insert(sources)
    .values({ slug: `src-${Math.random().toString(36).slice(2, 10)}`, title: 'Test source' })
    .returning({ id: sources.id });
  if (!s) throw new Error('seed: source insert returned no row');
  sourceId = s.id;
});

describe('replace + list — thematic areas', () => {
  it('replaceSourceThematicAreas attaches ids; listSourceThematicAreas returns them ordered by name', async () => {
    const ids = await resolveOrCreateThematicAreas(ctx, ['governance', 'data']);
    await replaceSourceThematicAreas(ctx, sourceId, ids);
    const rows = await listSourceThematicAreas(ctx, sourceId);
    expect(rows.map((r) => r.slug)).toEqual(['data', 'governance']);
    expect(rows[0]?.colorHex).toBeTruthy();
  });

  it('replaceSourceThematicAreas with [] detaches all existing rows', async () => {
    const ids = await resolveOrCreateThematicAreas(ctx, ['governance']);
    await replaceSourceThematicAreas(ctx, sourceId, ids);
    expect(await listSourceThematicAreas(ctx, sourceId)).toHaveLength(1);
    await replaceSourceThematicAreas(ctx, sourceId, []);
    expect(await listSourceThematicAreas(ctx, sourceId)).toHaveLength(0);
  });

  it('replaceSourceThematicAreas computes a diff (only new ids are inserted, only missing ids deleted)', async () => {
    const first = await resolveOrCreateThematicAreas(ctx, ['governance', 'data']);
    await replaceSourceThematicAreas(ctx, sourceId, first);
    const second = await resolveOrCreateThematicAreas(ctx, ['governance', 'philanthropy']);
    await replaceSourceThematicAreas(ctx, sourceId, second);
    const rows = await listSourceThematicAreas(ctx, sourceId);
    expect(rows.map((r) => r.slug).sort()).toEqual(['governance', 'philanthropy']);
  });
});

describe('replace + list — other axes', () => {
  it('source_types', async () => {
    const ids = await resolveOrCreateSourceTypes(ctx, ['evaluation', 'case-study']);
    await replaceSourceSourceTypes(ctx, sourceId, ids);
    const rows = await listSourceSourceTypes(ctx, sourceId);
    expect(rows.map((r) => r.slug).sort()).toEqual(['case-study', 'evaluation']);
  });

  it('purposes', async () => {
    const ids = await resolveOrCreatePurposes(ctx, ['strategy']);
    await replaceSourcePurposes(ctx, sourceId, ids);
    expect(await listSourcePurposes(ctx, sourceId)).toHaveLength(1);
  });

  it('role_relevances', async () => {
    const ids = await resolveOrCreateRoleRelevances(ctx, ['practitioner', 'funder']);
    await replaceSourceRoleRelevances(ctx, sourceId, ids);
    expect(await listSourceRoleRelevances(ctx, sourceId)).toHaveLength(2);
  });

  it('target_audience_types', async () => {
    const ids = await resolveOrCreateTargetAudienceTypes(ctx, ['funders']);
    await replaceSourceTargetAudienceTypes(ctx, sourceId, ids);
    expect(await listSourceTargetAudienceTypes(ctx, sourceId)).toHaveLength(1);
  });
});

describe('source deletion cascades the M2M rows', () => {
  it('removes all sources_thematic_areas rows when the source is deleted', async () => {
    const ids = await resolveOrCreateThematicAreas(ctx, ['governance', 'data']);
    await replaceSourceThematicAreas(ctx, sourceId, ids);
    await client.sql`delete from sources where id = ${sourceId}`;
    const remaining = await client.sql<{ n: number }[]>`select count(*)::int as n from sources_thematic_areas where source_id = ${sourceId}`;
    expect(remaining[0]?.n).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm vitest run src/lib/repositories/source-tags.test.ts`
Expected: import errors — none of the `replaceSource*` / `listSource*` functions exist yet.

- [ ] **Step 3: Implement `source-tags.ts`**

Create `src/lib/repositories/source-tags.ts`:

```typescript
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import {
  purposes,
  roleRelevances,
  sourceTypes,
  sourcesPurposes,
  sourcesRoleRelevances,
  sourcesSourceTypes,
  sourcesTargetAudienceTypes,
  sourcesThematicAreas,
  targetAudienceTypes,
  thematicAreas,
} from '../db/schema';
import type { TaxonomyRow } from './taxonomy';
import type { RepoContext } from './types';

/**
 * Replace the membership of a many-to-many table for a single parent
 * (a source row). Computes a diff against existing rows: deletes the ones
 * that are no longer present, inserts the new ones. Single transaction.
 *
 * Generic over the join table + the parent / axis column names so each
 * axis can call this with one binding.
 */
async function replaceMembership(
  ctx: RepoContext,
  opts: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic m2m table
    table: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic m2m table column
    parentColumn: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic m2m table column
    axisColumn: any;
    parentId: string;
    axisIds: readonly string[];
  },
): Promise<void> {
  const { table, parentColumn, axisColumn, parentId, axisIds } = opts;
  await ctx.db.transaction(async (tx) => {
    const existing = (await tx
      .select({ axisId: axisColumn })
      .from(table)
      .where(eq(parentColumn, parentId))) as Array<{ axisId: string }>;
    const existingSet = new Set(existing.map((r) => r.axisId));
    const desired = new Set(axisIds);
    const toAdd = [...desired].filter((id) => !existingSet.has(id));
    const toRemove = [...existingSet].filter((id) => !desired.has(id));
    if (toRemove.length > 0) {
      await tx
        .delete(table)
        .where(and(eq(parentColumn, parentId), inArray(axisColumn, toRemove)));
    }
    if (toAdd.length > 0) {
      await tx
        .insert(table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shape is { parentColumn.name, axisColumn.name }
        .values(toAdd.map((id) => ({ [parentColumn.name]: parentId, [axisColumn.name]: id } as any)));
    }
  });
}

/**
 * Read the current membership of an axis for a source, joined back to the
 * reference table so the caller gets full tag rows (id/slug/name/colorHex/
 * unverified). Ordered by name for stable display.
 */
async function listMembership(
  ctx: RepoContext,
  opts: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic
    joinTable: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic
    refTable: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic
    parentColumn: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic
    axisColumn: any;
    parentId: string;
  },
): Promise<TaxonomyRow[]> {
  const { joinTable, refTable, parentColumn, axisColumn, parentId } = opts;
  const rows = await ctx.db
    .select({
      id: refTable.id,
      slug: refTable.slug,
      name: refTable.name,
      colorHex: refTable.colorHex,
      description: refTable.description,
      unverified: refTable.unverified,
    })
    .from(joinTable)
    .innerJoin(refTable, eq(axisColumn, refTable.id))
    .where(eq(parentColumn, parentId))
    .orderBy(asc(refTable.name));
  return rows as TaxonomyRow[];
}

// -- thematic areas ---------------------------------------------------------

export const replaceSourceThematicAreas = (
  ctx: RepoContext,
  sourceId: string,
  axisIds: readonly string[],
) =>
  replaceMembership(ctx, {
    table: sourcesThematicAreas,
    parentColumn: sourcesThematicAreas.sourceId,
    axisColumn: sourcesThematicAreas.thematicAreaId,
    parentId: sourceId,
    axisIds,
  });

export const listSourceThematicAreas = (ctx: RepoContext, sourceId: string) =>
  listMembership(ctx, {
    joinTable: sourcesThematicAreas,
    refTable: thematicAreas,
    parentColumn: sourcesThematicAreas.sourceId,
    axisColumn: sourcesThematicAreas.thematicAreaId,
    parentId: sourceId,
  });

// -- source types -----------------------------------------------------------

export const replaceSourceSourceTypes = (
  ctx: RepoContext,
  sourceId: string,
  axisIds: readonly string[],
) =>
  replaceMembership(ctx, {
    table: sourcesSourceTypes,
    parentColumn: sourcesSourceTypes.sourceId,
    axisColumn: sourcesSourceTypes.sourceTypeId,
    parentId: sourceId,
    axisIds,
  });

export const listSourceSourceTypes = (ctx: RepoContext, sourceId: string) =>
  listMembership(ctx, {
    joinTable: sourcesSourceTypes,
    refTable: sourceTypes,
    parentColumn: sourcesSourceTypes.sourceId,
    axisColumn: sourcesSourceTypes.sourceTypeId,
    parentId: sourceId,
  });

// -- purposes ---------------------------------------------------------------

export const replaceSourcePurposes = (
  ctx: RepoContext,
  sourceId: string,
  axisIds: readonly string[],
) =>
  replaceMembership(ctx, {
    table: sourcesPurposes,
    parentColumn: sourcesPurposes.sourceId,
    axisColumn: sourcesPurposes.purposeId,
    parentId: sourceId,
    axisIds,
  });

export const listSourcePurposes = (ctx: RepoContext, sourceId: string) =>
  listMembership(ctx, {
    joinTable: sourcesPurposes,
    refTable: purposes,
    parentColumn: sourcesPurposes.sourceId,
    axisColumn: sourcesPurposes.purposeId,
    parentId: sourceId,
  });

// -- role relevances --------------------------------------------------------

export const replaceSourceRoleRelevances = (
  ctx: RepoContext,
  sourceId: string,
  axisIds: readonly string[],
) =>
  replaceMembership(ctx, {
    table: sourcesRoleRelevances,
    parentColumn: sourcesRoleRelevances.sourceId,
    axisColumn: sourcesRoleRelevances.roleRelevanceId,
    parentId: sourceId,
    axisIds,
  });

export const listSourceRoleRelevances = (ctx: RepoContext, sourceId: string) =>
  listMembership(ctx, {
    joinTable: sourcesRoleRelevances,
    refTable: roleRelevances,
    parentColumn: sourcesRoleRelevances.sourceId,
    axisColumn: sourcesRoleRelevances.roleRelevanceId,
    parentId: sourceId,
  });

// -- target audience types --------------------------------------------------

export const replaceSourceTargetAudienceTypes = (
  ctx: RepoContext,
  sourceId: string,
  axisIds: readonly string[],
) =>
  replaceMembership(ctx, {
    table: sourcesTargetAudienceTypes,
    parentColumn: sourcesTargetAudienceTypes.sourceId,
    axisColumn: sourcesTargetAudienceTypes.targetAudienceTypeId,
    parentId: sourceId,
    axisIds,
  });

export const listSourceTargetAudienceTypes = (ctx: RepoContext, sourceId: string) =>
  listMembership(ctx, {
    joinTable: sourcesTargetAudienceTypes,
    refTable: targetAudienceTypes,
    parentColumn: sourcesTargetAudienceTypes.sourceId,
    axisColumn: sourcesTargetAudienceTypes.targetAudienceTypeId,
    parentId: sourceId,
  });
```

- [ ] **Step 4: Re-run the test**

Run: `pnpm vitest run src/lib/repositories/source-tags.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repositories/source-tags.ts src/lib/repositories/source-tags.test.ts
git commit -m "feat(repo): source-side M2M membership (replace*/list*) for themes, source_types, purposes, role_relevances, target_audience_types"
```

---

## Task 10: M2M repo for the recommendations side

**Files:**
- Create: `src/lib/repositories/recommendation-tags.ts`
- Create: `src/lib/repositories/recommendation-tags.test.ts`

Same shape as source-tags but for recommendations. Three new axes (purposes, target_audience_types, location_scopes) plus the existing thematic_areas axis. The existing `recommendations_thematic_areas` table is reused — we add `replaceRecommendationThematicAreas` + `listRecommendationThematicAreas` to the new repo file so all M2M operations on recommendations are in one place; the extract handler in PR 2 will be re-wired to call these.

- [ ] **Step 1: Write the failing test**

Create `src/lib/repositories/recommendation-tags.test.ts`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type DbClient } from '../db/client';
import { seedTaxonomy } from '../db/seed-taxonomy';
import { recommendations, sources } from '../db/schema';
import {
  listRecommendationLocationScopes,
  listRecommendationPurposes,
  listRecommendationTargetAudienceTypes,
  listRecommendationThematicAreas,
  replaceRecommendationLocationScopes,
  replaceRecommendationPurposes,
  replaceRecommendationTargetAudienceTypes,
  replaceRecommendationThematicAreas,
} from './recommendation-tags';
import {
  resolveOrCreateLocationScopes,
  resolveOrCreatePurposes,
  resolveOrCreateTargetAudienceTypes,
  resolveOrCreateThematicAreas,
} from './taxonomy';
import type { RepoContext } from './types';

let pg: StartedPg;
let client: DbClient;
let ctx: RepoContext;
let recId: string;

beforeAll(async () => {
  pg = await startPostgres();
  const migrated = await applyMigrations(pg.url);
  await migrated.sql.end();
  client = createDb(pg.url);
  await seedTaxonomy(client.db);
  ctx = {
    db: client.db,
    auth: { user: { id: 'system', name: 'system' }, roles: ['admin'], isSystem: true },
  };
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

beforeEach(async () => {
  const [s] = await client.db
    .insert(sources)
    .values({ slug: `src-${Math.random().toString(36).slice(2, 10)}`, title: 'Test source' })
    .returning({ id: sources.id });
  if (!s) throw new Error('seed: source insert returned no row');
  const [r] = await client.db
    .insert(recommendations)
    .values({
      sourceId: s.id,
      slug: `rec-${Math.random().toString(36).slice(2, 10)}`,
      title: 'Test recommendation',
      body: 'Body that is at least twenty chars long for the schema.',
    })
    .returning({ id: recommendations.id });
  if (!r) throw new Error('seed: recommendation insert returned no row');
  recId = r.id;
});

describe('replace + list — recommendation thematic areas', () => {
  it('replace + list round-trips', async () => {
    const ids = await resolveOrCreateThematicAreas(ctx, ['governance', 'data']);
    await replaceRecommendationThematicAreas(ctx, recId, ids);
    const rows = await listRecommendationThematicAreas(ctx, recId);
    expect(rows.map((r) => r.slug)).toEqual(['data', 'governance']);
  });

  it('diff replaces correctly', async () => {
    const first = await resolveOrCreateThematicAreas(ctx, ['governance', 'data']);
    await replaceRecommendationThematicAreas(ctx, recId, first);
    const second = await resolveOrCreateThematicAreas(ctx, ['philanthropy']);
    await replaceRecommendationThematicAreas(ctx, recId, second);
    const rows = await listRecommendationThematicAreas(ctx, recId);
    expect(rows.map((r) => r.slug)).toEqual(['philanthropy']);
  });
});

describe('replace + list — recommendation other axes', () => {
  it('purposes', async () => {
    const ids = await resolveOrCreatePurposes(ctx, ['strategy', 'advocacy']);
    await replaceRecommendationPurposes(ctx, recId, ids);
    expect(await listRecommendationPurposes(ctx, recId)).toHaveLength(2);
  });

  it('target_audience_types', async () => {
    const ids = await resolveOrCreateTargetAudienceTypes(ctx, ['funders', 'general-public']);
    await replaceRecommendationTargetAudienceTypes(ctx, recId, ids);
    expect(await listRecommendationTargetAudienceTypes(ctx, recId)).toHaveLength(2);
  });

  it('location_scopes', async () => {
    const ids = await resolveOrCreateLocationScopes(ctx, ['national']);
    await replaceRecommendationLocationScopes(ctx, recId, ids);
    expect(await listRecommendationLocationScopes(ctx, recId)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm vitest run src/lib/repositories/recommendation-tags.test.ts`
Expected: import errors.

- [ ] **Step 3: Implement `recommendation-tags.ts`**

Create `src/lib/repositories/recommendation-tags.ts`:

```typescript
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  locationScopes,
  purposes,
  recommendationsLocationScopes,
  recommendationsPurposes,
  recommendationsTargetAudienceTypes,
  recommendationsThematicAreas,
  targetAudienceTypes,
  thematicAreas,
} from '../db/schema';
import type { TaxonomyRow } from './taxonomy';
import type { RepoContext } from './types';

/**
 * Replace the M2M membership for a recommendation on a single axis.
 * Mirrors `source-tags.ts::replaceMembership` — diff existing vs desired
 * in one transaction.
 */
async function replaceMembership(
  ctx: RepoContext,
  opts: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic m2m table
    table: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic m2m table column
    parentColumn: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic m2m table column
    axisColumn: any;
    parentId: string;
    axisIds: readonly string[];
  },
): Promise<void> {
  const { table, parentColumn, axisColumn, parentId, axisIds } = opts;
  await ctx.db.transaction(async (tx) => {
    const existing = (await tx
      .select({ axisId: axisColumn })
      .from(table)
      .where(eq(parentColumn, parentId))) as Array<{ axisId: string }>;
    const existingSet = new Set(existing.map((r) => r.axisId));
    const desired = new Set(axisIds);
    const toAdd = [...desired].filter((id) => !existingSet.has(id));
    const toRemove = [...existingSet].filter((id) => !desired.has(id));
    if (toRemove.length > 0) {
      await tx
        .delete(table)
        .where(and(eq(parentColumn, parentId), inArray(axisColumn, toRemove)));
    }
    if (toAdd.length > 0) {
      await tx
        .insert(table)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- shape is { parentColumn.name, axisColumn.name }
        .values(toAdd.map((id) => ({ [parentColumn.name]: parentId, [axisColumn.name]: id } as any)));
    }
  });
}

async function listMembership(
  ctx: RepoContext,
  opts: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic
    joinTable: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic
    refTable: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic
    parentColumn: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic
    axisColumn: any;
    parentId: string;
  },
): Promise<TaxonomyRow[]> {
  const { joinTable, refTable, parentColumn, axisColumn, parentId } = opts;
  const rows = await ctx.db
    .select({
      id: refTable.id,
      slug: refTable.slug,
      name: refTable.name,
      colorHex: refTable.colorHex,
      description: refTable.description,
      unverified: refTable.unverified,
    })
    .from(joinTable)
    .innerJoin(refTable, eq(axisColumn, refTable.id))
    .where(eq(parentColumn, parentId))
    .orderBy(asc(refTable.name));
  return rows as TaxonomyRow[];
}

// -- thematic areas ---------------------------------------------------------

export const replaceRecommendationThematicAreas = (
  ctx: RepoContext,
  recId: string,
  axisIds: readonly string[],
) =>
  replaceMembership(ctx, {
    table: recommendationsThematicAreas,
    parentColumn: recommendationsThematicAreas.recommendationId,
    axisColumn: recommendationsThematicAreas.thematicAreaId,
    parentId: recId,
    axisIds,
  });

export const listRecommendationThematicAreas = (ctx: RepoContext, recId: string) =>
  listMembership(ctx, {
    joinTable: recommendationsThematicAreas,
    refTable: thematicAreas,
    parentColumn: recommendationsThematicAreas.recommendationId,
    axisColumn: recommendationsThematicAreas.thematicAreaId,
    parentId: recId,
  });

// -- purposes ---------------------------------------------------------------

export const replaceRecommendationPurposes = (
  ctx: RepoContext,
  recId: string,
  axisIds: readonly string[],
) =>
  replaceMembership(ctx, {
    table: recommendationsPurposes,
    parentColumn: recommendationsPurposes.recommendationId,
    axisColumn: recommendationsPurposes.purposeId,
    parentId: recId,
    axisIds,
  });

export const listRecommendationPurposes = (ctx: RepoContext, recId: string) =>
  listMembership(ctx, {
    joinTable: recommendationsPurposes,
    refTable: purposes,
    parentColumn: recommendationsPurposes.recommendationId,
    axisColumn: recommendationsPurposes.purposeId,
    parentId: recId,
  });

// -- target audience types --------------------------------------------------

export const replaceRecommendationTargetAudienceTypes = (
  ctx: RepoContext,
  recId: string,
  axisIds: readonly string[],
) =>
  replaceMembership(ctx, {
    table: recommendationsTargetAudienceTypes,
    parentColumn: recommendationsTargetAudienceTypes.recommendationId,
    axisColumn: recommendationsTargetAudienceTypes.targetAudienceTypeId,
    parentId: recId,
    axisIds,
  });

export const listRecommendationTargetAudienceTypes = (ctx: RepoContext, recId: string) =>
  listMembership(ctx, {
    joinTable: recommendationsTargetAudienceTypes,
    refTable: targetAudienceTypes,
    parentColumn: recommendationsTargetAudienceTypes.recommendationId,
    axisColumn: recommendationsTargetAudienceTypes.targetAudienceTypeId,
    parentId: recId,
  });

// -- location scopes --------------------------------------------------------

export const replaceRecommendationLocationScopes = (
  ctx: RepoContext,
  recId: string,
  axisIds: readonly string[],
) =>
  replaceMembership(ctx, {
    table: recommendationsLocationScopes,
    parentColumn: recommendationsLocationScopes.recommendationId,
    axisColumn: recommendationsLocationScopes.locationScopeId,
    parentId: recId,
    axisIds,
  });

export const listRecommendationLocationScopes = (ctx: RepoContext, recId: string) =>
  listMembership(ctx, {
    joinTable: recommendationsLocationScopes,
    refTable: locationScopes,
    parentColumn: recommendationsLocationScopes.recommendationId,
    axisColumn: recommendationsLocationScopes.locationScopeId,
    parentId: recId,
  });
```

- [ ] **Step 4: Re-run the test**

Run: `pnpm vitest run src/lib/repositories/recommendation-tags.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/repositories/recommendation-tags.ts src/lib/repositories/recommendation-tags.test.ts
git commit -m "feat(repo): recommendation-side M2M membership (replace*/list*) for themes, purposes, target_audience_types, location_scopes"
```

---

## Task 11: Final verification

- [ ] **Step 1: Tear down + bring up Postgres clean**

Run:
```bash
docker compose down -v
docker compose up -d postgres
# wait briefly for healthy
for i in $(seq 1 20); do docker exec open-recs-local-postgres-1 pg_isready -U postgres -d openrecs 2>/dev/null && break; sleep 0.5; done
```
Expected: `accepting connections`.

- [ ] **Step 2: Apply migrations + seed**

Run:
```bash
set -a; source .env; set +a
pnpm db:migrate
pnpm db:seed
```
Expected: `migrations applied`, then `taxonomy seeded`.

- [ ] **Step 3: Run the full verify pipeline**

Run: `pnpm verify`
Expected: typecheck, lint, vitest (all 95+ files now), build all pass. The total test count should be 451 (existing) + 7 (seed test cases expanded) + ~15 (new taxonomy tests) + ~10 (source-tags tests) + ~5 (recommendation-tags tests) ≈ 488. Exact number doesn't matter; what matters is 0 errors and no skipped tests.

- [ ] **Step 4: Push the branch**

Run: `git push -u origin feat/extraction-tagging-schema`
Expected: branch pushed; gh prints the PR creation URL.

- [ ] **Step 5: Open the PR**

Run:
```bash
gh pr create --base master --title "feat: extraction-tagging-rebuild — schema + taxonomy seed + repos (PR 1)" --body "$(cat <<'EOF'
## Summary

PR 1 of 3 implementing the extraction-and-tagging rebuild. See `docs/superpowers/specs/2026-05-12-extraction-and-tagging-rebuild-design.md` for the full design.

This PR ships purely the data layer — no extraction logic changes, no UI changes. PR 2 wires the new schema into the extract handler; PR 3 builds the edit pages.

### Schema (migrations 0007-0010)

- **Reference tables**: \`purposes\` (9), \`source_types\` (10), \`target_audience_types\` (14), \`location_scopes\` (5), \`role_relevances\` (9), \`priority_timescales\` (4). All share the same shape (\`id\`, \`slug\`, \`name\`, \`colorHex?\`, \`description?\`, \`unverified BOOL\`).
- **\`thematic_areas\`** gains an \`unverified\` column. Expanded from 5 seeded items to **29** (v1's full default list).
- **\`sources\`** gains \`summary\`, \`authors text[]\`, \`publication_date\`, \`org_owner\`, \`original_url\`, \`attachment_url\`, \`datasets jsonb\`.
- **\`recommendations\`** gains \`target_organization\`, \`priority_timescale_id\` (FK), \`notes\`, \`confidence\` (high/med/low).
- **8 new M2M tables**: \`sources_thematic_areas\`, \`sources_source_types\`, \`sources_purposes\`, \`sources_role_relevances\`, \`sources_target_audience_types\`, \`recommendations_purposes\`, \`recommendations_target_audience_types\`, \`recommendations_location_scopes\`. Each has a composite PK and an axis-side index for reverse lookup.

### Repos

- **\`src/lib/repositories/taxonomy.ts\`** gains \`list*\` and \`resolveOrCreate*\` for every axis. \`resolveOrCreate*\` auto-creates unknown slugs with \`unverified=true\` and a humanised default name, so PR 2's extract handler can let the LLM grow the taxonomy without crashing on unfamiliar slugs.
- **\`src/lib/repositories/source-tags.ts\`** (new) — \`replaceSource*\` and \`listSource*\` for all five source-side M2Ms.
- **\`src/lib/repositories/recommendation-tags.ts\`** (new) — \`replaceRecommendation*\` and \`listRecommendation*\` for all four rec-side M2Ms.

### Seed

\`seedTaxonomy()\` seeds every axis idempotently. Seeded rows always have \`unverified=false\`.

## Test plan

- [x] \`pnpm verify\` — typecheck, lint, all tests (Testcontainers-backed for the new repos), build, all green.
- [ ] Spot-check on a clean db: \`docker compose down -v && docker compose up -d postgres && pnpm db:migrate && pnpm db:seed\` lands without error; \`select count(*) from purposes\` returns 9, etc.

## Out of scope (lands in PR 2 / PR 3)

- Extract handler rewrite (two-pass, section-aware, populates the new fields).
- \`/sources/[slug]/edit\` + \`/recommendations/[id]/edit\` pages.
- \`/admin/tags\` review queue.
- Tag chips on existing pages.
EOF
)"
```

- [ ] **Step 6: Confirm the PR is open and CI runs**

Run: `gh pr view --json url,statusCheckRollup | head -20`
Expected: PR URL printed; CI's `verify` and `e2e` jobs start.

---

## Notes for the executor

- **Drizzle migration generation** prompts you (`pnpm db:generate`) for tag names when ambiguous. Use the suggested slug (e.g. `add_taxonomy_reference_tables`) when prompted — the slug is cosmetic.
- **Tests use Testcontainers** which spins up a fresh Postgres per test file (~15-30s per file). Run them via `pnpm vitest run src/lib/repositories/<file>.test.ts` to iterate on a single file.
- **No schema rollback** is needed in this plan — Drizzle migrations are forward-only. If a migration is wrong, fix the schema, drop the generated migration + snapshot, and regenerate.
- **Lint warnings about `any`** in the M2M helpers are deliberate. Drizzle's `PgTable` types don't compose cleanly with generic column references; the casts are scoped to the helper internals and the public API is fully typed via `TaxonomyRow` + concrete column names per export.
- **If the existing tests break** during this PR — particularly `pipeline.e2e.test.ts`, `hosted-mode.smoke.test.ts`, or anything that runs migrations — the most likely cause is a Drizzle generation issue. Re-read the generated SQL and compare against what was intended.
