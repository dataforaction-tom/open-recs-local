import { randomUUID } from 'node:crypto';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { nextCookies } from 'better-auth/next-js';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as schema from '../db/schema';
import type { EmailProvider } from '../providers/email/types';

/**
 * Build a Better-auth instance bound to a specific Drizzle client + email
 * provider. The app uses the default instance from `./index.ts`; tests
 * construct fresh instances against a Testcontainers DB.
 *
 * - `usePlural: true` matches our schema (`users`, `sessions`, etc.).
 * - `generateId` returns RFC-4122 v4 uuids so Postgres' `uuid` columns are
 *   satisfied — the rest of the app uses uuids end-to-end.
 * - `databaseHooks.user.create.after` implements the first-signup-becomes-
 *   admin bootstrap: if `user_roles` is empty, grant the new user `admin`;
 *   otherwise grant `viewer`.
 * - `nextCookies` plugin must be the LAST plugin in the list — it patches
 *   responses with `Set-Cookie` headers for the Next.js app router.
 */
export type AuthConfig = {
  db: Db;
  email: EmailProvider;
  secret: string;
  baseURL: string;
};

export function createAuth(config: AuthConfig) {
  const options: BetterAuthOptions = {
    database: drizzleAdapter(config.db, {
      provider: 'pg',
      usePlural: true,
      schema,
    }),
    secret: config.secret,
    baseURL: config.baseURL,
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => {
        await config.email.send({
          to: user.email,
          subject: 'Reset your password',
          text:
            `Hello,\n\n` +
            `Click the link below to reset your password. It expires in 1 hour.\n\n` +
            `${url}\n\n` +
            `If you didn't request this, ignore this email.\n`,
        });
      },
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await config.email.send({
            to: email,
            subject: 'Your sign-in link',
            text:
              `Hello,\n\n` +
              `Click the link below to sign in. It expires in 5 minutes.\n\n` +
              `${url}\n`,
          });
        },
      }),
      // Must be last — patches Set-Cookie for Next.js responses.
      nextCookies(),
    ],
    advanced: {
      database: {
        generateId: () => randomUUID(),
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // First signup becomes admin. We use raw SQL with INSERT … SELECT
            // so the "no roles yet" check and the insert are one atomic
            // statement — concurrent signups can't both elect themselves.
            await config.db.execute(sql`
              INSERT INTO user_roles (user_id, role)
              SELECT ${user.id}::uuid,
                     CASE WHEN NOT EXISTS (SELECT 1 FROM user_roles) THEN 'admin' ELSE 'viewer' END
            `);
          },
        },
      },
    },
  };
  return betterAuth(options);
}

export type Auth = ReturnType<typeof createAuth>;
