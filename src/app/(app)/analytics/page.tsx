import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getSharedDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import {
  getGlobalProgressCadence,
  getGlobalRecsPerStatus,
  getGlobalRecsPerTheme,
  getGlobalSourceTimeline,
} from '@/lib/services/analytics';
import type { RepoContext } from '@/lib/repositories/types';
import { StatusDonut } from '@/components/analytics/status-donut';
import { ThemeBar } from '@/components/analytics/theme-bar';
import { CadenceLine } from '@/components/analytics/cadence-line';
import { TimelineLine } from '@/components/analytics/timeline-line';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const env = loadEnv();
  const providers = createProviders(env);
  const { db } = await getSharedDb(env.DATABASE_URL);

  const headersList = await headers();
  const req = new Request('http://localhost/analytics', { headers: headersList });
  const auth = await providers.auth.getContext(req);
  const ctx: RepoContext = { db, auth };

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
      <div className="space-y-12">
        <header className="space-y-3">
          <div className="section-num">04 · Analytics</div>
          <h1 className="text-4xl tracking-tight">A daily reading of the collection</h1>
          <p className="max-w-[42rem] font-serif text-lg italic leading-relaxed text-foreground/85">
            Aggregates refresh nightly. The first visit after a deploy may take a
            moment while the cache warms — subsequent loads are instant.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-x-10 gap-y-12 md:grid-cols-2">
          <section className="space-y-4">
            <div className="flex items-baseline justify-between border-b border-rule-strong pb-2">
              <h2 className="text-sm font-medium">Recommendations by status</h2>
            </div>
            <StatusDonut rows={status} />
          </section>

          <section className="space-y-4">
            <div className="flex items-baseline justify-between border-b border-rule-strong pb-2">
              <h2 className="text-sm font-medium">Recommendations by thematic area</h2>
            </div>
            <ThemeBar rows={themes} />
          </section>

          <section className="space-y-4">
            <div className="flex items-baseline justify-between border-b border-rule-strong pb-2">
              <h2 className="text-sm font-medium">Progress updates per month</h2>
              <span className="text-sm text-muted-foreground">12-month window</span>
            </div>
            <CadenceLine rows={cadence} />
          </section>

          <section className="space-y-4">
            <div className="flex items-baseline justify-between border-b border-rule-strong pb-2">
              <h2 className="text-sm font-medium">Sources published per month</h2>
              <span className="text-sm text-muted-foreground">12-month window</span>
            </div>
            <TimelineLine rows={timeline} />
          </section>
        </div>
      </div>
    );
}
