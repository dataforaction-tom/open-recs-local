import Link from 'next/link';
import { headers } from 'next/headers';
import { z } from 'zod';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { listRecentRecommendations } from '@/lib/repositories/recommendation';
import { getLatestStatuses } from '@/lib/repositories/recommendation-status';
import { listRecentSources } from '@/lib/repositories/jobs-list';
import { searchRecommendations } from '@/lib/services/search';
import {
  RecommendationsTable,
  type RecommendationRow,
} from '@/components/recommendations/recommendations-table';
import { RecommendationsIndexControls } from '@/components/recommendations/recommendations-index-controls';
import { EmptyCorpusNotice } from '@/components/shared/empty-corpus-notice';
import type { RepoContext } from '@/lib/repositories/types';
import { transitionStatus } from './[id]/actions';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  q: z.string().max(200).optional(),
  source: z.string().uuid().optional(),
  theme: z.string().uuid().optional(),
  mode: z.enum(['hybrid', 'keyword']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
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
    page: singleString(raw['page']),
  });

  const env = loadEnv();
  const providers = createProviders(env);
  const client = createDb(env.DATABASE_URL);

  try {
    const headersList = await headers();
    const req = new Request('http://localhost/recommendations', { headers: headersList });
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    const recentSources = await listRecentSources(ctx, { limit: 1 });
    const hasSources = recentSources.length > 0;

    const args = parsed.success ? parsed.data : {};
    const trimmedQ = args.q?.trim() ?? '';
    const limit = args.limit ?? 50;
    const page = args.page ?? 1;
    const offset = (page - 1) * limit;
    const filters: { sourceId?: string; thematicAreaId?: string } = {};
    if (args.source) filters.sourceId = args.source;
    if (args.theme) filters.thematicAreaId = args.theme;

    type RowWithoutStatus = Omit<RecommendationRow, 'latestStatus'>;
    let baseRows: RowWithoutStatus[] = [];

    if (trimmedQ.length >= 2) {
      const mode = args.mode ?? 'hybrid';
      const hits = await searchRecommendations(
        {
          ctx,
          q: trimmedQ,
          mode,
          filters,
          limit,
          offset,
        },
        mode === 'hybrid' ? { embedding: providers.embedding } : {},
      );
      baseRows = hits.map((hit) => ({
        id: hit.id,
        title: hit.title,
        sourceSlug: hit.sourceSlug,
        sourceTitle: hit.sourceTitle,
        createdAt: hit.createdAt,
      }));
    } else {
      const recent = await listRecentRecommendations(ctx, { limit, offset, filters });
      baseRows = recent.map((r) => ({
        id: r.id,
        title: r.title,
        sourceSlug: r.sourceSlug,
        sourceTitle: r.sourceTitle,
        createdAt: r.createdAt,
      }));
    }

    const statusMap = await getLatestStatuses(
      ctx,
      baseRows.map((r) => r.id),
    );
    const rows: RecommendationRow[] = baseRows.map((r) => ({
      ...r,
      latestStatus: statusMap.get(r.id)?.status ?? 'open',
    }));

    // Heuristic: a full page means there is likely a next page; an empty or
    // partial page means we've reached the end. Previous is available on any
    // page past 1.
    const hasNext = rows.length === limit;
    const hasPrev = page > 1;

    // Build pagination links that preserve every active search param. We
    // carry forward the raw values (not the parsed/zod-coerced ones) so the
    // URL stays canonical for sharing.
    const baseParams = new URLSearchParams();
    if (singleString(raw['q'])) baseParams.set('q', singleString(raw['q'])!);
    if (singleString(raw['source'])) baseParams.set('source', singleString(raw['source'])!);
    if (singleString(raw['theme'])) baseParams.set('theme', singleString(raw['theme'])!);
    if (singleString(raw['mode'])) baseParams.set('mode', singleString(raw['mode'])!);
    if (args.limit !== undefined) baseParams.set('limit', String(args.limit));

    const nextHref = `/recommendations?${buildPageParams(baseParams, page + 1)}`;
    const prevHref = `/recommendations?${buildPageParams(baseParams, page - 1)}`;

    return (
      <div className="space-y-12">
        <header className="space-y-3">
          <div className="section-num">03 · Recommendations</div>
          <h1 className="text-4xl tracking-tight">Every recommendation, side by side</h1>
          <p className="max-w-[42rem] font-serif text-lg italic leading-relaxed text-foreground/85">
            Each row is one recommendation pulled from one source. Open a row to read
            the full text, change its status inline, or post a progress update.
          </p>
        </header>

        <RecommendationsIndexControls />

        <div className="flex items-baseline justify-between border-b border-rule-strong pb-3">
          <h2 className="text-sm font-medium">Inventory</h2>
          <div className="flex items-baseline gap-4">
            <Link
              href="/api/recommendations/export"
              className="text-sm underline-offset-4 hover:text-accent hover:underline"
            >
              Export CSV
            </Link>
            <span className="eyebrow">
              {rows.length} {rows.length === 1 ? 'recommendation' : 'recommendations'}
              {hasPrev ? ` · page ${page}` : ''}
            </span>
          </div>
        </div>

        {!hasSources && rows.length === 0 && trimmedQ.length < 2 ? (
          <EmptyCorpusNotice />
        ) : (
          <RecommendationsTable rows={rows} onStatusTransition={transitionStatus} />
        )}

        {(hasPrev || hasNext) && (
          <nav className="flex items-center justify-between pt-2">
            {hasPrev ? (
              <Link
                href={prevHref}
                className="text-sm underline-offset-4 hover:text-accent hover:underline"
              >
                ← Previous page
              </Link>
            ) : (
              <span />
            )}
            {hasNext ? (
              <Link
                href={nextHref}
                className="text-sm underline-offset-4 hover:text-accent hover:underline"
              >
                Next page →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>
    );
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}

function buildPageParams(base: URLSearchParams, page: number): string {
  const params = new URLSearchParams(base);
  params.set('page', String(page));
  return params.toString();
}