import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { describeSourceAccess } from '@/lib/repositories/ownership-request';
import {
  getSourceProgressCadence,
  getSourceRecsPerStatus,
} from '@/lib/services/analytics';
import type { RepoContext } from '@/lib/repositories/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusDonut } from '@/components/analytics/status-donut';
import { CadenceLine } from '@/components/analytics/cadence-line';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ slug: string }> };

export default async function SourceAnalyticsPage({ params }: PageProps) {
  const { slug } = await params;

  const env = loadEnv();
  const providers = createProviders(env);
  const client = createDb(env.DATABASE_URL);

  try {
    const headersList = await headers();
    const req = new Request(`http://localhost/sources/${slug}/analytics`, {
      headers: headersList,
    });
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    // Reuse the same visibility check the source page uses. Anonymous on a
    // private source → 404 (no leak); private + signed-in non-owner → 404
    // here too (analytics is owner/admin material). Visible → render.
    const access = await describeSourceAccess(ctx, slug);
    if (access.kind !== 'visible') notFound();

    const [status, cadence] = await Promise.all([
      getSourceRecsPerStatus(ctx, access.sourceId),
      getSourceProgressCadence(ctx, access.sourceId),
    ]);

    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Source analytics</h1>
          <p className="text-sm text-muted-foreground">
            <Link href={`/sources/${slug}`} className="underline hover:text-foreground">
              ← Back to source
            </Link>
          </p>
        </header>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recommendations by status</CardTitle>
            </CardHeader>
            <CardContent>
              <StatusDonut rows={status} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Progress updates per month</CardTitle>
            </CardHeader>
            <CardContent>
              <CadenceLine rows={cadence} />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}
