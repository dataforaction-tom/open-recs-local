import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { findRecommendationByIdForEdit } from '@/lib/repositories/recommendation';
import { priorityTimescales } from '@/lib/db/schema';
import type { RepoContext } from '@/lib/repositories/types';
import {
  listLocationScopes,
  listPriorityTimescales,
  listPurposes,
  listTargetAudienceTypes,
  listThematicAreas,
} from '@/lib/repositories/taxonomy';
import {
  listRecommendationLocationScopes,
  listRecommendationPurposes,
  listRecommendationTargetAudienceTypes,
  listRecommendationThematicAreas,
} from '@/lib/repositories/recommendation-tags';
import { EditRecommendationForm } from '@/components/recommendations/edit-recommendation-form';
import { updateRecommendation } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EditRecommendationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const env = loadEnv();
  const providers = createProviders(env);
  const client = createDb(env.DATABASE_URL);

  try {
    const headersList = await headers();
    const req = new Request('http://localhost/recommendations', { headers: headersList });
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    const rec = await findRecommendationByIdForEdit(ctx, id);
    if (!rec) notFound();

    let priorityTimescaleSlug: string | null = null;
    if (rec.priorityTimescaleId) {
      const [row] = await ctx.db
        .select({ slug: priorityTimescales.slug })
        .from(priorityTimescales)
        .where(eq(priorityTimescales.id, rec.priorityTimescaleId));
      priorityTimescaleSlug = row?.slug ?? null;
    }

    const [
      thematicAreas,
      purposes,
      audiences,
      locations,
      priorities,
      memberThemes,
      memberPurposes,
      memberAudiences,
      memberLocations,
    ] = await Promise.all([
      listThematicAreas(ctx),
      listPurposes(ctx),
      listTargetAudienceTypes(ctx),
      listLocationScopes(ctx),
      listPriorityTimescales(ctx),
      listRecommendationThematicAreas(ctx, rec.id),
      listRecommendationPurposes(ctx, rec.id),
      listRecommendationTargetAudienceTypes(ctx, rec.id),
      listRecommendationLocationScopes(ctx, rec.id),
    ]);

    return (
      <div className="space-y-8">
        <header className="space-y-3">
          <div className="section-num">06 · Recommendations · Edit</div>
          <h1 className="text-3xl tracking-tight">{rec.title}</h1>
          <p className="font-serif text-sm italic text-muted-foreground">
            Edit body, tags, and metadata. New tags land as unverified and surface on /admin/tags.
          </p>
        </header>
        <EditRecommendationForm
          rec={{
            id: rec.id,
            title: rec.title,
            body: rec.body,
            targetOrganization: rec.targetOrganization,
            notes: rec.notes,
            pageStart: rec.pageAnchor,
            priorityTimescaleSlug,
            confidence: rec.confidence,
          }}
          axisOptions={{
            thematic_areas: thematicAreas,
            purposes,
            target_audience_types: audiences,
            location_scopes: locations,
            priority_timescales: priorities,
          }}
          initialMemberships={{
            thematic_areas: memberThemes.map((t) => t.slug),
            purposes: memberPurposes.map((t) => t.slug),
            target_audience_types: memberAudiences.map((t) => t.slug),
            location_scopes: memberLocations.map((t) => t.slug),
          }}
          action={updateRecommendation}
        />
      </div>
    );
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}
