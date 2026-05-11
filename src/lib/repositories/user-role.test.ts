import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type Db, type DbClient } from '../db/client';
import { seedUser } from '../../../tests/helpers/seed-user';
import { assignRole, getRoles, listUsersWithRoles, revokeRole } from './user-role';
import { AuthorizationError, type RepoContext } from './types';

let pg: StartedPg;
let client: DbClient;

function ctxSystem(db: Db): RepoContext {
  return { db, auth: { user: { id: 'system' }, roles: ['admin'], isSystem: true } };
}
function ctxAdmin(db: Db, userId: string): RepoContext {
  return { db, auth: { user: { id: userId }, roles: ['admin'], isSystem: false } };
}
function ctxViewer(db: Db, userId: string): RepoContext {
  return { db, auth: { user: { id: userId }, roles: ['viewer'], isSystem: false } };
}

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
  client = createDb(pg.url);
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

describe('getRoles', () => {
  it('returns the roles assigned to a user', async () => {
    const id = await seedUser(client.db);
    await assignRole(ctxSystem(client.db), id, 'admin');
    await assignRole(ctxSystem(client.db), id, 'editor');
    const roles = await getRoles(ctxSystem(client.db), id);
    expect([...roles].sort()).toEqual(['admin', 'editor']);
  });

  it('returns [] for an unknown / non-uuid id', async () => {
    expect(await getRoles(ctxSystem(client.db), 'not-a-uuid')).toEqual([]);
  });

  it('is open to non-admin callers', async () => {
    const id = await seedUser(client.db);
    await assignRole(ctxSystem(client.db), id, 'viewer');
    const viewer = ctxViewer(client.db, id);
    expect(await getRoles(viewer, id)).toEqual(['viewer']);
  });
});

describe('assignRole / revokeRole', () => {
  it('admin context can grant and revoke roles', async () => {
    const adminId = await seedUser(client.db);
    const targetId = await seedUser(client.db);
    await assignRole(ctxSystem(client.db), adminId, 'admin');

    await assignRole(ctxAdmin(client.db, adminId), targetId, 'editor');
    expect(await getRoles(ctxSystem(client.db), targetId)).toEqual(['editor']);

    await revokeRole(ctxAdmin(client.db, adminId), targetId, 'editor');
    expect(await getRoles(ctxSystem(client.db), targetId)).toEqual([]);
  });

  it('viewer context cannot grant or revoke', async () => {
    const viewerId = await seedUser(client.db);
    const targetId = await seedUser(client.db);
    await assignRole(ctxSystem(client.db), viewerId, 'viewer');
    await expect(
      assignRole(ctxViewer(client.db, viewerId), targetId, 'editor'),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(
      revokeRole(ctxViewer(client.db, viewerId), targetId, 'editor'),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('assignRole is idempotent — second call is a no-op', async () => {
    const id = await seedUser(client.db);
    await assignRole(ctxSystem(client.db), id, 'editor');
    await assignRole(ctxSystem(client.db), id, 'editor');
    expect(await getRoles(ctxSystem(client.db), id)).toEqual(['editor']);
  });
});

describe('listUsersWithRoles', () => {
  it('admin sees every user with their roles, sorted by email', async () => {
    // Make a fresh container so we're not contaminated by other tests.
    const id1 = await seedUser(client.db, { email: 'aaa-list@test.local' });
    const id2 = await seedUser(client.db, { email: 'bbb-list@test.local' });
    await assignRole(ctxSystem(client.db), id1, 'admin');
    await assignRole(ctxSystem(client.db), id2, 'viewer');

    const users = await listUsersWithRoles(ctxSystem(client.db));
    const subset = users.filter((u) => u.email.endsWith('-list@test.local'));
    expect(subset[0]?.email).toBe('aaa-list@test.local');
    expect(subset[1]?.email).toBe('bbb-list@test.local');
    expect(subset[0]?.roles).toContain('admin');
    expect(subset[1]?.roles).toContain('viewer');
  });

  it('rejects non-admin callers', async () => {
    const viewer = ctxViewer(client.db, await seedUser(client.db));
    await expect(listUsersWithRoles(viewer)).rejects.toBeInstanceOf(AuthorizationError);
  });
});
