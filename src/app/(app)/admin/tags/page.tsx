import { headers } from 'next/headers';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import type { RepoContext } from '@/lib/repositories/types';
import {
  TAXONOMY_AXES,
  listLocationScopes,
  listPriorityTimescales,
  listPurposes,
  listRoleRelevances,
  listSourceTypes,
  listTargetAudienceTypes,
  listThematicAreas,
  listUnverifiedTags,
  type TaxonomyAxis,
  type TaxonomyRow,
} from '@/lib/repositories/taxonomy';
import {
  TagReviewQueue,
  type AxisSection,
} from '@/components/admin/tag-review-queue';
import {
  deleteTagAction,
  mergeTagAction,
  promoteTagAction,
  renameTagAction,
} from './actions';

export const dynamic = 'force-dynamic';

async function fetchVerified(ctx: RepoContext, axis: TaxonomyAxis): Promise<TaxonomyRow[]> {
  switch (axis) {
    case 'thematic_areas':
      return (await listThematicAreas(ctx)).filter((r) => !r.unverified);
    case 'purposes':
      return (await listPurposes(ctx)).filter((r) => !r.unverified);
    case 'source_types':
      return (await listSourceTypes(ctx)).filter((r) => !r.unverified);
    case 'target_audience_types':
      return (await listTargetAudienceTypes(ctx)).filter((r) => !r.unverified);
    case 'location_scopes':
      return (await listLocationScopes(ctx)).filter((r) => !r.unverified);
    case 'role_relevances':
      return (await listRoleRelevances(ctx)).filter((r) => !r.unverified);
    case 'priority_timescales':
      return (await listPriorityTimescales(ctx)).filter((r) => !r.unverified);
  }
}

export default async function AdminTagsPage() {
  const env = loadEnv();
  const providers = createProviders(env);
  const client = createDb(env.DATABASE_URL);
  try {
    const headersList = await headers();
    const req = new Request('http://localhost/admin/tags', { headers: headersList });
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    const sections: AxisSection[] = [];
    for (const axis of TAXONOMY_AXES) {
      const [unverified, verified] = await Promise.all([
        listUnverifiedTags(ctx, axis),
        fetchVerified(ctx, axis),
      ]);
      sections.push({ axis, unverified, verified });
    }

    return (
      <div className="space-y-10">
        <header className="space-y-3">
          <div className="section-num">05 · Admin · Tags</div>
          <h1 className="text-3xl tracking-tight">Tag review queue</h1>
          <p className="max-w-[42rem] font-serif text-base italic leading-relaxed text-foreground/85">
            Tags coined by the extraction LLM (or hand-typed in edit pages) that don&apos;t match an existing slug land here as <em>unverified</em>. Promote, rename, merge into an existing tag, or delete.
          </p>
        </header>
        <TagReviewQueue
          sections={sections}
          onPromote={promoteTagAction}
          onRename={renameTagAction}
          onMerge={mergeTagAction}
          onDelete={deleteTagAction}
        />
      </div>
    );
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}
