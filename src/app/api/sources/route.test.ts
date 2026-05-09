import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPostgres, type StartedPg } from '../../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../../tests/helpers/migrate';
import { createDb, type DbClient } from '@/lib/db/client';
import { sourceFiles, sources } from '@/lib/db/schema';

let pg: StartedPg;
let client: DbClient;

// Values that loadEnv() needs. We stamp these into process.env before each
// test and restore originals afterwards — the route reads env lazily.
const envKeys = [
  'APP_MODE',
  'DATABASE_URL',
  'LLM_PROVIDER',
  'EMBEDDING_PROVIDER',
  'OCR_PROVIDER',
  'STORAGE_PROVIDER',
] as const;
const originalEnv: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
  client = createDb(pg.url);

  for (const key of envKeys) originalEnv[key] = process.env[key];
  process.env.APP_MODE = 'local';
  process.env.DATABASE_URL = pg.url;
  process.env.LLM_PROVIDER = 'fake';
  process.env.EMBEDDING_PROVIDER = 'fake';
  process.env.OCR_PROVIDER = 'fake';
  process.env.STORAGE_PROVIDER = 'fake';
}, 120_000);

afterAll(async () => {
  // Dynamic import so module-level queue isn't touched until env is set.
  const route = await import('./route');
  await route.__resetQueueForTests();
  await client?.sql.end();
  await pg?.container.stop();
  for (const key of envKeys) {
    const prev = originalEnv[key];
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
});

afterEach(async () => {
  // Reset the queue between tests so state is fresh and we observe only
  // jobs enqueued by the current test.
  const route = await import('./route');
  await route.__resetQueueForTests();
});

function pdfFile(name: string, bytes: Uint8Array, type = 'application/pdf'): File {
  // File is globally available in Node 20+. Copy into a fresh ArrayBuffer so
  // TS's DOM BlobPart typings (which reject SharedArrayBuffer-backed views)
  // are satisfied under strict settings.
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new File([copy], name, { type });
}

async function postSources(form: FormData): Promise<Response> {
  const { POST } = await import('./route');
  const req = new Request('http://localhost/api/sources', { method: 'POST', body: form });
  return POST(req);
}

describe('POST /api/sources', () => {
  it('persists a source + source_files row and enqueues source.parse', async () => {
    const form = new FormData();
    form.set('file', pdfFile('report.pdf', new TextEncoder().encode('%PDF-1.4 fake')));
    form.set('title', 'Route Happy Path');
    form.set('is_private', 'false');

    const res = await postSources(form);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { sourceId: string; jobId: string; status: string };
    expect(body.status).toBe('queued');
    expect(body.sourceId).toBeTruthy();
    expect(body.jobId).toBeTruthy();

    const sourceRows = await client.db.select().from(sources).where(eq(sources.id, body.sourceId));
    expect(sourceRows[0]?.title).toBe('Route Happy Path');

    const fileRows = await client.db
      .select()
      .from(sourceFiles)
      .where(eq(sourceFiles.sourceId, body.sourceId));
    expect(fileRows[0]?.storageKey).toBe(`sources/${body.sourceId}/report.pdf`);
    expect(fileRows[0]?.mimeType).toBe('application/pdf');

    // pgboss.job carries the enqueued source.parse with the right payload.
    const jobRows = await client.sql<Array<{ name: string; data: unknown }>>`
      select name, data from pgboss.job where id = ${body.jobId}
    `;
    expect(jobRows[0]?.name).toBe('source.parse');
    expect(jobRows[0]?.data).toEqual({ sourceId: body.sourceId });
  });

  it('returns 400 when the file field is missing', async () => {
    const form = new FormData();
    form.set('title', 'no file');
    const res = await postSources(form);
    expect(res.status).toBe(400);
  });

  it('returns 415 for a non-PDF content-type', async () => {
    const form = new FormData();
    form.set('file', pdfFile('notes.txt', new TextEncoder().encode('hello'), 'text/plain'));
    const res = await postSources(form);
    expect(res.status).toBe(415);
  });

  it('returns 413 for an oversize upload', async () => {
    // Allocate just over the 50 MiB cap. Buffer.alloc fills with zeros; the
    // route only reads `.size` before rejecting, so no actual bytes are hashed.
    const big = new Uint8Array(50 * 1024 * 1024 + 1);
    const form = new FormData();
    form.set('file', pdfFile('big.pdf', big));
    const res = await postSources(form);
    expect(res.status).toBe(413);
  });
});
