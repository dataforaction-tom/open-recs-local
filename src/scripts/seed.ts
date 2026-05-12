import { fileURLToPath } from 'node:url';
import { loadEnv } from '../lib/env';
import { createDb } from '../lib/db/client';
import { seedTaxonomy } from '../lib/db/seed-taxonomy';

export { seedTaxonomy };

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
