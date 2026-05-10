import { desc } from 'drizzle-orm';
import { createDb } from '@/lib/db/client';
import { sources } from '@/lib/db/schema';
import { loadEnv } from '@/lib/env';
import { listRecentJobs } from '@/lib/repositories/jobs-list';
import { DashboardView, type DashboardJob, type DashboardSource } from '@/components/dashboard/dashboard-view';
import type { RepoContext } from '@/lib/repositories/types';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const env = loadEnv();
  const client = createDb(env.DATABASE_URL);
  try {
    const ctx: RepoContext = {
      db: client.db,
      auth: { user: { id: 'system' }, roles: ['admin'], isSystem: true },
    };

    const [jobs, sourceRows] = await Promise.all([
      listRecentJobs(ctx, { limit: 10 }),
      client.db
        .select({
          id: sources.id,
          slug: sources.slug,
          title: sources.title,
          status: sources.status,
          createdAt: sources.createdAt,
        })
        .from(sources)
        .orderBy(desc(sources.createdAt))
        .limit(10),
    ]);

    const recentJobs: DashboardJob[] = jobs;
    const recentSources: DashboardSource[] = sourceRows.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      status: s.status,
      createdAt: s.createdAt,
    }));

    return <DashboardView recentJobs={recentJobs} recentSources={recentSources} />;
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}
