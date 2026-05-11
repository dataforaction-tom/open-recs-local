import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type DbClient } from '../db/client';
import { users, userRoles } from '../db/schema';
import { createConsoleEmail } from '../providers/email/console';
import { createAuth, type Auth } from './config';

let pg: StartedPg;
let client: DbClient;
let auth: Auth;
const emailLog: string[] = [];

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql: s }) => s.end());
  client = createDb(pg.url);
  auth = createAuth({
    db: client.db,
    email: createConsoleEmail({ writer: (line) => emailLog.push(line) }),
    secret: 'test-secret-32-chars-long-1234567890',
    baseURL: 'http://localhost:3000',
  });
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

async function signUp(email: string, password: string): Promise<string> {
  const res = await auth.handler(
    new Request('http://localhost:3000/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, name: email.split('@')[0] }),
    }),
  );
  if (!res.ok) throw new Error(`signup failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { user: { id: string } };
  return body.user.id;
}

describe('createAuth', () => {
  it('signs up a user — first signup becomes admin', async () => {
    const id = await signUp('first@test.local', 'password-12345');
    const rows = await client.db
      .select()
      .from(users)
      .where(sql`id = ${id}::uuid`)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe('first@test.local');

    const roles = await client.db
      .select()
      .from(userRoles)
      .where(sql`user_id = ${id}::uuid`)
      .execute();
    expect(roles.map((r) => r.role)).toEqual(['admin']);
  });

  it('subsequent signups default to viewer', async () => {
    const id = await signUp('second@test.local', 'password-12345');
    const roles = await client.db
      .select()
      .from(userRoles)
      .where(sql`user_id = ${id}::uuid`)
      .execute();
    expect(roles.map((r) => r.role)).toEqual(['viewer']);
  });

  it('issues a session cookie on signup', async () => {
    const res = await auth.handler(
      new Request('http://localhost:3000/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'cookie@test.local',
          password: 'password-12345',
          name: 'cookie',
        }),
      }),
    );
    expect(res.ok).toBe(true);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/better-auth\.session_token/);
  });

  it('issues uuid-shaped user ids (so FKs resolve)', async () => {
    const id = await signUp('uuid@test.local', 'password-12345');
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
