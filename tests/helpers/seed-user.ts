import { randomUUID } from 'node:crypto';
import type { Db } from '../../src/lib/db/client';
import { users } from '../../src/lib/db/schema';

/**
 * Insert a row into `users` and return its id. Test-only — production user
 * creation goes through Better-auth. Defaults to a fresh uuid + a synthetic
 * email so the unique-email constraint doesn't collide across calls.
 *
 * Use this anywhere a test wants to populate one of the nullable user-ref
 * columns (`owner_user_id`, `set_by_user_id`, `author_user_id`, `resolved_by`)
 * with a real user id — those columns FK back to `users.id`.
 */
export async function seedUser(
  db: Db,
  opts: { id?: string; email?: string; name?: string } = {},
): Promise<string> {
  const id = opts.id ?? randomUUID();
  const email = opts.email ?? `${id}@test.local`;
  await db
    .insert(users)
    .values({ id, email, ...(opts.name !== undefined ? { name: opts.name } : {}) })
    .onConflictDoNothing({ target: users.id });
  return id;
}
