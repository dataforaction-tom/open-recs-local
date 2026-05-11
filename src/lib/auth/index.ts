import { createDb } from '../db/client';
import { loadEnv } from '../env';
import { createConsoleEmail } from '../providers/email/console';
import { createAuth, type Auth } from './config';

let cached: Auth | null = null;

/**
 * Lazily-constructed default Better-auth instance for the app's request
 * handlers. We don't precompute at import time so tests can spin up isolated
 * Postgres + auth pairs via `createAuth` directly.
 *
 * Local mode never calls this — the local AuthProvider doesn't need a
 * Better-auth instance. The `BETTER_AUTH_SECRET` env var is required only
 * for hosted mode (see env.ts).
 */
export function getAuth(): Auth {
  if (cached) return cached;
  const env = loadEnv();
  if (env.APP_MODE !== 'hosted') {
    throw new Error('getAuth() called outside hosted mode');
  }
  const client = createDb(env.DATABASE_URL);
  cached = createAuth({
    db: client.db,
    email: createConsoleEmail(),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
  });
  return cached;
}
