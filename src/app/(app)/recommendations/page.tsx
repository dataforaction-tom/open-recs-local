import { headers } from 'next/headers';
import { z } from 'zod';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { listRecentRecommendations } from '@/lib/repositories/recommendation';
import { searchRecommendations } from '@/lib/services/search';
import {
  RecommendationsTable,
  type RecommendationRow,
} from '@/components/recommendations/recommendations-table';
import { RecommendationsIndexControls } from '@/components/recommendations/recommendations-index-controls';
import type { RepoContext } from '@/lib/repositories/types';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  q: z.string().max(200).optional(),
  source: z.string().uuid().optional(),
  theme: z.string().uuid().optional(),
  mode: z.enum(['hybrid', 'keyword']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

type SearchProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function singleString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

export default async function RecommendationsIndexPage({ searchParams }: SearchProps) {
  const raw = await searchParams;
  const parsed = QuerySchema.safeParse({
    q: singleString(raw['q']),
    source: singleString(raw['source']),
    theme: singleString(raw['theme']),
    mode: singleString(raw['mode']),
    limit: singleString(raw['limit']),
  });

  const env = loadEnv();
  const providers = createProviders(env);
  const client = createDb(env.DATABASE_URL);

  try {
    const headersList = await headers();
    const req = new Request('http://localhost/recommendations', { headers: headersList });
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    const args = parsed.success ? parsed.data : {};
    const trimmedQ = args.q?.trim() ?? '';
    const limit = args.limit ?? 50;
    const filters: { sourceId?: string; thematicAreaId?: string } = {};
    if (args.source) filters.sourceId = args.source;
    if (args.theme) filters.thematicAreaId = args.theme;

    let rows: RecommendationRow[] = [];

    if (trimmedQ.length >= 2) {
      const mode = args.mode ?? 'hybrid';
      const hits = await searchRecommendations(
        {
          ctx,
          q: trimmedQ,
          mode,
          filters,
          limit,
        },
        mode === 'hybrid' ? { embedding: providers.embedding } : {},
      );
      // The search service returns RrfRow without created_at; for display
      // purposes we look up sourceTitle via a follow-up listRecent intersect
      // — but for Phase 6 we keep it simple and only show the result rows
      // using the data the service hands back. A follow-up join can come if
      // QA shows we miss the sourceTitle column.
      rows = hits.map((hit) => ({
        id: hit.id,
        title: hit.title,
        sourceSlug: hit.sourceSlug,
        sourceTitle: hit.sourceSlug,
        createdAt: new Date(0),
      }));
    } else {
      const recent = await listRecentRecommendations(ctx, { limit, filters });
      rows = recent.map((r) => ({
        id: r.id,
        title: r.title,
        sourceSlug: r.sourceSlug,
        sourceTitle: r.sourceTitle,
        createdAt: r.createdAt,
      }));
    }

    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Recommendations</h1>
          <p className="text-sm text-muted-foreground">
            Search and browse recommendations across all sources.
          </p>
        </header>
        <RecommendationsIndexControls />
        <RecommendationsTable rows={rows} />
      </div>
    );
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}
