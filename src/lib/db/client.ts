import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

export type Db = PostgresJsDatabase;
export type DbClient = { db: Db; sql: Sql };

export function createDb(url: string): DbClient {
  const sql = postgres(url, { max: 10, prepare: false });
  const db = drizzle(sql);
  return { db, sql };
}
