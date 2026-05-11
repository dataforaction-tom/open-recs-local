import { headers } from 'next/headers';
import Link from 'next/link';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { listRecentSources } from '@/lib/repositories/jobs-list';
import type { RepoContext } from '@/lib/repositories/types';
import { SourceUploadForm } from '@/components/sources/source-upload-form';
import type { SourceStatus } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<SourceStatus, string> = {
  pending: 'Pending',
  parsing: 'Parsing',
  extracting: 'Extracting',
  embedding: 'Embedding',
  ready: 'Ready',
  failed: 'Failed',
};

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

export default async function SourcesPage() {
  const env = loadEnv();
  const providers = createProviders(env);
  const client = createDb(env.DATABASE_URL);

  try {
    const headersList = await headers();
    const req = new Request('http://localhost/sources', { headers: headersList });
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    const sources = await listRecentSources(ctx, { limit: 50 });

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

        <section className="space-y-5">
          <div className="flex items-baseline justify-between border-b border-rule-strong pb-3">
            <h2 className="text-sm font-medium">Catalogue</h2>
            <span className="eyebrow">{sources.length} sources · newest first</span>
          </div>

          {sources.length === 0 ? (
            <p className="py-8 font-serif italic text-muted-foreground">
              No sources yet. Upload a PDF above to begin.
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
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}
