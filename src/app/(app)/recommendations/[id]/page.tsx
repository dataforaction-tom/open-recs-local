import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import {
  findRecommendationById,
  findSimilarRecommendations,
} from '@/lib/repositories/recommendation';
import { getLatestStatus, listStatusHistory } from '@/lib/repositories/recommendation-status';
import { listProgressUpdates } from '@/lib/repositories/progress-update';
import { listEvidenceTypes, listProgressRatings } from '@/lib/repositories/taxonomy';
import {
  listRecommendationLocationScopes,
  listRecommendationPurposes,
  listRecommendationTargetAudienceTypes,
  listRecommendationThematicAreas,
} from '@/lib/repositories/recommendation-tags';
import { TagChips } from '@/components/tags/tag-chips';
import Link from 'next/link';
import type { RepoContext } from '@/lib/repositories/types';
import { RecommendationDetailHeader } from '@/components/recommendations/recommendation-detail-header';
import { SimilarRecommendations } from '@/components/recommendations/similar-recommendations';
import { ProgressUpdateForm } from '@/components/progress/progress-update-form';
import { ProgressUpdatesList } from '@/components/progress/progress-updates-list';
import { StatusTimeline } from '@/components/progress/status-timeline';
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

    const [
      rec,
      similar,
      latestStatus,
      updates,
      statusHistory,
      evidenceTypes,
      progressRatings,
      themes,
      purposes,
      audiences,
      locations,
    ] = await Promise.all([
      findRecommendationById(ctx, id),
      findSimilarRecommendations(ctx, id, 5),
      getLatestStatus(ctx, id),
      listProgressUpdates(ctx, id),
      listStatusHistory(ctx, id),
      listEvidenceTypes(ctx),
      listProgressRatings(ctx),
      listRecommendationThematicAreas(ctx, id),
      listRecommendationPurposes(ctx, id),
      listRecommendationTargetAudienceTypes(ctx, id),
      listRecommendationLocationScopes(ctx, id),
    ]);

    if (!rec) notFound();

    const currentStatus = latestStatus?.status ?? 'open';

    return (
      <div className="space-y-10">
        <RecommendationDetailHeader
          title={rec.title}
          body={rec.body}
          sourceSlug={rec.sourceSlug}
          sourceTitle={rec.sourceTitle}
          pageAnchor={rec.pageAnchor}
          confidence={rec.confidence}
          targetOrganization={rec.targetOrganization}
          priorityTimescaleName={rec.priorityTimescaleName}
          notes={rec.notes}
        />

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="similar">Similar</TabsTrigger>
            <TabsTrigger value="progress">Progress</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 pt-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Tags</h2>
              <Link
                href={`/recommendations/${id}/edit`}
                className="text-sm text-muted-foreground underline-offset-4 hover:text-accent hover:underline"
              >
                Edit
              </Link>
            </div>
            {themes.length === 0 &&
            purposes.length === 0 &&
            audiences.length === 0 &&
            locations.length === 0 ? (
              <p className="font-serif text-sm italic text-muted-foreground">
                No tags yet — open the edit page to add some.
              </p>
            ) : (
              <div className="space-y-2">
                <TagChips tags={themes} />
                <TagChips tags={purposes} />
                <TagChips tags={audiences} />
                <TagChips tags={locations} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="similar" className="pt-6">
            <SimilarRecommendations rows={similar} />
          </TabsContent>

          <TabsContent value="progress" className="space-y-8 pt-6">
            <StatusTransitionControl
              recommendationId={id}
              current={currentStatus}
              note={latestStatus?.note ?? undefined}
              action={transitionStatus}
            />
            <StatusTimeline rows={statusHistory} />
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
