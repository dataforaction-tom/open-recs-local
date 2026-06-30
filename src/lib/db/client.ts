import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

export type Db = PostgresJsDatabase;
export type DbClient = { db: Db; sql: Sql };

/**
 * Create a one-off DB client (pool + drizzle). Used by tests and the worker
 * where the lifecycle is explicitly managed. For long-lived processes (Next
 * server routes) prefer {@link getSharedDb} to avoid connection churn.
 */
export function createDb(url: string): DbClient {
  const sql = postgres(url, { max: 10, prepare: false });
  const db = drizzle(sql);
  return { db, sql };
}

// -- shared pool for Next.js server routes -----------------------------------
//
// API routes and server components each used to create (and close) a fresh
// postgres pool per request. Under concurrent uploads that caused connection
// churn — each pool opens up to 10 TCP connections, and the rapid
// create/close cycle taxed the Postgres server's max_connections.
//
// This singleton is safe because:
//   - Next.js runs in a single long-lived Node process under `next start`
//     (and in Docker Compose we don't use serverless cold starts).
//   - postgres-js pools are designed to be shared; they manage their own
//     connection lifecycle internally.
//   - The pool is created on first use, not at import time, so a test
//     that never hits a server route won't allocate connections.

let sharedClient: DbClient | null = null;
let sharedPromise: Promise<DbClient> | null = null;

/**
 * Return the process-wide shared DB pool, creating it lazily on first call.
 * The pool lives for the lifetime of the process — do NOT close it from
 * request handlers.
 */
export async function getSharedDb(url: string): Promise<DbClient> {
  if (sharedClient) return sharedClient;
  if (!sharedPromise) {
    sharedPromise = (async () => {
      const sql = postgres(url, { max: 10, prepare: false });
      const db = drizzle(sql);
      sharedClient = { db, sql };
      return sharedClient;
    })();
  }
  return sharedPromise;
}

/**
 * Test seam: reset the shared pool so a testcontainer run in one test
 * doesn't leak into the next. Not exported from a public entry point.
 */
export async function __resetSharedDbForTests(): Promise<void> {
  if (sharedClient) {
    await sharedClient.sql.end({ timeout: 5 }).catch(() => {});
  }
  sharedClient = null;
  sharedPromise = null;
}