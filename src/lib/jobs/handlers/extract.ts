import { and, asc, eq } from 'drizzle-orm';
import type { JobContext } from '../context';
import type { QueuePayloads } from '../types';
import {
  recommendations,
  recommendationStatuses,
  recommendationsThematicAreas,
  sourceFiles,
  sources,
  thematicAreas,
} from '@/lib/db/schema';
import { ExtractionSchema, type RecommendationInput } from '@/lib/services/extraction-schema';

/**
 * Max canonical markdown we will stuff into a single prompt. Real extraction
 * will need a chunking strategy for long documents; for Task 9 we just
 * truncate with a note. Real adapters honour the same cap.
 */
const MAX_PROMPT_MARKDOWN = 100_000;

// The system prompt includes a literal JSON skeleton because Llama 3.x
// (and similar small open models) often return a bare `[...]` array when
// asked for "recommendations", rather than an object wrapping the array.
// The skeleton anchors the structure; the openai-compat adapter adds its
// own "respond with raw JSON only" instruction on top.
function buildSystemPrompt(taxonomySlugs: readonly string[]): string {
  const slugList =
    taxonomySlugs.length > 0
      ? taxonomySlugs.map((s) => `"${s}"`).join(', ')
      : '(taxonomy is empty — omit thematic_area_slug)';
  return [
    'You are an assistant extracting structured recommendations from policy / report documents.',
    'Return a JSON object with a top-level "recommendations" array. Do not return a bare array.',
    'Do not invent recommendations not grounded in the document.',
    '',
    `For "thematic_area_slug", pick exactly one of: ${slugList}. Use null or omit the field if none clearly applies — do not invent new slugs.`,
    '',
    'The exact JSON shape is:',
    '{',
    '  "recommendations": [',
    '    {',
    '      "title": "Short title (5+ chars)",',
    '      "full_text": "Full recommendation text (20+ chars)",',
    '      "thematic_area_slug": "one of the slugs listed above, or null",',
    '      "page_start": null,',
    '      "page_end": null',
    '    }',
    '  ]',
    '}',
  ].join('\n');
}

function buildUserPrompt(markdown: string): string {
  const truncated =
    markdown.length > MAX_PROMPT_MARKDOWN
      ? `${markdown.slice(0, MAX_PROMPT_MARKDOWN)}\n\n<!-- truncated: ${markdown.length - MAX_PROMPT_MARKDOWN} chars omitted -->`
      : markdown;
  return (
    'Extract every discrete recommendation from the following document. ' +
    'For each, provide a short title, the full recommendation text, and (if apparent) ' +
    'a thematic area slug chosen from the project taxonomy.\n\n' +
    '---\n' +
    truncated
  );
}

/**
 * Derive the fake LLM fixture key from the source's original storage key.
 * Matches the parse handler's convention (filename stem).
 */
function fixtureKeyFromStorageKey(storageKey: string): string {
  const filename = storageKey.split('/').pop() ?? storageKey;
  return filename.replace(/\.[^.]+$/, '');
}

/**
 * `source.extract` handler.
 *
 * Pipeline step 2: feed the canonical markdown to the LLM with a strict Zod
 * schema, persist the resulting recommendations + taxonomy links + an
 * initial status row per rec, then enqueue `source.embed`.
 *
 * Status mapping
 * --------------
 * The plan wording says "set sources.status='extracted'" but the schema
 * enum exposes pipeline *phases*: pending, parsing, extracting, embedding,
 * ready, failed. We drive `sources.status` to the phase the source is
 * entering — after a successful extract it is ready for embedding, so we
 * leave it at `embedding`. Same convention as Task 8 (parse → extracting).
 *
 * Idempotency
 * -----------
 * pg-boss retries failed jobs. On each run we delete existing
 * recommendations for this source before inserting the new set.
 * `ON DELETE CASCADE` handles `recommendations_thematic_areas` and
 * `recommendation_statuses`.
 *
 * Unknown slugs
 * -------------
 * If the LLM returns a `thematic_area_slug` that doesn't resolve in
 * `thematic_areas`, we skip the join (don't auto-create, don't fail) and
 * emit a progress warning so the UI can surface it.
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

    // Locate the original upload so we can key the fake LLM's fixture
    // lookup by filename stem — same convention as parse. Real LLM adapters
    // ignore `key`.
    const fileRows = await ctx.db
      .select({ storageKey: sourceFiles.storageKey })
      .from(sourceFiles)
      .where(and(eq(sourceFiles.sourceId, sourceId), eq(sourceFiles.role, 'original')))
      .orderBy(asc(sourceFiles.createdAt))
      .limit(1);
    const fixtureKey = fileRows[0] ? fixtureKeyFromStorageKey(fileRows[0].storageKey) : sourceRow.slug;

    // Load the taxonomy slugs up front so the system prompt can list them
    // explicitly — a real LLM can't pick the right slug if it doesn't know
    // which ones are valid. The fake LLM ignores `system` (fixture-driven)
    // so this is inert for tests.
    const taxonomyRows = await ctx.db
      .select({ id: thematicAreas.id, slug: thematicAreas.slug })
      .from(thematicAreas);
    const taxonomySlugs = taxonomyRows.map((r) => r.slug);

    const { value } = await ctx.providers.llm.generateStructured({
      prompt: buildUserPrompt(canonicalMarkdown),
      system: buildSystemPrompt(taxonomySlugs),
      schema: ExtractionSchema,
      key: fixtureKey,
    });

    const recs: RecommendationInput[] = value.recommendations;

    // Resolve the slugs the LLM returned to area ids. Slugs that don't
    // match the taxonomy are skipped (no auto-create, no failure).
    const uniqueSlugs = Array.from(
      new Set(recs.map((r) => r.thematic_area_slug).filter((s): s is string => !!s)),
    );
    const knownAreas = taxonomyRows.filter((a) => uniqueSlugs.includes(a.slug));
    const slugToAreaId = new Map(knownAreas.map((a) => [a.slug, a.id]));
    const unknownSlugs = uniqueSlugs.filter((s) => !slugToAreaId.has(s));

    await ctx.db.transaction(async (tx) => {
      // why: pg-boss retries; clearing existing recs first keeps re-extracts
      // idempotent. Cascades handle join + status rows.
      await tx.delete(recommendations).where(eq(recommendations.sourceId, sourceId));

      for (let i = 0; i < recs.length; i += 1) {
        const rec = recs[i]!;
        // Slug needs to be globally unique; a uuid suffix keeps that true
        // even when two sources surface a recommendation with the same
        // title. Stable across retries? No — but retries delete-then-insert
        // so no caller depends on the rec slug surviving a retry.
        const slugBase = rec.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 80);
        const slug = `${slugBase || 'rec'}-${sourceId.slice(0, 8)}-${i}`;
        const pageAnchor = rec.page_start ?? null;

        const [insertedRec] = await tx
          .insert(recommendations)
          .values({
            sourceId,
            slug,
            title: rec.title,
            body: rec.full_text,
            pageAnchor,
          })
          .returning({ id: recommendations.id });
        if (!insertedRec) throw new Error('source.extract: recommendation insert returned no row');

        // Initial status: `'open'` — the first value in REC_STATUS.
        await tx.insert(recommendationStatuses).values({
          recommendationId: insertedRec.id,
          status: 'open',
          note: 'initial',
        });

        if (rec.thematic_area_slug) {
          const areaId = slugToAreaId.get(rec.thematic_area_slug);
          if (areaId) {
            await tx.insert(recommendationsThematicAreas).values({
              recommendationId: insertedRec.id,
              thematicAreaId: areaId,
            });
          }
        }

        // Progress ping per rec; UX-cheap even for small N.
        const percent = Math.round(((i + 1) / Math.max(recs.length, 1)) * 100);
        await ctx.emit(sourceId, { type: 'progress', percent });
      }

      await tx
        .update(sources)
        .set({ status: 'embedding', updatedAt: new Date() })
        .where(eq(sources.id, sourceId));
    });

    // Commit-gated: only surface the unknown-slug warning after the tx has
    // committed, so a rollback doesn't emit a misleading warning for recs
    // that never persisted.
    if (unknownSlugs.length > 0) {
      await ctx.emit(sourceId, {
        type: 'progress',
        percent: 0,
        message: `unrecognised thematic area slug(s): ${unknownSlugs.join(', ')}`,
      });
    }

    // Only enqueue once the transaction has committed.
    await ctx.queue.enqueue('source.embed', { sourceId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await ctx.emit(sourceId, { type: 'error', message });
    } catch {
      // emit failures shouldn't mask the real error
    }
    try {
      await ctx.db
        .update(sources)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(sources.id, sourceId));
    } catch {
      // same rationale as parse handler
    }
    throw err;
  }
}
