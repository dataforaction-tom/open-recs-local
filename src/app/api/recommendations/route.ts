import { z } from 'zod';
import { createDb, type DbClient } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { searchRecommendationsKeyword } from '@/lib/repositories/recommendation';
import type { RepoContext } from '@/lib/repositories/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Query-string schema for `GET /api/recommendations`.
 *
 * `q` — minimum 2 chars to avoid degenerate `ts_rank_cd` queries that would
 * match almost every row. 200 char cap is defensive; `websearch_to_tsquery`
 * happily parses much longer strings but we don't need to accept arbitrary
 * input here.
 *
 * `limit` — coerced because query strings are strings; capped at 200 to
 * protect the response payload.
 */
const QuerySchema = z.object({
  q: z.string().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

function jsonError(status: number, error: string, detail?: unknown): Response {
  return new Response(JSON.stringify({ error, ...(detail !== undefined ? { detail } : {}) }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    q: url.searchParams.get('q') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(400, 'invalid request', parsed.error.issues);
  }
  const { q, limit } = parsed.data;

  const env = loadEnv();
  const providers = createProviders(env);

  let client: DbClient | undefined;
  try {
    client = createDb(env.DATABASE_URL);
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    const results = await searchRecommendationsKeyword(ctx, q, limit ?? 50);

    return new Response(JSON.stringify({ results, q, limit: limit ?? 50 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, 'search failed', message);
  } finally {
    await client?.sql.end({ timeout: 5 }).catch(() => {});
  }
}
