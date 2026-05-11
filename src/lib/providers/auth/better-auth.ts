import { sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import type { Role } from '../../db/schema';
import type { Auth } from '../../auth/config';
import type { AuthContext, AuthProvider } from './types';

/**
 * Hosted-mode AuthProvider. Reads the Better-auth session from the incoming
 * request's cookie via `auth.api.getSession`, then loads the user's role(s)
 * from `user_roles`. Returns the same `AuthContext` shape the local provider
 * does so downstream code (repos, services, server actions) is mode-agnostic.
 *
 * Anonymous (no session): returns a sentinel context with `user.id =
 * 'anonymous'`. The repo-layer auth filters already treat any non-uuid
 * `user.id` as "no real viewer → only public visible".
 */
export function createBetterAuthProvider(auth: Auth, db: Db): AuthProvider {
  return {
    async getContext(req: Request): Promise<AuthContext> {
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session?.user) {
        return {
          user: { id: 'anonymous' },
          roles: [],
          isSystem: false,
        };
      }
      const rows = await db.execute<{ role: Role }>(sql`
        SELECT role FROM user_roles WHERE user_id = ${session.user.id}::uuid
      `);
      return {
        user: {
          id: session.user.id,
          ...(session.user.email ? { email: session.user.email } : {}),
          ...(session.user.name ? { name: session.user.name } : {}),
        },
        roles: rows.map((r) => r.role),
        isSystem: false,
      };
    },
  };
}
