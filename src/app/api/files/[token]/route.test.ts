// Auth: local-mode AuthProvider returns a system context with no token —
// /api/files/[token] is gated by HMAC + the source's public/owned filter,
// not by an Authorization header in this phase.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../../../tests/helpers/migrate';
import { createDb, type DbClient } from '@/lib/db/client';
import { sourceFiles, sources } from '@/lib/db/schema';
import { signFileToken } from '@/lib/files/sign';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';

let pg: StartedPg;
let client: DbClient;

const envKeys = [
  'APP_MODE',
  'DATABASE_URL',
  'LLM_PROVIDER',
  'EMBEDDING_PROVIDER',
  'OCR_PROVIDER',
  'STORAGE_PROVIDER',
  'FILE_TOKEN_SECRET',
] as const;
const originalEnv: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};
const SECRET = 'phase-5-file-token-test-secret-32+';

let publicSourceId: string;
let publicPdfKey: string;
let privateSourceId: string;
let privatePdfKey: string;
const otherOwner = '99999999-9999-9999-9999-999999999999';

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
  process.env.FILE_TOKEN_SECRET = SECRET;

  // Use the same fake-storage singleton the route will see when it calls
  // createProviders(env). loadEnv must run AFTER the env vars are set above.
  const storage = createProviders(loadEnv()).storage;

  // Public source + its PDF
  const [pub] = await client.db
    .insert(sources)
    .values({ slug: 'pub', title: 'Public', isPrivate: false })
    .returning({ id: sources.id });
  if (!pub) throw new Error('seed: no public source');
  publicSourceId = pub.id;
  publicPdfKey = `${publicSourceId}/original.pdf`;
  await storage.put(publicPdfKey, Buffer.from('%PDF-public-bytes'), { contentType: 'application/pdf' });
  await client.db.insert(sourceFiles).values({
    sourceId: publicSourceId,
    role: 'original',
    storageKey: publicPdfKey,
    mimeType: 'application/pdf',
    bytes: 17,
  });

  // Private source owned by someone else + its PDF
  const [priv] = await client.db
    .insert(sources)
    .values({ slug: 'priv', title: 'Private', isPrivate: true, ownerUserId: otherOwner })
    .returning({ id: sources.id });
  if (!priv) throw new Error('seed: no private source');
  privateSourceId = priv.id;
  privatePdfKey = `${privateSourceId}/original.pdf`;
  await storage.put(privatePdfKey, Buffer.from('%PDF-private-bytes'), { contentType: 'application/pdf' });
  await client.db.insert(sourceFiles).values({
    sourceId: privateSourceId,
    role: 'original',
    storageKey: privatePdfKey,
    mimeType: 'application/pdf',
    bytes: 18,
  });
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
  for (const key of envKeys) {
    const prev = originalEnv[key];
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
});

async function getFile(token: string): Promise<Response> {
  const { GET } = await import('./route');
  const req = new Request(`http://localhost/api/files/${token}`);
  return GET(req, { params: Promise.resolve({ token }) });
}

describe('GET /api/files/[token]', () => {
  it('returns 200 with the bytes for a valid token on a visible source', async () => {
    const token = signFileToken(SECRET, { key: publicPdfKey });
    const res = await getFile(token);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString()).toBe('%PDF-public-bytes');
  });

  it('returns 401 when the token is tampered with', async () => {
    const token = signFileToken(SECRET, { key: publicPdfKey });
    const tampered = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    const res = await getFile(tampered);
    expect(res.status).toBe(401);
  });

  it('returns 401 for a missing/empty token', async () => {
    const res = await getFile('');
    expect(res.status).toBe(401);
  });

  it('returns 404 for a key that no source_files row references', async () => {
    const token = signFileToken(SECRET, { key: 'nonexistent/file.pdf' });
    const res = await getFile(token);
    expect(res.status).toBe(404);
  });

  it('serves a private source to a system viewer (auth filter unit-tested elsewhere)', async () => {
    // The auth filter (system / owner / anonymous matrix) is exercised by
    // the findSourceFileByKey repository test. Local-mode auth is always
    // system here, so the route just confirms the happy path through the
    // helper. Phase 8 wires the hosted-mode test once Better-auth lands.
    const token = signFileToken(SECRET, { key: privatePdfKey });
    const res = await getFile(token);
    expect(res.status).toBe(200);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.toString()).toBe('%PDF-private-bytes');
  });
});
