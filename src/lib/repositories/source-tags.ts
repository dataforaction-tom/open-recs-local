import { and, asc, eq, inArray } from 'drizzle-orm';
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
    parentField: string; // TS field name used in Drizzle's .values() (e.g. 'sourceId')
    axisField: string; // TS field name used in Drizzle's .values() (e.g. 'thematicAreaId')
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
    parentField: 'sourceId',
    axisField: 'thematicAreaId',
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
    parentField: 'sourceId',
    axisField: 'sourceTypeId',
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
    parentField: 'sourceId',
    axisField: 'purposeId',
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
    parentField: 'sourceId',
    axisField: 'roleRelevanceId',
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
    parentField: 'sourceId',
    axisField: 'targetAudienceTypeId',
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
