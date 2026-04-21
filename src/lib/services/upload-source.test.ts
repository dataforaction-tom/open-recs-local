import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type DbClient } from '../db/client';
import { sourceFiles, sources } from '../db/schema';
import { createFakeStorage } from '../providers/storage/fake';
import { createQueue, type Queue } from '../jobs/queue';
import type { RepoContext } from '../repositories/types';
import { uploadSource } from './upload-source';

let pg: StartedPg;
let client: DbClient;
let queue: Queue;

function systemCtx(): RepoContext {
  return {
    db: client.db,
    auth: { user: { id: 'system' }, roles: ['admin'], isSystem: true },
  };
}

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
  client = createDb(pg.url);
  queue = await createQueue({ connectionString: pg.url });
}, 120_000);

afterAll(async () => {
  await queue?.stop();
  await client?.sql.end();
  await pg?.container.stop();
});

describe('uploadSource service', () => {
  it('persists a source, a source_files row, writes storage, and enqueues source.parse', async () => {
    const storage = createFakeStorage();
    const buffer = Buffer.from('%PDF-1.4 fake pdf bytes');
    const title = `Upload Test ${randomUUID().slice(0, 6)}`;

    const result = await uploadSource(
      systemCtx(),
      {
        filename: 'report.pdf',
        contentType: 'application/pdf',
        bytes: buffer,
        title,
        isPrivate: false,
      },
      { storage, queue },
    );

    expect(result.sourceId).toBeTruthy();
    expect(result.jobId).toBeTruthy();

    // (a) storage
    const storageKey = `sources/${result.sourceId}/report.pdf`;
    expect(await storage.exists(storageKey)).toBe(true);
    const roundTrip = await storage.get(storageKey);
    expect(roundTrip.equals(buffer)).toBe(true);

    // (b) sources row
    const sourceRows = await client.db
      .select()
      .from(sources)
      .where(eq(sources.id, result.sourceId));
    expect(sourceRows).toHaveLength(1);
    const sourceRow = sourceRows[0]!;
    expect(sourceRow.title).toBe(title);
    expect(sourceRow.status).toBe('pending');
    expect(sourceRow.isPrivate).toBe(false);

    // (c) source_files row
    const fileRows = await client.db
      .select()
      .from(sourceFiles)
      .where(eq(sourceFiles.sourceId, result.sourceId));
    expect(fileRows).toHaveLength(1);
    const fileRow = fileRows[0]!;
    expect(fileRow.role).toBe('original');
    expect(fileRow.storageKey).toBe(storageKey);
    expect(fileRow.mimeType).toBe('application/pdf');
    expect(fileRow.bytes).toBe(buffer.length);

    // (d) pgboss job
    const jobRows = await queue.rawQuery(
      `select name, data from pgboss.job where id = '${result.jobId}'`,
    );
    expect(jobRows).toHaveLength(1);
    const jobRow = jobRows[0]!;
    expect(jobRow.name).toBe('source.parse');
    expect(jobRow.data).toEqual({ sourceId: result.sourceId });
  });

  it('derives a unique slug when two uploads share a filename', async () => {
    const storage = createFakeStorage();
    const ctx = systemCtx();
    const mk = () =>
      uploadSource(
        ctx,
        {
          filename: 'dup.pdf',
          contentType: 'application/pdf',
          bytes: Buffer.from('pdf-bytes'),
          title: 'Dup',
        },
        { storage, queue },
      );
    const a = await mk();
    const b = await mk();
    expect(a.sourceId).not.toEqual(b.sourceId);
  });
});
