import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import {
  findRecommendationById,
  findSimilarRecommendations,
} from '@/lib/repositories/recommendation';
import type { RepoContext } from '@/lib/repositories/types';
import { RecommendationDetailHeader } from '@/components/recommendations/recommendation-detail-header';
import { SimilarRecommendations } from '@/components/recommendations/similar-recommendations';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

    const [rec, similar] = await Promise.all([
      findRecommendationById(ctx, id),
      findSimilarRecommendations(ctx, id, 5),
    ]);

    if (!rec) notFound();

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
          <TabsContent value="progress" className="pt-4">
            <p className="text-sm text-muted-foreground">
              Progress updates land in Phase 7. Stakeholders will be able to post updates with
              evidence references and status transitions here.
            </p>
          </TabsContent>
        </Tabs>
      </div>
    );
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}
