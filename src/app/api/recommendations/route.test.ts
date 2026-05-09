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

  // Seed recs directly. The upload pipeline is exhaustively covered by its
  // own tests — here we only exercise the route handler's search behaviour,
  // so inserting straight into the table is faster and keeps the failure
  // domain narrow.
  const [src] = await client.db
    .insert(sources)
    .values({ slug: 'route-test-src', title: 'Route Test Source', isPrivate: false })
    .returning({ id: sources.id });
  if (!src) throw new Error('seed: no source row');
  await client.db.insert(recommendations).values([
    {
      sourceId: src.id,
      slug: 'route-rec-dolphin',
      title: 'Protect dolphin migration routes',
      body: 'Establish marine corridors free of commercial shipping.',
    },
    {
      sourceId: src.id,
      slug: 'route-rec-orca',
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

async function getRecs(qs: string): Promise<Response> {
  const { GET } = await import('./route');
  const req = new Request(`http://localhost/api/recommendations?${qs}`);
  return GET(req);
}

describe('GET /api/recommendations', () => {
  it('returns matching recs for a keyword', async () => {
    const res = await getRecs('q=dolphin');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      q: string;
      limit: number;
      results: Array<{ id: string; title: string; snippet: string; rank: number; sourceId: string }>;
    };
    expect(body.q).toBe('dolphin');
    expect(body.limit).toBe(50);
    expect(body.results.length).toBeGreaterThanOrEqual(1);
    expect(body.results[0]?.title).toContain('dolphin');
    expect(body.results[0]?.snippet.toLowerCase()).toContain('dolphin');
  });

  it('respects the limit query parameter', async () => {
    // `orca` matches one seeded rec; even with limit=10 we should only get 1.
    const res = await getRecs('q=orca&limit=10');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { limit: number; results: unknown[] };
    expect(body.limit).toBe(10);
    expect(body.results.length).toBeGreaterThanOrEqual(1);
  });

  it('returns 400 when q is missing', async () => {
    const res = await getRecs('');
    expect(res.status).toBe(400);
  });

  it('returns 400 when q is too short', async () => {
    const res = await getRecs('q=a');
    expect(res.status).toBe(400);
  });

  it('returns 400 when limit is out of range', async () => {
    const res = await getRecs('q=dolphin&limit=9999');
    expect(res.status).toBe(400);
  });
});
