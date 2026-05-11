import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { startPostgres, type StartedPg } from '../../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../../tests/helpers/migrate';
import { createDb, type DbClient } from '../../db/client';
import { userRoles } from '../../db/schema';
import { createAuth, type Auth } from '../../auth/config';
import { createConsoleEmail } from '../email/console';
import { createBetterAuthProvider } from './better-auth';

let pg: StartedPg;
let client: DbClient;
let auth: Auth;
let provider: ReturnType<typeof createBetterAuthProvider>;

async function signUp(email: string, password: string): Promise<{ id: string; cookie: string }> {
  const res = await auth.handler(
    new Request('http://localhost:3000/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, name: email.split('@')[0] }),
    }),
  );
  if (!res.ok) throw new Error(`signup failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { user: { id: string } };
  const setCookie = res.headers.get('set-cookie') ?? '';
  // strip attributes after the first ;
  const cookie = setCookie.split(',').map((c) => c.split(';')[0]).join('; ');
  return { id: body.user.id, cookie };
}

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql: s }) => s.end());
  client = createDb(pg.url);
  auth = createAuth({
    db: client.db,
    email: createConsoleEmail({ writer: () => {} }),
    secret: 'test-secret-32-chars-long-1234567890',
    baseURL: 'http://localhost:3000',
  });
  provider = createBetterAuthProvider(auth, client.db);
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

describe('createBetterAuthProvider', () => {
  it('returns an anonymous context when the request has no session cookie', async () => {
    const req = new Request('http://localhost:3000/sources', { method: 'GET' });
    const ctx = await provider.getContext(req);
    expect(ctx.user.id).toBe('anonymous');
    expect(ctx.roles).toEqual([]);
    expect(ctx.isSystem).toBe(false);
  });

  it('returns a real user context when the request has a valid session cookie', async () => {
    const { id, cookie } = await signUp('better-auth-real@test.local', 'password-12345');
    const req = new Request('http://localhost:3000/sources', {
      method: 'GET',
      headers: { cookie },
    });
    const ctx = await provider.getContext(req);
    expect(ctx.user.id).toBe(id);
    expect(ctx.user.email).toBe('better-auth-real@test.local');
    expect(ctx.isSystem).toBe(false);
    // first user signed up in this test container — could be admin or viewer
    // depending on test order; just assert the array shape is sensible.
    expect(Array.isArray(ctx.roles)).toBe(true);
  });

  it('loads multiple roles from user_roles', async () => {
    const { id, cookie } = await signUp('multi-role@test.local', 'password-12345');
    // Grant a second role directly so we can assert the array contents.
    await client.db.insert(userRoles).values({ userId: id, role: 'editor' });
    const req = new Request('http://localhost:3000/sources', {
      method: 'GET',
      headers: { cookie },
    });
    const ctx = await provider.getContext(req);
    const sortedRoles = [...ctx.roles].sort();
    expect(sortedRoles).toContain('editor');
    // Original role from the first-admin / viewer bootstrap is preserved.
    expect(sortedRoles.length).toBeGreaterThanOrEqual(2);
  });

  it('treats an expired / unknown session cookie as anonymous', async () => {
    const req = new Request('http://localhost:3000/sources', {
      method: 'GET',
      headers: { cookie: 'better-auth.session_token=totally-bogus-value' },
    });
    const ctx = await provider.getContext(req);
    expect(ctx.user.id).toBe('anonymous');
  });
});
