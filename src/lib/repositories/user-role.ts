import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { users, userRoles, type Role } from '../db/schema';
import { AuthorizationError, type RepoContext } from './types';

/**
 * Thrown when `setUserRole` would demote the last remaining admin. Hosted
 * instances need at least one admin to reach the role-management surface
 * itself; allowing the demotion would lock the instance out of in-app
 * administration permanently (the first-signup bootstrap only fires when
 * user_roles is empty, which by then it isn't).
 */
export class LastAdminError extends Error {
  constructor(message = 'cannot demote the last remaining admin') {
    super(message);
    this.name = 'LastAdminError';
  }
}

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
    // If we're demoting the target away from admin, make sure they aren't
    // the last admin standing. The count is taken inside the transaction
    // so two concurrent demotions can't both pass the check — Postgres'
    // default READ COMMITTED still serialises the write order, and we'd
    // throw on the second one when its count drops to zero.
    if (role !== 'admin') {
      const wasAdmin = await tx
        .select({ ok: sql<number>`1` })
        .from(userRoles)
        .where(and(eq(userRoles.userId, userId), eq(userRoles.role, 'admin')))
        .limit(1);
      if (wasAdmin.length > 0) {
        const otherAdmins = await tx
          .select({ ok: sql<number>`1` })
          .from(userRoles)
          .where(and(eq(userRoles.role, 'admin'), ne(userRoles.userId, userId)))
          .limit(1);
        if (otherAdmins.length === 0) throw new LastAdminError();
      }
    }
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
  await ctx.db.transaction(async (tx) => {
    // Same last-admin guard as setUserRole: revoking 'admin' from the only
    // remaining admin locks the instance out of in-app administration.
    if (role === 'admin') {
      const otherAdmins = await tx
        .select({ ok: sql<number>`1` })
        .from(userRoles)
        .where(and(eq(userRoles.role, 'admin'), ne(userRoles.userId, userId)))
        .limit(1);
      if (otherAdmins.length === 0) throw new LastAdminError();
    }
    await tx
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)));
  });
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
