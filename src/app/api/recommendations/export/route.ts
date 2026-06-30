import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { getSharedDb } from '@/lib/db/client';
import { listRecentRecommendations } from '@/lib/repositories/recommendation';
import type { RepoContext } from '@/lib/repositories/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * `GET /api/recommendations/export` — bulk CSV export of the most recent
 * recommendations. Uses the shared DB pool and the same auth context as the
 * list page, so the caller only sees rows they are authorized to read.
 *
 * Columns: id,title,body,sourceTitle,sourceSlug,createdAt
 */
export async function GET(req: Request): Promise<Response> {
  const env = loadEnv();
  const providers = createProviders(env);

  try {
    const { db } = await getSharedDb(env.DATABASE_URL);
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db, auth };

    const rows = await listRecentRecommendations(ctx, { limit: 10000 });

    const header = 'id,title,body,sourceTitle,sourceSlug,createdAt';
    const lines = rows.map((r) =>
      [
        r.id,
        r.title,
        r.body,
        r.sourceTitle,
        r.sourceSlug,
        r.createdAt.toISOString(),
      ]
        .map(escapeCsv)
        .join(','),
    );
    const csv = [header, ...lines].join('\n');

    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="recommendations.csv"',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: 'export failed', detail: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

/**
 * Quote a CSV field per RFC 4180: wrap in double quotes if the field contains
 * a comma, double-quote, or newline; escape any internal double-quotes by
 * doubling them.
 */
function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}