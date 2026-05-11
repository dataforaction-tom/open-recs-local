import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type Db, type DbClient } from '../db/client';
import {
  evidenceTypes,
  progressRatings,
  progressUpdates,
  recommendations,
  sources,
} from '../db/schema';
import { createProgressUpdate, listProgressUpdates } from './progress-update';
import { seedUser } from '../../../tests/helpers/seed-user';
import type { RepoContext } from './types';

let pg: StartedPg;
let client: DbClient;

function ctxSystem(db: Db): RepoContext {
  // Mirror the local AuthProvider's non-uuid user.id so FK-enforced columns
  // store NULL via the UUID_RE guard in the repo layer.
  return { db, auth: { user: { id: 'system' }, roles: ['admin'], isSystem: true } };
}
function ctxUser(db: Db, userId: string): RepoContext {
  return { db, auth: { user: { id: userId }, roles: ['viewer'], isSystem: false } };
}

async function seedRec(args: {
  sourceSlug: string;
  recSlug: string;
  isPrivate?: boolean;
  ownerUserId?: string | null;
}): Promise<{ sourceId: string; recId: string }> {
  const [src] = await client.db
    .insert(sources)
    .values({
      slug: args.sourceSlug,
      title: args.sourceSlug,
      isPrivate: args.isPrivate ?? false,
      ownerUserId: args.ownerUserId ?? null,
    })
    .returning({ id: sources.id });
  if (!src) throw new Error('seedRec: no source row');
  const [rec] = await client.db
    .insert(recommendations)
    .values({
      sourceId: src.id,
      slug: args.recSlug,
      title: args.recSlug,
      body: `body for ${args.recSlug}`,
    })
    .returning({ id: recommendations.id });
  if (!rec) throw new Error('seedRec: no rec row');
  return { sourceId: src.id, recId: rec.id };
}

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
  client = createDb(pg.url);
  // Seed one of each taxonomy row so list joins succeed.
  await client.db
    .insert(evidenceTypes)
    .values({ slug: 'document', name: 'Document' })
    .onConflictDoNothing();
  await client.db
    .insert(progressRatings)
    .values({ slug: 'some-progress', name: 'Some progress', weight: 25 })
    .onConflictDoNothing();
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

describe('createProgressUpdate', () => {
  it('inserts a row with all fields and returns id + createdAt', async () => {
    const { recId } = await seedRec({ sourceSlug: 'pu-create-src', recSlug: 'pu-create-rec' });
    const result = await createProgressUpdate(ctxSystem(client.db), {
      recommendationId: recId,
      progressNotes: 'Made some headway this quarter',
      evidenceType: 'document',
      evidenceUrl: 'https://example.com/q3-report.pdf',
      userProgressRating: 'some-progress',
    });

    expect(result).not.toBeNull();
    expect(result?.id).toMatch(/^[0-9a-f]{8}-/);
    expect(result?.createdAt).toBeInstanceOf(Date);

    const list = await listProgressUpdates(ctxSystem(client.db), recId);
    expect(list).toHaveLength(1);
    expect(list[0]?.progressNotes).toBe('Made some headway this quarter');
    expect(list[0]?.evidenceType?.slug).toBe('document');
    expect(list[0]?.evidenceType?.name).toBe('Document');
    expect(list[0]?.evidenceUrl).toBe('https://example.com/q3-report.pdf');
    expect(list[0]?.userProgressRating?.slug).toBe('some-progress');
    expect(list[0]?.userProgressRating?.weight).toBe(25);
  });

  it('inserts a notes-only update with NULL evidence/rating/author', async () => {
    const { recId } = await seedRec({ sourceSlug: 'pu-minimal-src', recSlug: 'pu-minimal-rec' });
    // Mirror the local-mode AuthProvider: user.id is the literal string
    // 'system' (not a uuid), which the repo writes as NULL in author_user_id.
    const localCtx: RepoContext = {
      db: client.db,
      auth: { user: { id: 'system', name: 'system' }, roles: ['admin'], isSystem: true },
    };
    const result = await createProgressUpdate(localCtx, {
      recommendationId: recId,
      progressNotes: 'Just a note',
    });
    expect(result).not.toBeNull();

    const list = await listProgressUpdates(localCtx, recId);
    expect(list).toHaveLength(1);
    expect(list[0]?.progressNotes).toBe('Just a note');
    expect(list[0]?.evidenceType).toBeNull();
    expect(list[0]?.evidenceUrl).toBeNull();
    expect(list[0]?.userProgressRating).toBeNull();
    expect(list[0]?.authorUserId).toBeNull();
  });

  it('persists authorUserId from a uuid-bearing context', async () => {
    const ownerId = await seedUser(client.db);
    const { recId } = await seedRec({
      sourceSlug: 'pu-author-src',
      recSlug: 'pu-author-rec',
    });
    await createProgressUpdate(ctxUser(client.db, ownerId), {
      recommendationId: recId,
      progressNotes: 'mine',
    });

    const list = await listProgressUpdates(ctxSystem(client.db), recId);
    expect(list[0]?.authorUserId).toBe(ownerId);
  });

  it('returns null when the rec is invisible to the viewer', async () => {
    const ownerId = await seedUser(client.db);
    const otherId = await seedUser(client.db);
    const { recId } = await seedRec({
      sourceSlug: 'pu-private-src',
      recSlug: 'pu-private-rec',
      isPrivate: true,
      ownerUserId: ownerId,
    });

    const result = await createProgressUpdate(ctxUser(client.db, otherId), {
      recommendationId: recId,
      progressNotes: 'sneaky',
    });
    expect(result).toBeNull();

    // Owner can write fine.
    const ok = await createProgressUpdate(ctxUser(client.db, ownerId), {
      recommendationId: recId,
      progressNotes: 'legit',
    });
    expect(ok).not.toBeNull();
  });

  it('returns null when the rec id does not exist', async () => {
    const result = await createProgressUpdate(ctxSystem(client.db), {
      recommendationId: randomUUID(),
      progressNotes: 'phantom',
    });
    expect(result).toBeNull();
  });
});

describe('listProgressUpdates', () => {
  it('returns updates newest-first', async () => {
    const { recId } = await seedRec({ sourceSlug: 'pu-list-src', recSlug: 'pu-list-rec' });
    await client.db.insert(progressUpdates).values([
      {
        recommendationId: recId,
        progressNotes: 'first',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        recommendationId: recId,
        progressNotes: 'second',
        createdAt: new Date('2026-02-01T00:00:00Z'),
      },
      {
        recommendationId: recId,
        progressNotes: 'third',
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
    ]);

    const list = await listProgressUpdates(ctxSystem(client.db), recId);
    expect(list.map((u) => u.progressNotes)).toEqual(['third', 'second', 'first']);
  });

  it('returns an empty array for an invisible rec', async () => {
    const ownerId = await seedUser(client.db);
    const otherId = await seedUser(client.db);
    const { recId } = await seedRec({
      sourceSlug: 'pu-list-private-src',
      recSlug: 'pu-list-private-rec',
      isPrivate: true,
      ownerUserId: ownerId,
    });
    await client.db
      .insert(progressUpdates)
      .values({ recommendationId: recId, progressNotes: 'secret' });

    const strangerView = await listProgressUpdates(ctxUser(client.db, otherId), recId);
    expect(strangerView).toEqual([]);

    const ownerView = await listProgressUpdates(ctxUser(client.db, ownerId), recId);
    expect(ownerView).toHaveLength(1);
  });

  it('returns an empty array for an unknown rec id', async () => {
    const list = await listProgressUpdates(ctxSystem(client.db), randomUUID());
    expect(list).toEqual([]);
  });

  it('returns an empty array for a malformed uuid', async () => {
    const list = await listProgressUpdates(ctxSystem(client.db), 'not-a-uuid');
    expect(list).toEqual([]);
  });

  it('renders evidence and rating as null when the slug is unknown', async () => {
    const { recId } = await seedRec({ sourceSlug: 'pu-orphan-src', recSlug: 'pu-orphan-rec' });
    await client.db.insert(progressUpdates).values({
      recommendationId: recId,
      progressNotes: 'orphan refs',
      evidenceType: 'no-such-evidence',
      userProgressRating: 'no-such-rating',
    });

    const list = await listProgressUpdates(ctxSystem(client.db), recId);
    expect(list[0]?.evidenceType).toBeNull();
    expect(list[0]?.userProgressRating).toBeNull();
  });
});
