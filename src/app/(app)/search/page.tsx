import { headers } from 'next/headers';
import { z } from 'zod';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import type { RepoContext } from '@/lib/repositories/types';
import { searchRecommendations } from '@/lib/services/search';
import { SearchForm } from '@/components/search/search-form';
import { SearchResults } from '@/components/search/search-results';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
  q: z.string().max(200).optional(),
  source: z.string().uuid().optional(),
  theme: z.string().uuid().optional(),
  mode: z.enum(['hybrid', 'keyword']).optional(),
});

type SearchProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function singleString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

export default async function SearchPage({ searchParams }: SearchProps) {
  const raw = await searchParams;
  const parsed = QuerySchema.safeParse({
    q: singleString(raw['q']),
    source: singleString(raw['source']),
    theme: singleString(raw['theme']),
    mode: singleString(raw['mode']),
  });
  const args = parsed.success ? parsed.data : {};
  const trimmedQ = args.q?.trim() ?? '';
  const mode = args.mode ?? 'hybrid';

  return (
    <div className="space-y-12">
      <header className="space-y-3">
        <div className="section-num">06 · Search</div>
        <h1 className="text-4xl tracking-tight">Find the recommendation you remember</h1>
        <p className="max-w-[42rem] font-serif text-lg italic leading-relaxed text-foreground/85">
          Hybrid search blends keyword matching with semantic similarity, so a
          query like “rotate auditors” finds “change of statutory auditors”
          even when none of the words line up. Switch to keyword mode for
          strict text matching.
        </p>
      </header>

      <SearchForm />

      {trimmedQ.length < 2 ? (
        <p className="font-serif text-sm italic text-muted-foreground">
          Type at least two characters and hit Search to begin.
        </p>
      ) : (
        <SearchResultsSection q={trimmedQ} mode={mode} args={args} />
      )}
    </div>
  );
}

async function SearchResultsSection({
  q,
  mode,
  args,
}: {
  q: string;
  mode: 'hybrid' | 'keyword';
  args: z.infer<typeof QuerySchema>;
}) {
  const env = loadEnv();
  const providers = createProviders(env);
  const client = createDb(env.DATABASE_URL);
  try {
    const headersList = await headers();
    const req = new Request('http://localhost/search', { headers: headersList });
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    const filters: { sourceId?: string; thematicAreaId?: string } = {};
    if (args.source) filters.sourceId = args.source;
    if (args.theme) filters.thematicAreaId = args.theme;

    const rows = await searchRecommendations(
      { ctx, q, mode, filters },
      mode === 'hybrid' ? { embedding: providers.embedding } : {},
    );

    return (
      <div className="space-y-4">
        <div className="flex items-baseline justify-between border-b border-rule-strong pb-3">
          <h2 className="text-sm font-medium">
            Results for{' '}
            <span className="font-mono text-accent">“{q}”</span>
          </h2>
          <span className="eyebrow">
            {rows.length} {rows.length === 1 ? 'match' : 'matches'} · {mode}
          </span>
        </div>
        <SearchResults rows={rows} mode={mode} />
      </div>
    );
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}
