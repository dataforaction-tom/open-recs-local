import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSharedDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { describeSourceAccess } from '@/lib/repositories/ownership-request';
import {
  getSourceProgressCadence,
  getSourceRecsPerStatus,
} from '@/lib/services/analytics';
import type { RepoContext } from '@/lib/repositories/types';
import { StatusDonut } from '@/components/analytics/status-donut';
import { CadenceLine } from '@/components/analytics/cadence-line';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ slug: string }> };

export default async function SourceAnalyticsPage({ params }: PageProps) {
  const { slug } = await params;

  const env = loadEnv();
  const providers = createProviders(env);
  const { db } = await getSharedDb(env.DATABASE_URL);

  const headersList = await headers();
  const req = new Request(`http://localhost/sources/${slug}/analytics`, {
    headers: headersList,
  });
  const auth = await providers.auth.getContext(req);
  const ctx: RepoContext = { db, auth };

  const access = await describeSourceAccess(ctx, slug);
  if (access.kind !== 'visible') notFound();

  const [status, cadence] = await Promise.all([
    getSourceRecsPerStatus(ctx, access.sourceId),
    getSourceProgressCadence(ctx, access.sourceId),
  ]);

  return (
      <div className="space-y-10">
        <header className="space-y-3">
          <div className="section-num">Source · Analytics</div>
          <h1 className="text-4xl tracking-tight">A short reading of one source</h1>
          <p>
            <Link
              href={`/sources/${slug}`}
              className="text-sm text-muted-foreground underline-offset-4 hover:text-accent hover:underline"
            >
              ← Back to source
            </Link>
          </p>
        </header>

        <div className="grid grid-cols-1 gap-x-10 gap-y-10 md:grid-cols-2">
          <section className="space-y-4">
            <div className="flex items-baseline justify-between border-b border-rule-strong pb-2">
              <h2 className="text-sm font-medium">Recommendations by status</h2>
            </div>
            <StatusDonut rows={status} />
          </section>

          <section className="space-y-4">
            <div className="flex items-baseline justify-between border-b border-rule-strong pb-2">
              <h2 className="text-sm font-medium">Progress updates per month</h2>
              <span className="text-sm text-muted-foreground">12-month window</span>
            </div>
            <CadenceLine rows={cadence} />
          </section>
        </div>
      </div>
    );
}
