import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type Db, type DbClient } from '../db/client';
import type { Role } from '../providers/auth/types';
import {
  createSource,
  createSourceFile,
  findSourceBySlug,
  findSourceFileByKey,
  getSourceWithPagesBySlug,
} from './source';
import { NotFoundError } from './types';
import { sourcePages } from '../db/schema';
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

  describe('findSourceFileByKey', () => {
    const ownerA = randomUUID();
    const ownerB = randomUUID();
    let publicKey: string;
    let privateKey: string;

    beforeAll(async () => {
      const sys = ctxSystem(client.db);
      const pub = await createSource(sys, { slug: 'sf-public', title: 'sf-public', isPrivate: false });
      const priv = await createSource(sys, {
        slug: 'sf-private',
        title: 'sf-private',
        isPrivate: true,
        ownerUserId: ownerA,
      });
      publicKey = `${pub.id}/original.pdf`;
      privateKey = `${priv.id}/original.pdf`;
      await createSourceFile(sys, {
        sourceId: pub.id,
        role: 'original',
        storageKey: publicKey,
        mimeType: 'application/pdf',
        bytes: 1,
      });
      await createSourceFile(sys, {
        sourceId: priv.id,
        role: 'original',
        storageKey: privateKey,
        mimeType: 'application/pdf',
        bytes: 1,
      });
    });

    it('returns the row for a public source to any viewer', async () => {
      const anon = ctxUser(client.db, randomUUID());
      const found = await findSourceFileByKey(anon, publicKey);
      expect(found).not.toBeNull();
      expect(found?.role).toBe('original');
    });

    it('returns the row for a private source to its owner', async () => {
      const owner = ctxUser(client.db, ownerA);
      const found = await findSourceFileByKey(owner, privateKey);
      expect(found).not.toBeNull();
    });

    it('returns null for a private source to a different user', async () => {
      const other = ctxUser(client.db, ownerB);
      const found = await findSourceFileByKey(other, privateKey);
      expect(found).toBeNull();
    });

    it('returns null when no source_files row matches the key', async () => {
      const sys = ctxSystem(client.db);
      const found = await findSourceFileByKey(sys, 'no-such-key.pdf');
      expect(found).toBeNull();
    });

    it('returns the row to a system viewer regardless of privacy', async () => {
      const sys = ctxSystem(client.db);
      const found = await findSourceFileByKey(sys, privateKey);
      expect(found).not.toBeNull();
    });
  });

  describe('getSourceWithPagesBySlug', () => {
    const owner = randomUUID();

    it('returns source + pages + originalPdfKey for a public source', async () => {
      const sys = ctxSystem(client.db);
      const created = await createSource(sys, {
        slug: 'gswpbs-public',
        title: 'GSWPBS Public',
        isPrivate: false,
      });
      await client.db.insert(sourcePages).values([
        { sourceId: created.id, pageNumber: 1, markdown: 'page one', imageRefs: ['img/p1-a.png'] },
        { sourceId: created.id, pageNumber: 2, markdown: 'page two', imageRefs: [] },
      ]);
      const pdfKey = `${created.id}/original.pdf`;
      await createSourceFile(sys, {
        sourceId: created.id,
        role: 'original',
        storageKey: pdfKey,
        mimeType: 'application/pdf',
        bytes: 4,
      });

      const result = await getSourceWithPagesBySlug(sys, 'gswpbs-public');
      expect(result.source.slug).toBe('gswpbs-public');
      expect(result.pages).toHaveLength(2);
      expect(result.pages[0]?.pageNumber).toBe(1);
      expect(result.pages[0]?.imageRefs).toEqual(['img/p1-a.png']);
      expect(result.originalPdfKey).toBe(pdfKey);
    });

    it('returns the row for a private source to its owner', async () => {
      const sys = ctxSystem(client.db);
      const created = await createSource(sys, {
        slug: 'gswpbs-priv',
        title: 'GSWPBS Priv',
        isPrivate: true,
        ownerUserId: owner,
      });
      await client.db.insert(sourcePages).values([
        { sourceId: created.id, pageNumber: 1, markdown: 'p1', imageRefs: [] },
      ]);
      const pdfKey = `${created.id}/original.pdf`;
      await createSourceFile(sys, {
        sourceId: created.id,
        role: 'original',
        storageKey: pdfKey,
        mimeType: 'application/pdf',
        bytes: 4,
      });

      const ownerCtx = ctxUser(client.db, owner);
      const result = await getSourceWithPagesBySlug(ownerCtx, 'gswpbs-priv');
      expect(result.source.slug).toBe('gswpbs-priv');
    });

    it('throws NotFoundError when the slug does not exist', async () => {
      const sys = ctxSystem(client.db);
      await expect(getSourceWithPagesBySlug(sys, 'no-such-slug')).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the source is private and viewer cannot see it', async () => {
      const otherUser = ctxUser(client.db, randomUUID());
      await expect(getSourceWithPagesBySlug(otherUser, 'gswpbs-priv')).rejects.toThrow(NotFoundError);
    });

    it('returns originalPdfKey=null when no original-role file exists yet', async () => {
      const sys = ctxSystem(client.db);
      const created = await createSource(sys, {
        slug: 'gswpbs-no-pdf',
        title: 'GSWPBS No PDF',
      });
      await client.db.insert(sourcePages).values([
        { sourceId: created.id, pageNumber: 1, markdown: 'p1', imageRefs: [] },
      ]);

      const result = await getSourceWithPagesBySlug(sys, 'gswpbs-no-pdf');
      expect(result.originalPdfKey).toBeNull();
    });
  });
});
