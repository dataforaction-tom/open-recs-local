import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { loadEnv } from '../env';

async function main() {
  const env = loadEnv();
  const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false });
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: './src/lib/db/migrations' });
  await sql.end();
  console.log('migrations applied');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
