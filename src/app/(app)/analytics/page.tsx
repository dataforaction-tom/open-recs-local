import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import {
  getGlobalProgressCadence,
  getGlobalRecsPerStatus,
  getGlobalRecsPerTheme,
  getGlobalSourceTimeline,
} from '@/lib/services/analytics';
import type { RepoContext } from '@/lib/repositories/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusDonut } from '@/components/analytics/status-donut';
import { ThemeBar } from '@/components/analytics/theme-bar';
import { CadenceLine } from '@/components/analytics/cadence-line';
import { TimelineLine } from '@/components/analytics/timeline-line';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const env = loadEnv();
  const providers = createProviders(env);
  const client = createDb(env.DATABASE_URL);

  try {
    const headersList = await headers();
    const req = new Request('http://localhost/analytics', { headers: headersList });
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    // Hosted mode: admin-only. Local mode: open to everyone (no auth surface
    // to gate against). Same shape as /admin's page-level role gate.
    if (env.APP_MODE === 'hosted' && !ctx.auth.roles.includes('admin')) notFound();

    // Aggregates run under the request ctx — system in local mode, admin in
    // hosted. Both have full visibility, which matches the "global view"
    // semantic. The cron pre-warms these keys; the page hits the cache for
    // every visit after the first.
    const [status, themes, cadence, timeline] = await Promise.all([
      getGlobalRecsPerStatus(ctx),
      getGlobalRecsPerTheme(ctx),
      getGlobalProgressCadence(ctx),
      getGlobalSourceTimeline(ctx),
    ]);

    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Aggregates are refreshed nightly. First visit after a deploy may take a moment
            while the cache warms.
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
              <CardTitle className="text-base">Recommendations by thematic area</CardTitle>
            </CardHeader>
            <CardContent>
              <ThemeBar rows={themes} />
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
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sources published per month</CardTitle>
            </CardHeader>
            <CardContent>
              <TimelineLine rows={timeline} />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}
