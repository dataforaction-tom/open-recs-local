# Phase 10b — UI Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface source metadata in the list and detail views, give tag chips category context, and let users filter recommendations across every tagged axis.

**Architecture:** Server components read through the repository layer with a `RepoContext` (auth-visibility filter preserved). New filter SQL uses `EXISTS`-per-axis predicates (rec-level axes key on `r.id`; source type / role relevance key on `r.source_id`). Filter UI reuses the existing `TagMultiSelect`; URL state stays string-only via comma-joined slug lists.

**Tech Stack:** Next.js App Router (RSC), Drizzle + raw `sql`, Postgres (pgvector pg16) via Testcontainers, Vitest + Testing Library, Tailwind v4 (editorial design system: `eyebrow`, `ref`, `rule`, `paper-2`).

**Spec:** `docs/superpowers/specs/2026-05-31-phase-10b-ui-enhancements-design.md`

**Per-task definition of done:** `pnpm verify` (typecheck + lint + vitest + build) is green before each commit. Conventional commit prefixes, no Claude attribution.

---

## Task 1: Source-list metadata (query)

**Files:**
- Modify: `src/lib/repositories/jobs-list.ts` (the `RecentSource` type + `listRecentSources`)
- Test: `src/lib/repositories/jobs-list.test.ts`

- [ ] **Step 1: Write the failing test**

Add this `describe` block to `src/lib/repositories/jobs-list.test.ts` (after the existing `listRecentSources` block). It uses the file's existing `client`, `ctx()`, and `sources` import; add the new schema imports at the top of the file: `recommendations, thematicAreas, sourcesThematicAreas`.

```ts
import {
  recommendations,
  sources,
  sourcesThematicAreas,
  thematicAreas,
} from '../db/schema';

// ... existing tests ...

describe('listRecentSources — metadata', () => {
  it('returns recCount, summary, and primaryTheme', async () => {
    const [src] = await client.db
      .insert(sources)
      .values({ slug: 'meta-src', title: 'Meta Source', summary: 'A short summary.', isPrivate: false })
      .returning({ id: sources.id });
    const sourceId = src!.id;

    await client.db.insert(recommendations).values([
      { sourceId, slug: 'meta-rec-1', title: 'Rec one', body: 'Body text long enough to be valid.' },
      { sourceId, slug: 'meta-rec-2', title: 'Rec two', body: 'Body text long enough to be valid.' },
    ]);

    const [theme] = await client.db
      .insert(thematicAreas)
      .values({ slug: 'meta-theme', name: 'Zeta Theme', unverified: false })
      .returning({ id: thematicAreas.id });
    await client.db
      .insert(sourcesThematicAreas)
      .values({ sourceId, thematicAreaId: theme!.id });

    const rows = await listRecentSources(ctx(), { limit: 50 });
    const row = rows.find((r) => r.slug === 'meta-src');
    expect(row).toBeDefined();
    expect(row!.recCount).toBe(2);
    expect(row!.summary).toBe('A short summary.');
    expect(row!.primaryTheme).toBe('Zeta Theme');
  });

  it('returns recCount 0 and null primaryTheme for a bare source', async () => {
    await client.db
      .insert(sources)
      .values({ slug: 'bare-src', title: 'Bare', isPrivate: false });
    const rows = await listRecentSources(ctx(), { limit: 50 });
    const row = rows.find((r) => r.slug === 'bare-src');
    expect(row!.recCount).toBe(0);
    expect(row!.primaryTheme).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/repositories/jobs-list.test.ts -t "metadata"`
Expected: FAIL — `row.recCount` is `undefined` (property does not exist yet).

- [ ] **Step 3: Extend the `RecentSource` type and query**

In `src/lib/repositories/jobs-list.ts`, replace the `RecentSource` type:

```ts
export type RecentSource = {
  id: string;
  slug: string;
  title: string;
  status: string;
  createdAt: Date;
  recCount: number;
  summary: string | null;
  primaryTheme: string | null;
};
```

Replace the `SELECT … LIMIT` query body inside `listRecentSources` with:

```ts
  const rows = await ctx.db.execute<{
    id: string;
    slug: string;
    title: string;
    status: string;
    createdAt: Date | string;
    summary: string | null;
    recCount: number;
    primaryTheme: string | null;
  }>(sql`
    SELECT
      s.id::text   AS "id",
      s.slug       AS "slug",
      s.title      AS "title",
      s.status     AS "status",
      s.created_at AS "createdAt",
      s.summary    AS "summary",
      (SELECT count(*)::int FROM recommendations r WHERE r.source_id = s.id) AS "recCount",
      (
        SELECT ta.name
        FROM sources_thematic_areas sta
        JOIN thematic_areas ta ON ta.id = sta.thematic_area_id
        WHERE sta.source_id = s.id
        ORDER BY ta.name
        LIMIT 1
      ) AS "primaryTheme"
    FROM ${sources} s
    WHERE ${authFilter}
    ORDER BY s.created_at DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    summary: row.summary,
    recCount: row.recCount,
    primaryTheme: row.primaryTheme,
  }));
```

`count(*)::int` is required so postgres-js returns a JS number, not a bigint string.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/repositories/jobs-list.test.ts -t "metadata"`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/repositories/jobs-list.ts src/lib/repositories/jobs-list.test.ts
git commit -m "feat(sources): add recCount, summary, primaryTheme to source list query"
```

---

## Task 2: Source-list metadata (UI)

**Files:**
- Modify: `src/app/(app)/sources/page.tsx`

No new test — this is a server-component render change covered by the Task 1 query test and the build. Keep the change minimal and within the existing grid.

- [ ] **Step 1: Add a summary-excerpt helper**

In `src/app/(app)/sources/page.tsx`, add near `formatDate`:

```ts
function excerpt(text: string | null, max = 120): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}
```

- [ ] **Step 2: Render metadata in each list item**

Replace the `<li>` body (the `<div className="min-w-0">` block and the trailing date/status spans) with this structure. The grid columns stay `[1fr_auto_8rem]`; metadata goes under the title in the first column:

```tsx
<li
  key={source.id}
  className="grid grid-cols-[1fr_auto_8rem] items-baseline gap-6 py-4"
>
  <div className="min-w-0 space-y-1">
    <Link
      href={`/sources/${source.slug}`}
      className="text-lg underline-offset-4 hover:text-accent hover:underline"
    >
      {source.title}
    </Link>
    {excerpt(source.summary) && (
      <p className="font-serif text-sm italic leading-relaxed text-foreground/75">
        {excerpt(source.summary)}
      </p>
    )}
    <div className="flex flex-wrap items-center gap-3">
      <span className="eyebrow">
        {source.recCount} {source.recCount === 1 ? 'recommendation' : 'recommendations'}
      </span>
      {source.primaryTheme && (
        <span className="inline-flex items-center border border-rule border-l-[3px] border-l-accent bg-paper-2 px-2 py-0.5 font-mono text-[11px]">
          {source.primaryTheme}
        </span>
      )}
    </div>
  </div>
  <span className="ref tabular-nums">{formatDate(new Date(source.createdAt))}</span>
  <span className="status justify-self-end" data-state={statusKey(source.status as SourceStatus)}>
    {STATUS_LABEL[source.status as SourceStatus] ?? source.status}
  </span>
</li>
```

- [ ] **Step 3: Verify the build + lint**

Run: `pnpm verify`
Expected: PASS (typecheck, lint, all tests, build).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/sources/page.tsx"
git commit -m "feat(sources): show summary, rec count, primary theme in source list"
```

---

## Task 3: Source-detail metadata block

**Files:**
- Create: `src/components/sources/source-meta.tsx`
- Create: `src/components/sources/source-meta.test.tsx`
- Modify: `src/lib/repositories/source.ts` (`SourceWithPages` type + `getSourceWithPagesBySlug` select)
- Modify: `src/app/(app)/sources/[slug]/page.tsx`

- [ ] **Step 1: Write the failing component test**

Create `src/components/sources/source-meta.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceMeta } from './source-meta';

describe('SourceMeta', () => {
  it('renders publication date, organisation, and authors', () => {
    render(
      <SourceMeta
        publicationDate={new Date('2024-01-15T00:00:00Z')}
        orgOwner="Care Quality Commission"
        authors={['Dr J. Smith', 'M. Jones']}
      />,
    );
    expect(screen.getByText(/Care Quality Commission/)).toBeInTheDocument();
    expect(screen.getByText(/Dr J\. Smith, M\. Jones/)).toBeInTheDocument();
    expect(screen.getByText(/2024/)).toBeInTheDocument();
  });

  it('omits rows whose value is absent', () => {
    render(<SourceMeta publicationDate={null} orgOwner="Org Only" authors={[]} />);
    expect(screen.getByText(/Org Only/)).toBeInTheDocument();
    expect(screen.queryByText(/Authors/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Published/i)).not.toBeInTheDocument();
  });

  it('renders nothing when all fields are absent', () => {
    const { container } = render(
      <SourceMeta publicationDate={null} orgOwner={null} authors={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/sources/source-meta.test.tsx`
Expected: FAIL — cannot resolve `./source-meta`.

- [ ] **Step 3: Create the component**

Create `src/components/sources/source-meta.tsx`:

```tsx
type Props = {
  publicationDate: Date | null;
  orgOwner: string | null;
  authors: string[];
};

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/**
 * Definition-style metadata block for the source detail page. Each row is
 * omitted when its value is absent; renders nothing if all three are absent
 * so callers can drop it in without wrapper guards.
 */
export function SourceMeta({ publicationDate, orgOwner, authors }: Props): React.ReactElement | null {
  const rows: Array<{ label: string; value: string }> = [];
  if (publicationDate) rows.push({ label: 'Published', value: formatDate(publicationDate) });
  if (orgOwner) rows.push({ label: 'Organisation', value: orgOwner });
  if (authors.length > 0) rows.push({ label: 'Authors', value: authors.join(', ') });
  if (rows.length === 0) return null;

  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-1">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline gap-2">
          <dt className="eyebrow">{row.label}</dt>
          <dd className="text-sm text-foreground/85">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/components/sources/source-meta.test.tsx`
Expected: PASS (all three cases).

- [ ] **Step 5: Extend `getSourceWithPagesBySlug` to select the metadata**

In `src/lib/repositories/source.ts`, extend the `SourceWithPages` `source` shape:

```ts
export type SourceWithPages = {
  source: {
    id: string;
    slug: string;
    title: string;
    isPrivate: boolean;
    ownerUserId: string | null;
    summary: string | null;
    authors: string[];
    publicationDate: Date | null;
    orgOwner: string | null;
  };
  pages: SourcePageRow[];
  originalPdfKey: string | null;
};
```

In `getSourceWithPagesBySlug`, extend the first `.select({ … })` to include the new columns:

```ts
    .select({
      id: sources.id,
      slug: sources.slug,
      title: sources.title,
      isPrivate: sources.isPrivate,
      ownerUserId: sources.ownerUserId,
      summary: sources.summary,
      authors: sources.authors,
      publicationDate: sources.publicationDate,
      orgOwner: sources.orgOwner,
    })
```

The returned `source: src` already carries these through. If `authors` can be null in the row type, coerce in the return: `source: { ...src, authors: src.authors ?? [] }`.

- [ ] **Step 6: Wire the component into the detail page**

In `src/app/(app)/sources/[slug]/page.tsx`, add the import:

```ts
import { SourceMeta } from '@/components/sources/source-meta';
```

Insert the block directly above the `{hasAnyChips && (` block:

```tsx
<SourceMeta
  publicationDate={data.source.publicationDate}
  orgOwner={data.source.orgOwner}
  authors={data.source.authors}
/>
```

- [ ] **Step 7: Verify**

Run: `pnpm verify`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/sources/source-meta.tsx src/components/sources/source-meta.test.tsx src/lib/repositories/source.ts "src/app/(app)/sources/[slug]/page.tsx"
git commit -m "feat(sources): show publication date, organisation, authors on detail page"
```

---

## Task 4: Tag category labels

**Files:**
- Modify: `src/components/tags/tag-chips.tsx`
- Modify: `src/components/tags/tag-chips.test.tsx`
- Modify: `src/app/(app)/sources/[slug]/page.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/components/tags/tag-chips.test.tsx`:

```ts
it('renders an eyebrow label above the chips when label is set', () => {
  render(<TagChips tags={items} label="Themes" />);
  expect(screen.getByText('Themes')).toBeInTheDocument();
  expect(screen.getByText('Governance')).toBeInTheDocument();
});

it('renders nothing for an empty list even when a label is set', () => {
  const { container } = render(<TagChips tags={[]} label="Themes" />);
  expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/tags/tag-chips.test.tsx -t "label"`
Expected: FAIL — "Themes" not found (label prop not rendered).

- [ ] **Step 3: Add the `label` prop**

In `src/components/tags/tag-chips.tsx`, extend `Props` and wrap the output. Replace the component with:

```tsx
type Props = {
  tags: ReadonlyArray<TagChipsItem>;
  className?: string;
  label?: string;
};

export function TagChips({ tags, className, label }: Props): React.ReactElement | null {
  if (tags.length === 0) return null;
  const list = (
    <ul className={cn('flex flex-wrap gap-1.5', className)}>
      {tags.map((tag) => {
        const color = tag.colorHex ?? '#9ca3af';
        return (
          <li key={tag.slug}>
            <span
              data-unverified={tag.unverified ? 'true' : undefined}
              style={{ borderLeftColor: color }}
              className={cn(
                'inline-flex items-center border border-rule border-l-[3px] px-2 py-0.5 font-mono text-[11px]',
                tag.unverified
                  ? 'border-dashed text-muted-foreground'
                  : 'bg-paper-2 text-foreground',
              )}
            >
              {tag.name}
            </span>
          </li>
        );
      })}
    </ul>
  );
  if (!label) return list;
  return (
    <div className="space-y-1">
      <div className="eyebrow">{label}</div>
      {list}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/components/tags/tag-chips.test.tsx`
Expected: PASS (all cases, including the pre-existing ones).

- [ ] **Step 5: Pass labels on the source detail page**

In `src/app/(app)/sources/[slug]/page.tsx`, replace the five unlabelled `<TagChips>` calls inside the `hasAnyChips` block with labelled, more-spaced ones:

```tsx
{hasAnyChips && (
  <div className="space-y-3 border-b border-rule pb-4">
    <TagChips tags={themes} label="Themes" />
    <TagChips tags={types} label="Type" />
    <TagChips tags={purposes} label="Purpose" />
    <TagChips tags={roles} label="Roles" />
    <TagChips tags={audiences} label="Audience" />
  </div>
)}
```

- [ ] **Step 6: Verify**

Run: `pnpm verify`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/tags/tag-chips.tsx src/components/tags/tag-chips.test.tsx "src/app/(app)/sources/[slug]/page.tsx"
git commit -m "feat(tags): add category labels to tag chips on source detail"
```

---

## Task 5: Expanded recommendation filters

Five sub-steps: (5.1) shared filter SQL module, (5.2) wire it into `search-sql`, (5.3) wire it into the browse path, (5.4) `allowCreate` on `TagMultiSelect`, (5.5) controls UI + page wiring.

### Task 5.1: Shared filter-predicate module

**Files:**
- Create: `src/lib/services/rec-filters.ts`
- Create: `src/lib/services/rec-filters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/rec-filters.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildRecFilterPredicates, andPredicates } from './rec-filters';

describe('buildRecFilterPredicates', () => {
  it('returns no predicates for undefined or empty filters', () => {
    expect(buildRecFilterPredicates(undefined)).toEqual([]);
    expect(buildRecFilterPredicates({})).toEqual([]);
    expect(buildRecFilterPredicates({ thematicAreaIds: [] })).toEqual([]);
  });

  it('drops non-UUID ids', () => {
    expect(buildRecFilterPredicates({ purposeIds: ['not-a-uuid'] })).toEqual([]);
  });

  it('emits one predicate per active axis', () => {
    const preds = buildRecFilterPredicates({
      sourceId: '11111111-1111-1111-1111-111111111111',
      thematicAreaIds: ['22222222-2222-2222-2222-222222222222'],
      sourceTypeIds: ['33333333-3333-3333-3333-333333333333'],
    });
    expect(preds).toHaveLength(3);
  });
});

describe('andPredicates', () => {
  it('returns a TRUE expression for an empty list', () => {
    // A SQL chunk; we only assert it is defined (composition tested via DB).
    expect(andPredicates([])).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/services/rec-filters.test.ts`
Expected: FAIL — cannot resolve `./rec-filters`.

- [ ] **Step 3: Create the module**

Create `src/lib/services/rec-filters.ts`:

```ts
import { sql } from 'drizzle-orm';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RecFilters = {
  sourceId?: string;
  thematicAreaIds?: string[];
  purposeIds?: string[];
  targetAudienceTypeIds?: string[];
  sourceTypeIds?: string[];
  roleRelevanceIds?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
};

function cleanIds(ids: string[] | undefined): string[] {
  return (ids ?? []).filter((id) => UUID_RE.test(id));
}

/**
 * Per-axis WHERE predicates for recommendation filtering. Each taxonomy axis
 * becomes an EXISTS subquery so combining several axes never multiplies result
 * rows the way repeated JOINs would. Rec-level axes key on `r.id`; source-level
 * axes (source type, role relevance) key on `r.source_id`. Assumes the caller's
 * query aliases the recommendations table as `r`.
 */
export function buildRecFilterPredicates(filters: RecFilters | undefined): ReturnType<typeof sql>[] {
  if (!filters) return [];
  const preds: ReturnType<typeof sql>[] = [];

  if (filters.sourceId && UUID_RE.test(filters.sourceId)) {
    preds.push(sql`r.source_id = ${filters.sourceId}::uuid`);
  }

  const themeIds = cleanIds(filters.thematicAreaIds);
  if (themeIds.length > 0) {
    preds.push(sql`EXISTS (SELECT 1 FROM recommendations_thematic_areas rta WHERE rta.recommendation_id = r.id AND rta.thematic_area_id = ANY(${themeIds}::uuid[]))`);
  }
  const purposeIds = cleanIds(filters.purposeIds);
  if (purposeIds.length > 0) {
    preds.push(sql`EXISTS (SELECT 1 FROM recommendations_purposes rp WHERE rp.recommendation_id = r.id AND rp.purpose_id = ANY(${purposeIds}::uuid[]))`);
  }
  const audienceIds = cleanIds(filters.targetAudienceTypeIds);
  if (audienceIds.length > 0) {
    preds.push(sql`EXISTS (SELECT 1 FROM recommendations_target_audience_types rat WHERE rat.recommendation_id = r.id AND rat.target_audience_type_id = ANY(${audienceIds}::uuid[]))`);
  }
  const sourceTypeIds = cleanIds(filters.sourceTypeIds);
  if (sourceTypeIds.length > 0) {
    preds.push(sql`EXISTS (SELECT 1 FROM sources_source_types sst WHERE sst.source_id = r.source_id AND sst.source_type_id = ANY(${sourceTypeIds}::uuid[]))`);
  }
  const roleIds = cleanIds(filters.roleRelevanceIds);
  if (roleIds.length > 0) {
    preds.push(sql`EXISTS (SELECT 1 FROM sources_role_relevances srr WHERE srr.source_id = r.source_id AND srr.role_relevance_id = ANY(${roleIds}::uuid[]))`);
  }
  if (filters.createdAfter) {
    preds.push(sql`r.created_at >= ${filters.createdAfter.toISOString()}::timestamptz`);
  }
  if (filters.createdBefore) {
    preds.push(sql`r.created_at < ${filters.createdBefore.toISOString()}::timestamptz`);
  }
  return preds;
}

/** Fold predicates into one AND-ed SQL expression (`TRUE` when empty). */
export function andPredicates(preds: ReturnType<typeof sql>[]): ReturnType<typeof sql> {
  if (preds.length === 0) return sql`TRUE`;
  let out = preds[0]!;
  for (let i = 1; i < preds.length; i += 1) out = sql`${out} AND ${preds[i]!}`;
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/services/rec-filters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/rec-filters.ts src/lib/services/rec-filters.test.ts
git commit -m "feat(search): add multi-axis EXISTS filter-predicate builder"
```

### Task 5.2: Wire the builder into hybrid + keyword search

**Files:**
- Modify: `src/lib/services/search-sql.ts` (`SearchFilters` type, `composeRecFilters`, both builders)
- Modify: `src/lib/services/search.ts` (only if it needs to re-export the `SearchFilters` shape — verify; likely no change since it imports the type)
- Test: create `src/lib/services/search-filters.test.ts` (Testcontainers)

- [ ] **Step 1: Write the failing DB test**

Create `src/lib/services/search-filters.test.ts`. It seeds two sources with different source types and recs with different purposes, then filters. Model the Testcontainers setup on `src/lib/repositories/jobs-list.test.ts` (startPostgres → applyMigrations → createDb → seedTaxonomy is NOT needed; insert axes directly). Use the keyword path (`mode: 'keyword'`) so no embedding provider is required.

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type DbClient } from '../db/client';
import {
  purposes,
  recommendations,
  recommendationsPurposes,
  sources,
  sourceTypes,
  sourcesSourceTypes,
} from '../db/schema';
import { searchRecommendations } from './search';
import type { RepoContext } from '../repositories/types';

let pg: StartedPg;
let client: DbClient;

function ctx(): RepoContext {
  return { db: client.db, auth: { user: { id: 'system' }, roles: ['admin'], isSystem: true } };
}

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
  client = createDb(pg.url);
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

it('filters recommendations by a rec-level purpose and a source-level source type', async () => {
  const [srcAudit] = await client.db
    .insert(sources)
    .values({ slug: 'audit-src', title: 'Audit governance report', isPrivate: false })
    .returning({ id: sources.id });
  const [srcStrategy] = await client.db
    .insert(sources)
    .values({ slug: 'strategy-src', title: 'Strategy governance report', isPrivate: false })
    .returning({ id: sources.id });

  const [auditType] = await client.db
    .insert(sourceTypes)
    .values({ slug: 'audit-report', name: 'Audit report', unverified: false })
    .returning({ id: sourceTypes.id });
  await client.db.insert(sourcesSourceTypes).values({ sourceId: srcAudit!.id, sourceTypeId: auditType!.id });

  const [accountability] = await client.db
    .insert(purposes)
    .values({ slug: 'accountability', name: 'Accountability', unverified: false })
    .returning({ id: purposes.id });

  const [recA] = await client.db
    .insert(recommendations)
    .values({ sourceId: srcAudit!.id, slug: 'rec-a', title: 'Improve governance audit', body: 'Body text for the audit recommendation here.' })
    .returning({ id: recommendations.id });
  await client.db.insert(recommendationsPurposes).values({ recommendationId: recA!.id, purposeId: accountability!.id });

  await client.db
    .insert(recommendations)
    .values({ sourceId: srcStrategy!.id, slug: 'rec-b', title: 'Improve governance strategy', body: 'Body text for the strategy recommendation here.' });

  // Source-type filter: only the audit source's rec matches.
  const byType = await searchRecommendations({
    ctx: ctx(),
    q: 'governance',
    mode: 'keyword',
    filters: { sourceTypeIds: [auditType!.id] },
  });
  expect(byType.map((h) => h.id)).toEqual([recA!.id]);

  // Purpose filter: only recA has the accountability purpose.
  const byPurpose = await searchRecommendations({
    ctx: ctx(),
    q: 'governance',
    mode: 'keyword',
    filters: { purposeIds: [accountability!.id] },
  });
  expect(byPurpose.map((h) => h.id)).toEqual([recA!.id]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/services/search-filters.test.ts`
Expected: FAIL — `sourceTypeIds`/`purposeIds` are not valid `SearchFilters` keys (type error) and/or filtering has no effect.

- [ ] **Step 3: Replace `SearchFilters` and `composeRecFilters`**

In `src/lib/services/search-sql.ts`:

Replace the `SearchFilters` type with a re-export of the shared shape:

```ts
import { buildRecFilterPredicates, andPredicates, type RecFilters } from './rec-filters';

export type SearchFilters = RecFilters;
```

Delete the old `composeRecFilters` function and the `UUID_RE` constant if now unused. Wherever the builders destructured `const { predicates, themaJoin } = composeRecFilters(args.filters);`, replace with:

```ts
const predicates = andPredicates(buildRecFilterPredicates(args.filters));
```

In each SQL query, remove the `${themaJoin}` interpolation line and keep `AND ${predicates}` (or `WHERE … AND ${predicates}`) exactly as before. The `EXISTS` predicates need no joins.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/services/search-filters.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the existing search tests to confirm no regression**

Run: `pnpm vitest run src/lib/services`
Expected: PASS (all existing search-sql / search-service tests still green; the old single `thematicAreaId` filter is replaced by `thematicAreaIds` — update any existing test that referenced `thematicAreaId` to use `thematicAreaIds: [id]`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/search-sql.ts src/lib/services/search-filters.test.ts
git commit -m "feat(search): filter recommendations across all tagged axes"
```

### Task 5.3: Wire the builder into the browse path

**Files:**
- Modify: `src/lib/repositories/recommendation.ts` (`ListRecentFilters`, `listRecentRecommendations`)
- Test: `src/lib/repositories/recommendation.test.ts` (add a browse-filter case)

- [ ] **Step 1: Write the failing test**

Add to `src/lib/repositories/recommendation.test.ts` a case that seeds a rec with a purpose and asserts `listRecentRecommendations({ filters: { purposeIds: [id] } })` returns only it. Model seeding on the file's existing helpers (it already imports `recommendations`, `sources`; add `purposes`, `recommendationsPurposes`).

```ts
it('listRecentRecommendations filters by purposeIds', async () => {
  const [src] = await client.db
    .insert(sources).values({ slug: 'browse-src', title: 'Browse', isPrivate: false })
    .returning({ id: sources.id });
  const [p] = await client.db
    .insert(purposes).values({ slug: 'browse-purpose', name: 'Browse Purpose', unverified: false })
    .returning({ id: purposes.id });
  const [rec] = await client.db
    .insert(recommendations)
    .values({ sourceId: src!.id, slug: 'browse-rec', title: 'Browse rec', body: 'Body text long enough to pass.' })
    .returning({ id: recommendations.id });
  await client.db.insert(recommendationsPurposes).values({ recommendationId: rec!.id, purposeId: p!.id });
  await client.db
    .insert(recommendations)
    .values({ sourceId: src!.id, slug: 'browse-rec-2', title: 'Other rec', body: 'Body text long enough to pass.' });

  const rows = await listRecentRecommendations(ctx(), { filters: { purposeIds: [p!.id] } });
  expect(rows.map((r) => r.id)).toEqual([rec!.id]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/repositories/recommendation.test.ts -t "purposeIds"`
Expected: FAIL — `purposeIds` not a valid `ListRecentFilters` key.

- [ ] **Step 3: Replace `ListRecentFilters` and the filter block**

In `src/lib/repositories/recommendation.ts`:

```ts
import { andPredicates, buildRecFilterPredicates, type RecFilters } from '../services/rec-filters';

export type ListRecentFilters = RecFilters;
```

Replace the `predicates`/`themaJoin` construction (the block from `const predicates: …` through `predicateSql`) with:

```ts
const predicateSql = andPredicates(buildRecFilterPredicates(args.filters));
```

In the query, delete the `${themaJoin}` line and keep `AND ${predicateSql}`. Remove the now-unused local `UUID_RE` if nothing else uses it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/repositories/recommendation.test.ts`
Expected: PASS (new case + existing cases; update any existing `thematicAreaId` filter references to `thematicAreaIds: [id]`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/repositories/recommendation.ts src/lib/repositories/recommendation.test.ts
git commit -m "feat(recommendations): apply multi-axis filters to the browse path"
```

### Task 5.4: `allowCreate` prop on `TagMultiSelect`

**Files:**
- Modify: `src/components/tags/tag-multi-select.tsx`
- Modify: `src/components/tags/tag-multi-select.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `src/components/tags/tag-multi-select.test.tsx` (model imports/render on the existing cases in that file):

```tsx
it('does not offer to coin a new tag when allowCreate is false', async () => {
  const user = userEvent.setup();
  render(
    <TagMultiSelect
      label="Type"
      options={[{ slug: 'audit-report', name: 'Audit report', colorHex: null, unverified: false }]}
      value={[]}
      onChange={() => {}}
      allowCreate={false}
    />,
  );
  await user.click(screen.getByRole('button', { name: /add tag/i }));
  await user.type(screen.getByPlaceholderText(/filter/i), 'brand new tag');
  expect(screen.queryByText(/as a new tag/i)).not.toBeInTheDocument();
});
```

If the existing test file does not import `userEvent`, add `import userEvent from '@testing-library/user-event';`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/tags/tag-multi-select.test.tsx -t "allowCreate"`
Expected: FAIL — the "Add … as a new tag" affordance is still shown.

- [ ] **Step 3: Add the prop and gate the affordance**

In `src/components/tags/tag-multi-select.tsx`, add `allowCreate?: boolean` to `Props`, default it to `true` in the destructure (`allowCreate = true`), and change the `queryIsNew` computation:

```ts
const querySlug = normaliseToSlug(query);
const queryIsNew =
  allowCreate &&
  querySlug.length > 0 &&
  !options.some((opt) => opt.slug === querySlug) &&
  !selectedSet.has(querySlug);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/components/tags/tag-multi-select.test.tsx`
Expected: PASS (new case + existing cases — the default `allowCreate=true` preserves current behaviour).

- [ ] **Step 5: Commit**

```bash
git add src/components/tags/tag-multi-select.tsx src/components/tags/tag-multi-select.test.tsx
git commit -m "feat(tags): add allowCreate prop to TagMultiSelect"
```

### Task 5.5: Filter controls UI + page wiring

**Files:**
- Modify: `src/components/recommendations/recommendations-index-controls.tsx`
- Modify: `src/app/(app)/recommendations/page.tsx`

- [ ] **Step 1: Extend the controls with per-axis comboboxes**

`recommendations-index-controls.tsx` currently owns only `q` and `mode`. It must now also own the five slug-list axes and receive the axis options from the server. Change its signature and state.

Replace the component with this shape (preserving the existing search form + mode toggle, adding the axis selectors). The axis state lives in the URL as comma-joined slug strings via the existing string-only `useSearchParamsState`:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TagMultiSelect, type TagOption } from '@/components/tags/tag-multi-select';
import { useSearchParamsState } from '@/lib/hooks/use-search-params-state';
import { FilterChips, type ActiveFilter } from './filter-chips';

export type AxisOptions = {
  themes: TagOption[];
  purposes: TagOption[];
  audiences: TagOption[];
  sourceTypes: TagOption[];
  roles: TagOption[];
};

const DEFAULTS = {
  q: '',
  mode: 'hybrid' as 'hybrid' | 'keyword',
  theme: '',
  purpose: '',
  audience: '',
  type: '',
  role: '',
};

function toList(v: string): string[] {
  return v ? v.split(',').filter(Boolean) : [];
}

export function RecommendationsIndexControls({ options }: { options: AxisOptions }) {
  const [state, setState] = useSearchParamsState<typeof DEFAULTS>(DEFAULTS);
  const [draft, setDraft] = useState(state.q);

  const [lastSyncedQ, setLastSyncedQ] = useState(state.q);
  if (state.q !== lastSyncedQ) {
    setLastSyncedQ(state.q);
    setDraft(state.q);
  }

  const axes: Array<{ key: 'theme' | 'purpose' | 'audience' | 'type' | 'role'; label: string; opts: TagOption[] }> = [
    { key: 'theme', label: 'Theme', opts: options.themes },
    { key: 'purpose', label: 'Purpose', opts: options.purposes },
    { key: 'audience', label: 'Audience', opts: options.audiences },
    { key: 'type', label: 'Source type', opts: options.sourceTypes },
    { key: 'role', label: 'Role relevance', opts: options.roles },
  ];

  const active: ActiveFilter[] = [];
  if (state.q.length > 0) active.push({ key: 'q', label: 'Search', value: state.q });
  if (state.mode !== DEFAULTS.mode) active.push({ key: 'mode', label: 'Mode', value: state.mode });
  for (const axis of axes) {
    for (const slug of toList(state[axis.key])) {
      const name = axis.opts.find((o) => o.slug === slug)?.name ?? slug;
      active.push({ key: `${axis.key}:${slug}`, label: axis.label, value: name });
    }
  }

  return (
    <div className="space-y-4">
      <form
        className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          setState({ q: draft });
        }}
      >
        <label className="space-y-1.5">
          <span className="text-sm text-muted-foreground">Search</span>
          <Input
            type="search"
            placeholder="e.g. governance · safeguarding · audit rotation"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Search recommendations"
          />
        </label>
        <Button type="submit" size="default" variant="outline">Search</Button>
        <Button
          type="button"
          variant={state.mode === 'hybrid' ? 'default' : 'outline'}
          size="default"
          onClick={() => setState({ mode: state.mode === 'hybrid' ? 'keyword' : 'hybrid' })}
          aria-label={`Toggle search mode (current: ${state.mode})`}
        >
          {state.mode === 'hybrid' ? 'Hybrid mode' : 'Keyword mode'}
        </Button>
      </form>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {axes.map((axis) => (
          <TagMultiSelect
            key={axis.key}
            label={axis.label}
            options={axis.opts}
            value={toList(state[axis.key])}
            onChange={(slugs) => setState({ [axis.key]: slugs.join(',') } as Partial<typeof DEFAULTS>)}
            allowCreate={false}
            placeholder={`Filter by ${axis.label.toLowerCase()}…`}
          />
        ))}
      </div>

      <FilterChips
        active={active}
        onClear={(key) => {
          if (key === 'q') {
            setDraft('');
            setState({ q: '' });
          } else if (key === 'mode') {
            setState({ mode: 'hybrid' });
          } else {
            const [axisKey, slug] = key.split(':') as [keyof typeof DEFAULTS, string];
            const remaining = toList(state[axisKey]).filter((s) => s !== slug);
            setState({ [axisKey]: remaining.join(',') } as Partial<typeof DEFAULTS>);
          }
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Wire options + filter resolution in the page**

In `src/app/(app)/recommendations/page.tsx`:

Add imports:

```ts
import {
  listThematicAreas,
  listPurposes,
  listTargetAudienceTypes,
  listSourceTypes,
  listRoleRelevances,
} from '@/lib/repositories/taxonomy';
import type { RecFilters } from '@/lib/services/rec-filters';
```

Extend `QuerySchema` with the new comma-list params:

```ts
const QuerySchema = z.object({
  q: z.string().max(200).optional(),
  source: z.string().uuid().optional(),
  theme: z.string().max(500).optional(),
  purpose: z.string().max(500).optional(),
  audience: z.string().max(500).optional(),
  type: z.string().max(500).optional(),
  role: z.string().max(500).optional(),
  mode: z.enum(['hybrid', 'keyword']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
```

(remember to read `purpose`/`audience`/`type`/`role` via `singleString(raw['…'])` in the `safeParse` call.)

After building `ctx`, load the axis options and build a slug→id resolver:

```ts
const [themeOpts, purposeOpts, audienceOpts, sourceTypeOpts, roleOpts] = await Promise.all([
  listThematicAreas(ctx),
  listPurposes(ctx),
  listTargetAudienceTypes(ctx),
  listSourceTypes(ctx),
  listRoleRelevances(ctx),
]);

const idsFor = (csv: string | undefined, opts: { slug: string; id: string }[]): string[] => {
  if (!csv) return [];
  const bySlug = new Map(opts.map((o) => [o.slug, o.id]));
  return csv.split(',').map((s) => bySlug.get(s)).filter((id): id is string => Boolean(id));
};
```

Replace the `filters` construction with the multi-axis shape:

```ts
const filters: RecFilters = {};
if (args.source) filters.sourceId = args.source;
const themeIds = idsFor(args.theme, themeOpts);
if (themeIds.length) filters.thematicAreaIds = themeIds;
const purposeIds = idsFor(args.purpose, purposeOpts);
if (purposeIds.length) filters.purposeIds = purposeIds;
const audienceIds = idsFor(args.audience, audienceOpts);
if (audienceIds.length) filters.targetAudienceTypeIds = audienceIds;
const typeIds = idsFor(args.type, sourceTypeOpts);
if (typeIds.length) filters.sourceTypeIds = typeIds;
const roleIds = idsFor(args.role, roleOpts);
if (roleIds.length) filters.roleRelevanceIds = roleIds;
```

Pass options into the controls:

```tsx
<RecommendationsIndexControls
  options={{
    themes: themeOpts,
    purposes: purposeOpts,
    audiences: audienceOpts,
    sourceTypes: sourceTypeOpts,
    roles: roleOpts,
  }}
/>
```

The `TagOption` shape (`{ slug, name, colorHex, unverified }`) matches the `TaxonomyRow` rows returned by `list*`, so they pass through directly.

- [ ] **Step 3: Verify**

Run: `pnpm verify`
Expected: PASS (typecheck catches any mismatch in the option/filter wiring; build compiles the client component).

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run the app, open `/recommendations`, pick a Source type and a Purpose, confirm the URL gains `?type=…&purpose=…`, the list narrows, and clearing a chip restores it.

- [ ] **Step 5: Commit**

```bash
git add "src/components/recommendations/recommendations-index-controls.tsx" "src/app/(app)/recommendations/page.tsx"
git commit -m "feat(recommendations): multi-axis filter controls on the index"
```

---

## Final step: update tracking docs

- [ ] Mark Phase 10b complete in `PLAN.md` and `STATE.md`; commit:

```bash
git add PLAN.md STATE.md
git commit -m "docs: mark Phase 10b UI enhancements complete"
```

---

## Self-review notes (for the implementer)

- **`= ANY(${array}::uuid[])`**: Drizzle binds a JS string array as a single Postgres array parameter; the Testcontainers tests in 5.2/5.3 are the proof it executes. If the driver rejects it, fall back to `inArray`-style via `sql.join(ids.map(id => sql`${id}::uuid`), sql', ')` inside `IN (...)`.
- **Existing `thematicAreaId` references**: 5.2 and 5.3 rename the single field to `thematicAreaIds`. Grep for `thematicAreaId` across `src/` and update every caller/test (the recommendations page is the main one) — the build will flag any missed spot.
- **`FilterChips` key format**: axis chips use a `${axisKey}:${slug}` composite key; `onClear` splits on `:`. Confirm `FilterChips` passes the `key` back verbatim to `onClear` (it does in the current implementation).
- **Auth filter**: untouched in every query — `EXISTS` predicates are AND-ed alongside the existing `${auth}` clause.
```
