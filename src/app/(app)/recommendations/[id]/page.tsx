import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import {
  findRecommendationById,
  findSimilarRecommendations,
} from '@/lib/repositories/recommendation';
import { getLatestStatus } from '@/lib/repositories/recommendation-status';
import { listProgressUpdates } from '@/lib/repositories/progress-update';
import { listEvidenceTypes, listProgressRatings } from '@/lib/repositories/taxonomy';
import type { RepoContext } from '@/lib/repositories/types';
import { RecommendationDetailHeader } from '@/components/recommendations/recommendation-detail-header';
import { SimilarRecommendations } from '@/components/recommendations/similar-recommendations';
import { ProgressUpdateForm } from '@/components/progress/progress-update-form';
import { ProgressUpdatesList } from '@/components/progress/progress-updates-list';
import { StatusTransitionControl } from '@/components/progress/status-transition-control';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { postProgressUpdate, transitionStatus } from './actions';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ id: string }> };

export default async function RecommendationDetailPage({ params }: PageProps) {
  const { id } = await params;
  const env = loadEnv();
  const providers = createProviders(env);
  const client = createDb(env.DATABASE_URL);

  try {
    const headersList = await headers();
    const req = new Request(`http://localhost/recommendations/${id}`, { headers: headersList });
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    const [rec, similar, latestStatus, updates, evidenceTypes, progressRatings] =
      await Promise.all([
        findRecommendationById(ctx, id),
        findSimilarRecommendations(ctx, id, 5),
        getLatestStatus(ctx, id),
        listProgressUpdates(ctx, id),
        listEvidenceTypes(ctx),
        listProgressRatings(ctx),
      ]);

    if (!rec) notFound();

    const currentStatus = latestStatus?.status ?? 'open';

    return (
      <div className="space-y-8">
        <RecommendationDetailHeader
          title={rec.title}
          body={rec.body}
          sourceSlug={rec.sourceSlug}
          sourceTitle={rec.sourceTitle}
          pageAnchor={rec.pageAnchor}
        />
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="similar">Similar</TabsTrigger>
            <TabsTrigger value="progress">Progress</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="pt-4">
            <p className="text-sm text-muted-foreground">
              Overview metadata will expand here as later phases land — page anchor link, thematic
              tags, status timeline, ownership badges.
            </p>
          </TabsContent>
          <TabsContent value="similar" className="pt-4">
            <SimilarRecommendations rows={similar} />
          </TabsContent>
          <TabsContent value="progress" className="space-y-6 pt-4">
            <StatusTransitionControl
              recommendationId={id}
              current={currentStatus}
              note={latestStatus?.note ?? undefined}
              action={transitionStatus}
            />
            <ProgressUpdatesList rows={updates} />
            <ProgressUpdateForm
              recommendationId={id}
              evidenceTypes={evidenceTypes}
              progressRatings={progressRatings}
              action={postProgressUpdate}
            />
          </TabsContent>
        </Tabs>
      </div>
    );
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}
