import { headers } from 'next/headers';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { listRecentJobs, listRecentSources } from '@/lib/repositories/jobs-list';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import type { RepoContext } from '@/lib/repositories/types';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const env = loadEnv();
  const providers = createProviders(env);
  const client = createDb(env.DATABASE_URL);
  try {
    // Server components don't get a Request directly — wrap the incoming
    // headers into a Request shape so the AuthProvider sees what it needs.
    // Local auth ignores the request; hosted auth (Phase 8) will read auth
    // headers from this object.
    const headersList = await headers();
    const req = new Request('http://localhost/dashboard', { headers: headersList });
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    const [jobs, sourceRows] = await Promise.all([
      listRecentJobs(ctx, { limit: 10 }),
      listRecentSources(ctx, { limit: 10 }),
    ]);

    return <DashboardView recentJobs={jobs} recentSources={sourceRows} />;
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}
