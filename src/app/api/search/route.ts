import { z } from 'zod';
import { createDb, type DbClient } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import type { RepoContext } from '@/lib/repositories/types';
import { searchRecommendations } from '@/lib/services/search';
import type { SearchFilters } from '@/lib/services/search-sql';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const QuerySchema = z.object({
  q: z.string().min(2).max(200),
  source: z.string().uuid().optional(),
  theme: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
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
    source: url.searchParams.get('source') ?? undefined,
    theme: url.searchParams.get('theme') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(400, 'invalid request', parsed.error.issues);
  }
  const { q, source, theme, limit } = parsed.data;

  const env = loadEnv();
  const providers = createProviders(env);

  let client: DbClient | undefined;
  try {
    client = createDb(env.DATABASE_URL);
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    const filters: SearchFilters = {};
    if (source) filters.sourceId = source;
    if (theme) filters.thematicAreaId = theme;

    const results = await searchRecommendations(
      {
        ctx,
        q,
        filters,
        mode: 'hybrid',
        ...(limit !== undefined ? { limit } : {}),
      },
      { embedding: providers.embedding },
    );

    return new Response(
      JSON.stringify({ results, q, mode: 'hybrid', limit: limit ?? 50 }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, 'search failed', message);
  } finally {
    await client?.sql.end({ timeout: 5 }).catch(() => {});
  }
}
