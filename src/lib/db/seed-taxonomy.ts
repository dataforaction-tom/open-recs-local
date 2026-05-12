import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { thematicAreas, evidenceTypes, progressRatings } from './schema';
import { THEMATIC_AREAS, EVIDENCE_TYPES, PROGRESS_RATINGS } from '../../../seeds/taxonomy';

/**
 * Upsert all taxonomy rows by `slug`. Safe to call repeatedly — updates
 * non-key fields on conflict and never produces duplicate key errors.
 *
 * Lives here (not in `src/scripts/seed.ts`) so test runners that don't
 * tolerate `import.meta.url` (Playwright's CJS loader) can pull the pure
 * function without dragging the CLI bootstrap with it.
 */
export async function seedTaxonomy(db: PostgresJsDatabase): Promise<void> {
  for (const row of THEMATIC_AREAS) {
    await db
      .insert(thematicAreas)
      .values({ slug: row.slug, name: row.name, colorHex: row.colorHex })
      .onConflictDoUpdate({
        target: thematicAreas.slug,
        set: { name: row.name, colorHex: row.colorHex },
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
