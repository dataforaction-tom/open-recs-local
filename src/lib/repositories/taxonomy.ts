import { asc, eq, inArray, sql as drizzleSql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
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

/**
 * Batch-resolve taxonomy slugs for many recommendations in one DB round-trip
 * per axis (the N+1 fix), returning ids positionally — one id array per input
 * rec, in the same order.
 *
 * Two things this guards against, both of which a naive index-zip gets wrong:
 *  - **Identity:** results are positional, so two recs that happen to share a
 *    title (or any other field) never clobber each other's tags.
 *  - **Normalisation:** we normalise + dedupe the slugs with the *same*
 *    `normaliseSlug` the resolver uses before calling it. Because the resolver
 *    re-normalises and re-dedupes internally, feeding it an already-canonical,
 *    already-unique list means it can't reorder or shrink the array — so the
 *    `uniqueSlugs[i] -> resolvedIds[i]` pairing stays aligned even when raw
 *    inputs differ only by casing/whitespace (e.g. 'Mental Health' vs
 *    'mental-health').
 *
 * @param ctx - Repository context
 * @param perRecSlugs - One slug array per recommendation, in order
 * @param resolver - Single-axis resolver (e.g. `resolveOrCreateThematicAreas`)
 * @returns One resolved-id array per recommendation, in the same order
 */
export async function batchResolveTaxonomy(
  ctx: RepoContext,
  perRecSlugs: readonly (readonly string[])[],
  resolver: (ctx: RepoContext, slugs: readonly string[]) => Promise<string[]>,
): Promise<string[][]> {
  // Canonicalise each rec's slugs up front so lookups match the resolver's view.
  const normalisedPerRec = perRecSlugs.map((slugs) =>
    slugs.map(normaliseSlug).filter((slug) => slug.length > 0),
  );

  // Unique slugs across all recs, first-seen order preserved.
  const uniqueSlugs: string[] = [];
  const seen = new Set<string>();
  for (const slugs of normalisedPerRec) {
    for (const slug of slugs) {
      if (!seen.has(slug)) {
        seen.add(slug);
        uniqueSlugs.push(slug);
      }
    }
  }

  if (uniqueSlugs.length === 0) {
    return perRecSlugs.map(() => []);
  }

  // One resolve call for the whole batch. Input is already normalised + unique,
  // so the resolver returns ids 1:1 in the same order.
  const resolvedIds = await resolver(ctx, uniqueSlugs);
  const idBySlug = new Map<string, string>();
  for (let i = 0; i < uniqueSlugs.length; i += 1) {
    const slug = uniqueSlugs[i];
    const id = resolvedIds[i];
    if (slug && id) idBySlug.set(slug, id);
  }

  return normalisedPerRec.map((slugs) => {
    const ids: string[] = [];
    for (const slug of slugs) {
      const id = idBySlug.get(slug);
      if (id) ids.push(id);
    }
    return ids;
  });
}

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

// -- admin operations (for /admin/tags) -------------------------------------

export const TAXONOMY_AXES = [
  'thematic_areas',
  'purposes',
  'source_types',
  'target_audience_types',
  'location_scopes',
  'role_relevances',
  'priority_timescales',
] as const;
export type TaxonomyAxis = (typeof TAXONOMY_AXES)[number];

const AXIS_TABLES: Record<TaxonomyAxis, PgTable> = {
  thematic_areas: thematicAreas,
  purposes,
  source_types: sourceTypes,
  target_audience_types: targetAudienceTypes,
  location_scopes: locationScopes,
  role_relevances: roleRelevances,
  priority_timescales: priorityTimescales,
};

function tableForAxis(axis: TaxonomyAxis): PgTable {
  return AXIS_TABLES[axis];
}

export async function listUnverifiedTags(
  ctx: RepoContext,
  axis: TaxonomyAxis,
): Promise<TaxonomyRow[]> {
  const table = tableForAxis(axis);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic taxonomy shape
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
    .where(eq(t.unverified, true))
    .orderBy(asc(t.name));
  return rows as TaxonomyRow[];
}

export async function promoteTag(
  ctx: RepoContext,
  axis: TaxonomyAxis,
  tagId: string,
): Promise<void> {
  const table = tableForAxis(axis);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = table as any;
  await ctx.db.update(table).set({ unverified: false }).where(eq(t.id, tagId));
}

export async function renameTag(
  ctx: RepoContext,
  axis: TaxonomyAxis,
  tagId: string,
  newName: string,
): Promise<void> {
  const table = tableForAxis(axis);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = table as any;
  await ctx.db.update(table).set({ name: newName }).where(eq(t.id, tagId));
}

export async function deleteTag(
  ctx: RepoContext,
  axis: TaxonomyAxis,
  tagId: string,
): Promise<void> {
  const table = tableForAxis(axis);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = table as any;
  await ctx.db.delete(table).where(eq(t.id, tagId));
}

// M2M tables affected by a merge, keyed by axis. Merge rewrites any join
// row pointing at the source tag id to point at the target id (skipping
// duplicates), then deletes the source tag.
const AXIS_M2M_MERGE_TARGETS: Record<TaxonomyAxis, Array<{ table: string; column: string }>> = {
  thematic_areas: [
    { table: 'sources_thematic_areas', column: 'thematic_area_id' },
    { table: 'recommendations_thematic_areas', column: 'thematic_area_id' },
  ],
  purposes: [
    { table: 'sources_purposes', column: 'purpose_id' },
    { table: 'recommendations_purposes', column: 'purpose_id' },
  ],
  source_types: [{ table: 'sources_source_types', column: 'source_type_id' }],
  target_audience_types: [
    { table: 'sources_target_audience_types', column: 'target_audience_type_id' },
    { table: 'recommendations_target_audience_types', column: 'target_audience_type_id' },
  ],
  location_scopes: [{ table: 'recommendations_location_scopes', column: 'location_scope_id' }],
  role_relevances: [{ table: 'sources_role_relevances', column: 'role_relevance_id' }],
  priority_timescales: [], // single-FK on recommendations; handled separately
};

/**
 * Merge an unverified tag into a target tag. Rewrites every M2M row that
 * points at `fromId` to point at `toId` (deleting rows that would become
 * duplicates), then deletes the `fromId` tag row.
 *
 * For `priority_timescales` (single-FK on recommendations.priority_timescale_id),
 * we UPDATE the FK directly rather than rewriting an M2M join.
 *
 * The raw SQL escape hatches are deliberate — Drizzle's generic typing
 * doesn't compose cleanly across heterogeneous M2M shapes, and `mergeTag`
 * is exercised by Testcontainers-backed tests so correctness is enforced
 * at runtime.
 */
export async function mergeTag(
  ctx: RepoContext,
  axis: TaxonomyAxis,
  fromId: string,
  toId: string,
): Promise<void> {
  if (fromId === toId) return;
  if (axis === 'priority_timescales') {
    await ctx.db.execute(
      drizzleSql`UPDATE recommendations SET priority_timescale_id = ${toId}::uuid WHERE priority_timescale_id = ${fromId}::uuid`,
    );
    await deleteTag(ctx, axis, fromId);
    return;
  }
  const m2mList = AXIS_M2M_MERGE_TARGETS[axis];
  await ctx.db.transaction(async (tx) => {
    for (const { table, column } of m2mList) {
      // Delete rows where (parent, fromId) AND (parent, toId) BOTH exist —
      // those would become primary-key duplicates after the UPDATE.
      const parentColumn = table.startsWith('sources_') ? 'source_id' : 'recommendation_id';
      await tx.execute(
        drizzleSql.raw(
          `DELETE FROM "${table}" t1 WHERE t1."${column}" = '${fromId}' AND EXISTS (SELECT 1 FROM "${table}" t2 WHERE t2."${parentColumn}" = t1."${parentColumn}" AND t2."${column}" = '${toId}')`,
        ),
      );
      // Rewrite remaining (parent, fromId) rows to (parent, toId).
      await tx.execute(
        drizzleSql.raw(`UPDATE "${table}" SET "${column}" = '${toId}' WHERE "${column}" = '${fromId}'`),
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tableForAxis(axis) as any;
    await tx.delete(tableForAxis(axis)).where(eq(t.id, fromId));
  });
}
