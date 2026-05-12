import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { findSourceBySlugWithMetadata } from '@/lib/repositories/source';
import type { RepoContext } from '@/lib/repositories/types';
import {
  listPurposes,
  listRoleRelevances,
  listSourceTypes,
  listTargetAudienceTypes,
  listThematicAreas,
} from '@/lib/repositories/taxonomy';
import {
  listSourcePurposes,
  listSourceRoleRelevances,
  listSourceSourceTypes,
  listSourceTargetAudienceTypes,
  listSourceThematicAreas,
} from '@/lib/repositories/source-tags';
import { EditSourceForm } from '@/components/sources/edit-source-form';
import { updateSource } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EditSourcePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const env = loadEnv();
  const providers = createProviders(env);
  const client = createDb(env.DATABASE_URL);

  try {
    const headersList = await headers();
    const req = new Request('http://localhost/sources', { headers: headersList });
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    const source = await findSourceBySlugWithMetadata(ctx, slug);
    if (!source) notFound();

    const [
      thematicAreas,
      sourceTypes,
      purposes,
      roleRelevances,
      targetAudienceTypes,
      memberThemes,
      memberTypes,
      memberPurposes,
      memberRoles,
      memberAudiences,
    ] = await Promise.all([
      listThematicAreas(ctx),
      listSourceTypes(ctx),
      listPurposes(ctx),
      listRoleRelevances(ctx),
      listTargetAudienceTypes(ctx),
      listSourceThematicAreas(ctx, source.id),
      listSourceSourceTypes(ctx, source.id),
      listSourcePurposes(ctx, source.id),
      listSourceRoleRelevances(ctx, source.id),
      listSourceTargetAudienceTypes(ctx, source.id),
    ]);

    return (
      <div className="space-y-8">
        <header className="space-y-3">
          <div className="section-num">02 · Sources · Edit</div>
          <h1 className="text-3xl tracking-tight">{source.title}</h1>
          <p className="font-serif text-sm italic text-muted-foreground">
            Edit metadata + tags. Tags coined here that don&apos;t exist yet land as unverified and surface on /admin/tags for review.
          </p>
        </header>
        <EditSourceForm
          source={{
            id: source.id,
            title: source.title,
            summary: source.summary,
            authors: source.authors,
            publicationDate: source.publicationDate,
            orgOwner: source.orgOwner,
            originalUrl: source.originalUrl,
            attachmentUrl: source.attachmentUrl,
            datasets: source.datasets,
            isPrivate: source.isPrivate,
          }}
          axisOptions={{
            thematic_areas: thematicAreas,
            source_types: sourceTypes,
            purposes,
            role_relevances: roleRelevances,
            target_audience_types: targetAudienceTypes,
          }}
          initialMemberships={{
            thematic_areas: memberThemes.map((t) => t.slug),
            source_types: memberTypes.map((t) => t.slug),
            purposes: memberPurposes.map((t) => t.slug),
            role_relevances: memberRoles.map((t) => t.slug),
            target_audience_types: memberAudiences.map((t) => t.slug),
          }}
          showPrivacyToggle={env.APP_MODE === 'hosted'}
          action={updateSource}
        />
      </div>
    );
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}
