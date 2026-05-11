import { and, asc, eq } from 'drizzle-orm';
import { users, userRoles, type Role } from '../db/schema';
import { AuthorizationError, type RepoContext } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isAdmin(ctx: RepoContext): boolean {
  if (ctx.auth.isSystem) return true;
  return ctx.auth.roles.includes('admin');
}

/**
 * Returns the role(s) held by a user. Open to any caller — the BetterAuthProvider
 * uses this on every request to build its own ctx.roles, so an admin-only gate
 * here would create a bootstrap loop.
 */
export async function getRoles(ctx: RepoContext, userId: string): Promise<Role[]> {
  if (!UUID_RE.test(userId)) return [];
  const rows = await ctx.db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => r.role);
}

/** Admin-only — grant a role to a user. Idempotent (PK collision is swallowed). */
export async function assignRole(
  ctx: RepoContext,
  userId: string,
  role: Role,
): Promise<void> {
  if (!isAdmin(ctx)) throw new AuthorizationError('only admins can assign roles');
  if (!UUID_RE.test(userId)) throw new Error('invalid user id');
  await ctx.db
    .insert(userRoles)
    .values({ userId, role })
    .onConflictDoNothing({ target: [userRoles.userId, userRoles.role] });
}

/**
 * Admin-only — replace the user's entire role set with a single role. The
 * admin UI uses this so each user has exactly one effective role at a time;
 * the underlying repo still supports multiple roles via `assignRole` for
 * programmatic callers that want it.
 */
export async function setUserRole(
  ctx: RepoContext,
  userId: string,
  role: Role,
): Promise<void> {
  if (!isAdmin(ctx)) throw new AuthorizationError('only admins can set user roles');
  if (!UUID_RE.test(userId)) throw new Error('invalid user id');
  await ctx.db.transaction(async (tx) => {
    await tx.delete(userRoles).where(eq(userRoles.userId, userId));
    await tx.insert(userRoles).values({ userId, role });
  });
}

/** Admin-only — revoke a single role. No-op if the user didn't have it. */
export async function revokeRole(
  ctx: RepoContext,
  userId: string,
  role: Role,
): Promise<void> {
  if (!isAdmin(ctx)) throw new AuthorizationError('only admins can revoke roles');
  if (!UUID_RE.test(userId)) throw new Error('invalid user id');
  await ctx.db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)));
}

export type UserWithRoles = {
  id: string;
  email: string;
  name: string | null;
  roles: Role[];
};

/**
 * Admin-only — list every user with their assigned role(s). Joined via LEFT
 * OUTER so users with no roles still appear (the bootstrap hook should make
 * this rare, but defensive).
 */
export async function listUsersWithRoles(ctx: RepoContext): Promise<UserWithRoles[]> {
  if (!isAdmin(ctx)) throw new AuthorizationError('only admins can list users');
  const rows = await ctx.db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: userRoles.role,
    })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .orderBy(asc(users.email));

  const grouped = new Map<string, UserWithRoles>();
  for (const row of rows) {
    const entry = grouped.get(row.id) ?? {
      id: row.id,
      email: row.email,
      name: row.name,
      roles: [],
    };
    if (row.role) entry.roles.push(row.role);
    grouped.set(row.id, entry);
  }
  return [...grouped.values()];
}
