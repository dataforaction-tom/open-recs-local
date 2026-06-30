import { headers } from 'next/headers';
import Link from 'next/link';
import { z } from 'zod';
import { getSharedDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { getProviders } from '@/lib/providers/config';
import { listRecentSources } from '@/lib/repositories/jobs-list';
import type { RepoContext } from '@/lib/repositories/types';
import { SourceUploadForm } from '@/components/sources/source-upload-form';
import type { SourceStatus } from '@/lib/db/schema';
import { SourcesIndexControls } from '@/components/sources/sources-index-controls';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<SourceStatus, string> = {
  pending: 'Pending',
  parsing: 'Parsing',
  extracting: 'Extracting',
  embedding: 'Embedding',
  ready: 'Ready',
  failed: 'Failed',
};

const QuerySchema = z.object({
  q: z.string().max(200).optional(),
  status: z
    .enum(['pending', 'parsing', 'extracting', 'embedding', 'ready', 'failed'])
    .optional(),
});

type SearchProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function singleString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v ?? undefined;
}

function statusKey(status: SourceStatus): string {
  if (status === 'ready') return 'done';
  if (status === 'failed') return 'failed';
  if (status === 'parsing' || status === 'extracting' || status === 'embedding') return 'active';
  return 'pending';
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export default async function SourcesPage({ searchParams }: SearchProps) {
  const env = loadEnv();

  const { db } = await getSharedDb(env.DATABASE_URL);
  const providers = await getProviders(db, env);

  const headersList = await headers();
  const req = new Request('http://localhost/sources', { headers: headersList });
  const auth = await providers.auth.getContext(req);
  const ctx: RepoContext = { db, auth };

  const raw = await searchParams;
  const parsed = QuerySchema.safeParse({
    q: singleString(raw['q']),
    status: singleString(raw['status']),
  });
  const args = parsed.success ? parsed.data : {};

  // listRecentSources returns [] when the pgboss schema isn't installed
  // yet (fresh DB before the worker has run). No try/catch needed — the
  // function handles the undefined-table error internally.
  const listArgs: { limit: number; q?: string; status?: SourceStatus } = { limit: 50 };
  if (args.q !== undefined) listArgs.q = args.q;
  if (args.status !== undefined) listArgs.status = args.status;
  const sources = await listRecentSources(ctx, listArgs);

  return (
    <div className="space-y-14">
      <header className="space-y-3">
        <div className="section-num">02 · Sources</div>
        <h1 className="text-4xl tracking-tight">Library of inquiries</h1>
        <p className="max-w-[42rem] font-serif text-lg italic leading-relaxed text-foreground/85">
          Drop a PDF into the bay below. The pipeline parses it, splits out
          individual recommendations, and embeds each one so it can be
          searched alongside the others.
        </p>
      </header>

      <SourceUploadForm />

      <SourcesIndexControls initialQ={args.q ?? ''} initialStatus={args.status} />

      <section className="space-y-5">
        <div className="flex items-baseline justify-between border-b border-rule-strong pb-3">
          <h2 className="text-sm font-medium">Catalogue</h2>
          <span className="eyebrow">{sources.length} sources · newest first</span>
        </div>

        {sources.length === 0 ? (
          <p className="py-8 font-serif italic text-muted-foreground">
            No sources match the current filters. Upload a PDF above to begin,
            or{' '}
            <Link
              href="/sources"
              className="underline underline-offset-4 hover:text-accent"
            >
              clear the filters
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {sources.map((source) => {
              const status = source.status as SourceStatus;
              return (
                <li
                  key={source.id}
                  className="grid grid-cols-[1fr_auto_8rem] items-baseline gap-6 py-4"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/sources/${source.slug}`}
                      className="text-lg underline-offset-4 hover:text-accent hover:underline"
                    >
                      {source.title}
                    </Link>
                    <div className="ref mt-1 truncate">{source.slug}</div>
                  </div>
                  <span className="ref tabular-nums">
                    {formatDate(new Date(source.createdAt))}
                  </span>
                  <span className="status justify-self-end" data-state={statusKey(status)}>
                    {STATUS_LABEL[status] ?? status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}