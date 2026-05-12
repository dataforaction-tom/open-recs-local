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
 * in one transaction. Drizzle's `.values()` keys are TS field names, so
 * we accept those explicitly per binding.
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
    parentField: string;
    axisField: string;
    parentId: string;
    axisIds: readonly string[];
  },
): Promise<void> {
  const { table, parentColumn, axisColumn, parentField, axisField, parentId, axisIds } = opts;
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- keys are TS field names per Drizzle's contract
        .values(toAdd.map((id) => ({ [parentField]: parentId, [axisField]: id } as any)));
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
    parentField: 'recommendationId',
    axisField: 'thematicAreaId',
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
    parentField: 'recommendationId',
    axisField: 'purposeId',
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
    parentField: 'recommendationId',
    axisField: 'targetAudienceTypeId',
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
    parentField: 'recommendationId',
    axisField: 'locationScopeId',
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
