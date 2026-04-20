import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';

/**
 * Apply migrations to a fresh database. Returns the `sql` client so the caller
 * can run assertions, and stops it themselves in afterAll.
 */
export async function applyMigrations(url: string) {
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);
  await migrate(db, {
    migrationsFolder: path.resolve(process.cwd(), 'src/lib/db/migrations'),
  });
  return { db, sql };
}
