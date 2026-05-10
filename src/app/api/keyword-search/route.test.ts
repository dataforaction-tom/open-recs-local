// Auth: local-mode AuthProvider returns a system context with no token. The
// route handler trusts that context for filtering — there's no auth header
// to send, so the conventional "401 without token" check doesn't apply here.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../../tests/helpers/migrate';
import { createDb, type DbClient } from '@/lib/db/client';
import { recommendations, sources } from '@/lib/db/schema';

let pg: StartedPg;
let client: DbClient;

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

  const [src] = await client.db
    .insert(sources)
    .values({ slug: 'kw-route-src', title: 'Keyword Route Source', isPrivate: false })
    .returning({ id: sources.id });
  if (!src) throw new Error('seed: no source row');
  await client.db.insert(recommendations).values([
    {
      sourceId: src.id,
      slug: 'kw-rec-dolphin',
      title: 'Protect dolphin migration routes',
      body: 'Establish marine corridors free of commercial shipping.',
    },
    {
      sourceId: src.id,
      slug: 'kw-rec-orca',
      title: 'Monitor orca pod health',
      body: 'Annual survey of southern resident populations.',
    },
  ]);
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

async function getKeyword(qs: string): Promise<Response> {
  const { GET } = await import('./route');
  const req = new Request(`http://localhost/api/keyword-search?${qs}`);
  return GET(req);
}

type KeywordBody = {
  q: string;
  mode: 'keyword';
  limit: number;
  results: Array<{
    id: string;
    title: string;
    body: string;
    sourceId: string;
    sourceSlug: string;
    rrfScore: number | null;
    keywordRank: number | null;
    vectorRank: number | null;
  }>;
};

describe('GET /api/keyword-search', () => {
  it('returns keyword-only results (mode=keyword, rrfScore=null, vectorRank=null)', async () => {
    const res = await getKeyword('q=dolphin');
    expect(res.status).toBe(200);
    const body = (await res.json()) as KeywordBody;
    expect(body.q).toBe('dolphin');
    expect(body.mode).toBe('keyword');
    expect(body.results.length).toBeGreaterThanOrEqual(1);
    expect(body.results[0]?.title).toBe('Protect dolphin migration routes');
    expect(body.results[0]?.rrfScore).toBeNull();
    expect(body.results[0]?.vectorRank).toBeNull();
    expect(typeof body.results[0]?.keywordRank).toBe('number');
  });

  it('respects the limit query parameter', async () => {
    const res = await getKeyword('q=orca&limit=10');
    expect(res.status).toBe(200);
    const body = (await res.json()) as KeywordBody;
    expect(body.limit).toBe(10);
    expect(body.results.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 400 when q is missing', async () => {
    const res = await getKeyword('');
    expect(res.status).toBe(400);
  });

  it('SQL-injection-style q strings do not 500 and do not corrupt the table', async () => {
    const a = await getKeyword(`q=${encodeURIComponent("' OR 1=1 --")}`);
    const b = await getKeyword(`q=${encodeURIComponent("admin'; DROP TABLE recommendations;--")}`);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const rows = await client.db.execute<{ count: string | number }>(
      (await import('drizzle-orm')).sql`select count(*)::int as count from recommendations`,
    );
    expect(Number(rows[0]?.count ?? 0)).toBeGreaterThan(0);
  });
});
