import { asc, inArray } from 'drizzle-orm';
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
