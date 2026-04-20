import { fileURLToPath } from 'node:url';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { loadEnv } from '../lib/env';
import { createDb } from '../lib/db/client';
import { thematicAreas, evidenceTypes, progressRatings } from '../lib/db/schema';
import { THEMATIC_AREAS, EVIDENCE_TYPES, PROGRESS_RATINGS } from '../../seeds/taxonomy';

/**
 * Upsert all taxonomy rows by `slug`. Safe to call repeatedly — updates non-key
 * fields on conflict and never produces duplicate key errors.
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

async function main(): Promise<void> {
  const env = loadEnv();
  const { db, sql: client } = createDb(env.DATABASE_URL);
  try {
    await seedTaxonomy(db);
    console.log('taxonomy seeded');
  } finally {
    await client.end();
  }
}

// Run only when invoked directly (not when imported by the test).
// Use fileURLToPath for a robust Windows-safe comparison with process.argv[1].
const invokedPath = process.argv[1];
const thisFile = fileURLToPath(import.meta.url);
if (invokedPath && thisFile === invokedPath) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
