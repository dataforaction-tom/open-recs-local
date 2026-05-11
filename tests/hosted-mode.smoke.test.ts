/**
 * Hosted-mode end-to-end smoke. Composes the Phase 8 pieces against a real
 * Postgres + Better-auth instance — no browser, no HTTP — to prove the
 * orchestration: signup → first-admin bootstrap → private source upload →
 * second user requests access → admin approves → second user can see the
 * source.
 *
 * Playwright-based browser E2E is deferred to Phase 10 (already on the
 * master plan); this smoke test covers the flow at the integration layer.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from './helpers/pg-container';
import { applyMigrations } from './helpers/migrate';
import { createDb, type DbClient } from '../src/lib/db/client';
import { sources } from '../src/lib/db/schema';
import { createAuth, type Auth } from '../src/lib/auth/config';
import { createBetterAuthProvider } from '../src/lib/providers/auth/better-auth';
import { createConsoleEmail } from '../src/lib/providers/email/console';
import {
  approveOwnershipRequest,
  createOwnershipRequest,
  describeSourceAccess,
  listPendingOwnershipRequests,
} from '../src/lib/repositories/ownership-request';
import type { RepoContext } from '../src/lib/repositories/types';

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
  const cookie = setCookie.split(',').map((c) => c.split(';')[0]).join('; ');
  return { id: body.user.id, cookie };
}

async function ctxFor(cookie: string): Promise<RepoContext> {
  const req = new Request('http://localhost:3000/sources', { headers: { cookie } });
  const auth = await provider.getContext(req);
  return { db: client.db, auth };
}

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql: s }) => s.end());
  client = createDb(pg.url);
  auth = createAuth({
    db: client.db,
    email: createConsoleEmail({ writer: () => {} }),
    secret: 'hosted-smoke-secret-32-chars-long-1234',
    baseURL: 'http://localhost:3000',
  });
  provider = createBetterAuthProvider(auth, client.db);
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

describe('hosted-mode flow', () => {
  it('runs the auth → upload → ownership → approve sequence end-to-end', async () => {
    // Admin: first signup gets admin via the post-signup hook.
    const admin = await signUp('admin@hosted-smoke.test', 'password-12345');
    const adminCtx = await ctxFor(admin.cookie);
    expect(adminCtx.auth.roles).toContain('admin');

    // Admin uploads a private source. We bypass the UI and write directly —
    // the ownership flow doesn't depend on the upload pipeline.
    const [src] = await client.db
      .insert(sources)
      .values({
        slug: 'hsm-private',
        title: 'Hosted Smoke Private',
        isPrivate: true,
        ownerUserId: admin.id,
      })
      .returning({ id: sources.id });
    if (!src) throw new Error('seed: no source');

    // Second user signs up — defaults to viewer.
    const requester = await signUp('requester@hosted-smoke.test', 'password-12345');
    const requesterCtx = await ctxFor(requester.cookie);
    expect(requesterCtx.auth.roles).toContain('viewer');

    // Requester sees the source as private (not visible).
    const before = await describeSourceAccess(requesterCtx, 'hsm-private');
    expect(before.kind).toBe('private');

    // Requester opens an access request.
    const created = await createOwnershipRequest(requesterCtx, {
      sourceId: src.id,
      note: 'I work on the same project',
    });
    if (!('id' in created)) throw new Error('expected created request');

    // Admin sees the request in the queue.
    const queue = await listPendingOwnershipRequests(adminCtx);
    expect(queue.find((r) => r.id === created.id)).toBeDefined();

    // Admin approves.
    const approved = await approveOwnershipRequest(adminCtx, created.id);
    expect(approved.ok).toBe(true);

    // Requester can now see the source.
    const after = await describeSourceAccess(requesterCtx, 'hsm-private');
    expect(after.kind).toBe('visible');
  });
});
