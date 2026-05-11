// Auth: local-mode AuthProvider returns a system context with no token. The
// route handler trusts that context for filtering — there's no auth header to
// send, so the conventional "401 without token" check doesn't apply here.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../../tests/helpers/migrate';
import { createDb, type DbClient } from '@/lib/db/client';
import { recommendations, sources } from '@/lib/db/schema';

let pg: StartedPg;
let client: DbClient;
let seededSourceId: string;

const envKeys = [
  'APP_MODE',
  'DATABASE_URL',
  'LLM_PROVIDER',
  'EMBEDDING_PROVIDER',
  'OCR_PROVIDER',
  'STORAGE_PROVIDER',
] as const;
const originalEnv: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

function vec(slot: number, value = 1): number[] {
  const v = new Array(768).fill(0);
  v[slot] = value;
  return v;
}

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
    .values({ slug: 'search-route-src', title: 'Search Route Source', isPrivate: false })
    .returning({ id: sources.id });
  if (!src) throw new Error('seed: no source row');
  seededSourceId = src.id;

  await client.db.insert(recommendations).values([
    {
      sourceId: src.id,
      slug: 'search-rec-dolphin',
      title: 'Protect dolphin migration routes',
      body: 'Establish marine corridors free of commercial shipping.',
      embedding: vec(0),
    },
    {
      sourceId: src.id,
      slug: 'search-rec-orca',
      title: 'Monitor orca pod health',
      body: 'Annual survey of southern resident populations.',
      embedding: vec(1),
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

async function getSearch(qs: string): Promise<Response> {
  const { GET } = await import('./route');
  const req = new Request(`http://localhost/api/search?${qs}`);
  return GET(req);
}

type SearchBody = {
  q: string;
  mode: 'hybrid';
  limit: number;
  results: Array<{
    id: string;
    title: string;
    body: string;
    sourceId: string;
    sourceSlug: string;
    sourceTitle: string;
    createdAt: string;
    rrfScore: number | null;
    keywordRank: number | null;
    vectorRank: number | null;
  }>;
};

describe('GET /api/search', () => {
  it('returns hybrid-ranked recs for a keyword (mode=hybrid, shape includes rrfScore)', async () => {
    const res = await getSearch('q=dolphin');
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchBody;
    expect(body.q).toBe('dolphin');
    expect(body.mode).toBe('hybrid');
    expect(body.results.length).toBeGreaterThanOrEqual(1);
    expect(body.results[0]?.title).toBe('Protect dolphin migration routes');
    expect(typeof body.results[0]?.rrfScore).toBe('number');
    expect(typeof body.results[0]?.keywordRank).toBe('number');
    expect(Object.keys(body.results[0] ?? {}).sort()).toEqual(
      [
        'body',
        'createdAt',
        'id',
        'keywordRank',
        'rrfScore',
        'sourceId',
        'sourceSlug',
        'sourceTitle',
        'title',
        'vectorRank',
      ].sort(),
    );
  });

  it('respects the limit query parameter', async () => {
    const res = await getSearch('q=orca&limit=10');
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchBody;
    expect(body.limit).toBe(10);
    expect(body.results.length).toBeGreaterThanOrEqual(1);
  });

  it('respects the source filter', async () => {
    const res = await getSearch(`q=dolphin&source=${seededSourceId}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchBody;
    expect(body.results.length).toBeGreaterThanOrEqual(1);
    for (const r of body.results) expect(r.sourceId).toBe(seededSourceId);
  });

  it('returns 400 when q is missing', async () => {
    const res = await getSearch('');
    expect(res.status).toBe(400);
  });

  it('returns 400 when q is too short (< 2 chars)', async () => {
    const res = await getSearch('q=a');
    expect(res.status).toBe(400);
  });

  it('returns 400 when limit is out of range', async () => {
    const res = await getSearch('q=dolphin&limit=9999');
    expect(res.status).toBe(400);
  });

  it('returns 400 when source is not a uuid', async () => {
    const res = await getSearch('q=dolphin&source=not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('SQL-injection-style q strings do not 500 and do not corrupt the table', async () => {
    const before = await client.db.execute<{ count: string | number }>(
      (await import('drizzle-orm')).sql`select count(*)::int as count from recommendations`,
    );
    const beforeCount = Number(before[0]?.count ?? 0);

    const a = await getSearch(`q=${encodeURIComponent("' OR 1=1 --")}`);
    const b = await getSearch(`q=${encodeURIComponent("admin'; DROP TABLE recommendations;--")}`);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const after = await client.db.execute<{ count: string | number }>(
      (await import('drizzle-orm')).sql`select count(*)::int as count from recommendations`,
    );
    const afterCount = Number(after[0]?.count ?? 0);
    expect(afterCount).toBe(beforeCount);
  });
});
