import { and, asc, eq } from 'drizzle-orm';
import type { JobContext } from '../context';
import type { QueuePayloads } from '../types';
import {
  recommendations,
  recommendationStatuses,
  sourceFiles,
  sources,
} from '@/lib/db/schema';
import {
  RecommendationsSchema,
  SourceMetadataSchema,
  type RecommendationInput,
  type SourceMetadataOutput,
} from '@/lib/services/extraction-schema';
import { detectRecommendationSections } from '@/lib/services/extraction-sections';
import {
  buildPass1Prompt,
  buildPass2LooserPrompt,
  buildPass2StrictPrompt,
  type TaxonomySlugLists,
} from '@/lib/services/extraction-prompts';
import {
  listLocationScopes,
  listPriorityTimescales,
  listPurposes,
  listRoleRelevances,
  listSourceTypes,
  listTargetAudienceTypes,
  listThematicAreas,
  resolveOrCreateLocationScopes,
  resolveOrCreatePriorityTimescales,
  resolveOrCreatePurposes,
  resolveOrCreateRoleRelevances,
  resolveOrCreateSourceTypes,
  resolveOrCreateTargetAudienceTypes,
  resolveOrCreateThematicAreas,
} from '@/lib/repositories/taxonomy';
import {
  replaceSourcePurposes,
  replaceSourceRoleRelevances,
  replaceSourceSourceTypes,
  replaceSourceTargetAudienceTypes,
  replaceSourceThematicAreas,
} from '@/lib/repositories/source-tags';
import {
  replaceRecommendationLocationScopes,
  replaceRecommendationPurposes,
  replaceRecommendationTargetAudienceTypes,
  replaceRecommendationThematicAreas,
} from '@/lib/repositories/recommendation-tags';
import type { RepoContext } from '@/lib/repositories/types';

const MAX_PASS1_MARKDOWN = 10_000;
const MAX_PASS2_MARKDOWN = 100_000;

function fixtureKeyFromStorageKey(storageKey: string): string {
  const filename = storageKey.split('/').pop() ?? storageKey;
  return filename.replace(/\.[^.]+$/, '');
}

function truncate(markdown: string, max: number): string {
  if (markdown.length <= max) return markdown;
  const cut = markdown.slice(0, max);
  return `${cut}\n\n<!-- truncated: ${markdown.length - max} chars omitted -->`;
}

function parsePublicationDate(input: string | null): Date | null {
  if (!input) return null;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * `source.extract` handler — two-pass, section-aware.
 *
 * Pass 1: source metadata (summary, authors, dates, taxonomies for the
 * source itself). Reads the first ~10k chars of canonical markdown so the
 * LLM sees front matter + executive summary without the whole document.
 *
 * Pass 2: recommendations. Detects recommendation-shaped headings; if
 * found, sends just those sections with a strict prompt; otherwise sends
 * the (truncated) full document with a looser prompt. Persists every rec
 * with its multi-axis tags + priority_timescale FK + confidence.
 *
 * Idempotency: pg-boss retries trigger a full re-run. Both passes are
 * idempotent — Pass 1 UPDATEs source columns and calls `replaceSource*`
 * (set membership, not append); Pass 2 deletes existing recs for the
 * source before inserting, and `replaceRecommendation*` is set membership.
 *
 * Unknown slugs: the LLM is asked to coin a new slug when no listed slug
 * fits. `resolveOrCreate*` auto-creates those with `unverified=true` so
 * an admin can promote / rename / merge / delete via /admin/tags (PR 3).
 */
export async function extractHandler(
  ctx: JobContext,
  payload: QueuePayloads['source.extract'],
): Promise<void> {
  const { sourceId } = payload;
  try {
    await ctx.emit(sourceId, { type: 'phase', phase: 'extracting' });

    const [sourceRow] = await ctx.db
      .select({ slug: sources.slug, canonical: sources.canonicalMarkdown })
      .from(sources)
      .where(eq(sources.id, sourceId));
    if (!sourceRow) {
      throw new Error(`source.extract: source ${sourceId} not found`);
    }
    const canonicalMarkdown = sourceRow.canonical ?? '';

    // Locate the original upload so the fake LLM provider can find the
    // matching fixture file. Real LLM adapters ignore `key`.
    const fileRows = await ctx.db
      .select({ storageKey: sourceFiles.storageKey })
      .from(sourceFiles)
      .where(and(eq(sourceFiles.sourceId, sourceId), eq(sourceFiles.role, 'original')))
      .orderBy(asc(sourceFiles.createdAt))
      .limit(1);
    const fixtureKey = fileRows[0] ? fixtureKeyFromStorageKey(fileRows[0].storageKey) : sourceRow.slug;

    // RepoContext for the taxonomy + tag-membership repo functions. Uses
    // the same db handle as the rest of the handler; auth is system context
    // because extraction runs under the worker, not a user request.
    const repoCtx: RepoContext = {
      db: ctx.db,
      auth: { user: { id: 'system', name: 'system' }, roles: ['admin'], isSystem: true },
    };

    // Load every taxonomy axis up front. The slugs are interpolated into
    // both prompts so the LLM picks from known vocabulary.
    const [
      themeRows,
      sourceTypeRows,
      purposeRows,
      roleRelevanceRows,
      targetAudienceTypeRows,
      locationScopeRows,
      priorityTimescaleRows,
    ] = await Promise.all([
      listThematicAreas(repoCtx),
      listSourceTypes(repoCtx),
      listPurposes(repoCtx),
      listRoleRelevances(repoCtx),
      listTargetAudienceTypes(repoCtx),
      listLocationScopes(repoCtx),
      listPriorityTimescales(repoCtx),
    ]);
    const taxonomySlugs: TaxonomySlugLists = {
      thematic_area: themeRows.map((r) => r.slug),
      source_type: sourceTypeRows.map((r) => r.slug),
      purpose: purposeRows.map((r) => r.slug),
      role_relevance: roleRelevanceRows.map((r) => r.slug),
      target_audience_type: targetAudienceTypeRows.map((r) => r.slug),
      location_scope: locationScopeRows.map((r) => r.slug),
      priority_timescale: priorityTimescaleRows.map((r) => r.slug),
    };

    // ----- Pass 1: source metadata -----------------------------------------
    const pass1Input = truncate(canonicalMarkdown, MAX_PASS1_MARKDOWN);
    const pass1 = await ctx.providers.llm.generateStructured({
      prompt: `Extract the source-level metadata for the following document.\n\n---\n${pass1Input}`,
      system: buildPass1Prompt(taxonomySlugs),
      schema: SourceMetadataSchema,
      key: `${fixtureKey}:metadata`,
    });
    const metadata: SourceMetadataOutput = pass1.value;

    await ctx.db
      .update(sources)
      .set({
        summary: metadata.summary,
        authors: metadata.authors,
        publicationDate: parsePublicationDate(metadata.publication_date),
        orgOwner: metadata.org_owner,
        updatedAt: new Date(),
      })
      .where(eq(sources.id, sourceId));

    const themeIdsForSource = await resolveOrCreateThematicAreas(
      repoCtx,
      metadata.thematic_area_slugs,
    );
    await replaceSourceThematicAreas(repoCtx, sourceId, themeIdsForSource);
    const sourceTypeIds = await resolveOrCreateSourceTypes(repoCtx, metadata.source_type_slugs);
    await replaceSourceSourceTypes(repoCtx, sourceId, sourceTypeIds);
    const sourcePurposeIds = await resolveOrCreatePurposes(repoCtx, metadata.purpose_slugs);
    await replaceSourcePurposes(repoCtx, sourceId, sourcePurposeIds);
    const roleIds = await resolveOrCreateRoleRelevances(repoCtx, metadata.role_relevance_slugs);
    await replaceSourceRoleRelevances(repoCtx, sourceId, roleIds);
    const audienceIdsForSource = await resolveOrCreateTargetAudienceTypes(
      repoCtx,
      metadata.target_audience_type_slugs,
    );
    await replaceSourceTargetAudienceTypes(repoCtx, sourceId, audienceIdsForSource);

    // ----- Section detection + Pass 2 ------------------------------------
    const section = detectRecommendationSections(canonicalMarkdown);
    const pass2Input = truncate(section.processText, MAX_PASS2_MARKDOWN);
    const pass2System =
      section.mode === 'sections'
        ? buildPass2StrictPrompt(taxonomySlugs)
        : buildPass2LooserPrompt(taxonomySlugs);

    const pass2 = await ctx.providers.llm.generateStructured({
      prompt: `Extract every actionable recommendation from the text below.\n\n---\n${pass2Input}`,
      system: pass2System,
      schema: RecommendationsSchema,
      key: fixtureKey,
    });
    const recs: RecommendationInput[] = pass2.value.recommendations;

    await ctx.db.transaction(async (tx) => {
      // Idempotency: delete existing recs for this source. Cascades clear
      // recommendation_statuses + every rec-side M2M row automatically.
      await tx.delete(recommendations).where(eq(recommendations.sourceId, sourceId));
    });

    for (let i = 0; i < recs.length; i += 1) {
      const rec = recs[i]!;
      const slugBase = rec.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
      const slug = `${slugBase || 'rec'}-${sourceId.slice(0, 8)}-${i}`;

      const priorityIds = rec.priority_timescale_slug
        ? await resolveOrCreatePriorityTimescales(repoCtx, [rec.priority_timescale_slug])
        : [];
      const priorityTimescaleId = priorityIds[0] ?? null;

      const [insertedRec] = await ctx.db
        .insert(recommendations)
        .values({
          sourceId,
          slug,
          title: rec.title,
          body: rec.body,
          pageAnchor: rec.page_start ?? null,
          targetOrganization: rec.target_organization ?? null,
          priorityTimescaleId,
          notes: rec.notes ?? null,
          confidence: rec.confidence,
        })
        .returning({ id: recommendations.id });
      if (!insertedRec) throw new Error('source.extract: recommendation insert returned no row');

      await ctx.db.insert(recommendationStatuses).values({
        recommendationId: insertedRec.id,
        status: 'open',
        note: 'initial',
      });

      const themeIds = await resolveOrCreateThematicAreas(repoCtx, rec.thematic_area_slugs);
      await replaceRecommendationThematicAreas(repoCtx, insertedRec.id, themeIds);
      const purposeIds = await resolveOrCreatePurposes(repoCtx, rec.purpose_slugs);
      await replaceRecommendationPurposes(repoCtx, insertedRec.id, purposeIds);
      const audienceIds = await resolveOrCreateTargetAudienceTypes(
        repoCtx,
        rec.target_audience_type_slugs,
      );
      await replaceRecommendationTargetAudienceTypes(repoCtx, insertedRec.id, audienceIds);
      const locationIds = await resolveOrCreateLocationScopes(repoCtx, rec.location_scope_slugs);
      await replaceRecommendationLocationScopes(repoCtx, insertedRec.id, locationIds);
    }

    // Final phase update — source advances to `embedding` (the next pipeline
    // stage). The actual `source.embed` enqueue lives in the queue wiring.
    await ctx.db
      .update(sources)
      .set({ status: 'embedding', updatedAt: new Date() })
      .where(eq(sources.id, sourceId));
    await ctx.queue.enqueue('source.embed', { sourceId });

    await ctx.emit(sourceId, {
      type: 'progress',
      percent: 80,
      message: `extracted ${recs.length} recommendation(s); ${section.mode === 'sections' ? 'from sections' : 'from full document'}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await ctx.emit(sourceId, { type: 'error', message });
    } catch {
      // emit failure shouldn't mask the real error
    }
    try {
      await ctx.db
        .update(sources)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(sources.id, sourceId));
    } catch {
      // bookkeeping failures shouldn't mask the real error
    }
    throw err;
  }
}
