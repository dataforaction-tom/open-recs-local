import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type Db, type DbClient } from '../db/client';
import type { Role } from '../providers/auth/types';
import { createSource, findSourceBySlug } from './source';
import { AuthorizationError, type RepoContext } from './types';

let pg: StartedPg;
let client: DbClient;

function ctxSystem(db: Db): RepoContext {
  return { db, auth: { user: { id: randomUUID() }, roles: ['admin'], isSystem: true } };
}
function ctxUser(db: Db, userId: string, roles: Role[] = ['viewer']): RepoContext {
  return { db, auth: { user: { id: userId }, roles, isSystem: false } };
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

describe('sourceRepo', () => {
  it('createSource with system ctx writes a row', async () => {
    const ctx = ctxSystem(client.db);
    const out = await createSource(ctx, { slug: 'public-1', title: 'Public One' });
    expect(out.id).toBeTruthy();
    const found = await findSourceBySlug(ctx, 'public-1');
    expect(found?.slug).toBe('public-1');
  });

  it('createSource with viewer ctx throws AuthorizationError and writes nothing', async () => {
    const ctx = ctxUser(client.db, randomUUID(), ['viewer']);
    await expect(
      createSource(ctx, { slug: 'nope', title: 'Nope' }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    const found = await findSourceBySlug(ctxSystem(client.db), 'nope');
    expect(found).toBeNull();
  });

  it('findSourceBySlug returns public sources for any ctx', async () => {
    await createSource(ctxSystem(client.db), {
      slug: 'public-2',
      title: 'Public Two',
      isPrivate: false,
    });
    const viewer = ctxUser(client.db, randomUUID(), ['viewer']);
    const found = await findSourceBySlug(viewer, 'public-2');
    expect(found?.slug).toBe('public-2');
  });

  it('findSourceBySlug returns null for a private source when ctx is a different user', async () => {
    const ownerA = randomUUID();
    await createSource(ctxSystem(client.db), {
      slug: 'private-1',
      title: 'Private One',
      isPrivate: true,
      ownerUserId: ownerA,
    });
    const other = ctxUser(client.db, randomUUID(), ['viewer']);
    const found = await findSourceBySlug(other, 'private-1');
    expect(found).toBeNull();
  });

  it('findSourceBySlug returns the row when ctx is the owner', async () => {
    const ownerB = randomUUID();
    await createSource(ctxSystem(client.db), {
      slug: 'private-2',
      title: 'Private Two',
      isPrivate: true,
      ownerUserId: ownerB,
    });
    const owner = ctxUser(client.db, ownerB, ['viewer']);
    const found = await findSourceBySlug(owner, 'private-2');
    expect(found?.slug).toBe('private-2');
  });

  it('findSourceBySlug returns the row when ctx is system', async () => {
    await createSource(ctxSystem(client.db), {
      slug: 'private-3',
      title: 'Private Three',
      isPrivate: true,
      ownerUserId: randomUUID(),
    });
    const sys = ctxSystem(client.db);
    const found = await findSourceBySlug(sys, 'private-3');
    expect(found?.slug).toBe('private-3');
  });
});
