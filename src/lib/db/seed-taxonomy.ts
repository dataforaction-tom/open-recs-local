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
 *
 * Lives here (not in `src/scripts/seed.ts`) so test runners that don't
 * tolerate `import.meta.url` (Playwright's CJS loader) can pull the pure
 * function without dragging the CLI bootstrap with it.
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
