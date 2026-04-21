import { and, eq, isNull, inArray } from 'drizzle-orm';
import type { JobContext } from '../context';
import type { QueuePayloads } from '../types';
import { EMBEDDING_DIM, recommendations, sources } from '@/lib/db/schema';

/**
 * Batch size for embedding calls. 32 is small enough to keep memory bounded
 * for long documents and big enough to amortise per-call overhead against
 * typical embedding providers. Keep this a module-local constant so tests
 * can assert the exact batching behaviour.
 */
const BATCH_SIZE = 32;

/**
 * `source.embed` handler — terminal stage of the pipeline.
 *
 * Pipeline step 3: load every recommendation for the source that is missing
 * an embedding, hand batches of {@link BATCH_SIZE} texts to the configured
 * embedding provider, and persist the returned vectors back onto their row.
 * Once every row has an embedding, flip `sources.status` to `ready` and emit
 * the terminal `phase: 'ready'` event.
 *
 * Idempotency
 * -----------
 * On pg-boss retry the `embedding IS NULL` filter naturally scopes work to
 * rows that haven't been embedded yet. A partial previous run doesn't need
 * any cleanup — the retry just picks up the remaining NULL rows. No outer
 * transaction: each batch's UPDATEs are atomic on their own, and the final
 * `sources.status='ready'` flip is a separate statement after the last
 * batch. If anything fails mid-pipeline, the already-embedded rows stay
 * embedded and the retry finishes the job.
 *
 * Dim validation
 * --------------
 * We reject vectors whose length doesn't match {@link EMBEDDING_DIM} before
 * writing. Catches a provider / model swap that would otherwise surface as
 * a pgvector "expected N dimensions" error deep in the UPDATE.
 *
 * Progress
 * --------
 * After each batch we emit a `progress` event with cumulative percent,
 * capped at 99 so the terminal `phase: 'ready'` emit is the only thing the
 * UI sees flip the source to done.
 */
export async function embedHandler(
  ctx: JobContext,
  payload: QueuePayloads['source.embed'],
): Promise<void> {
  const { sourceId } = payload;
  try {
    await ctx.emit(sourceId, { type: 'phase', phase: 'embedding' });

    // Pull everything that still needs embedding. For realistic source
    // sizes (tens to low hundreds of recs) a single select is fine; if we
    // ever chew through thousands we can paginate.
    const pending = await ctx.db
      .select({
        id: recommendations.id,
        title: recommendations.title,
        body: recommendations.body,
      })
      .from(recommendations)
      .where(and(eq(recommendations.sourceId, sourceId), isNull(recommendations.embedding)));

    const total = pending.length;
    let done = 0;

    for (let start = 0; start < total; start += BATCH_SIZE) {
      const batch = pending.slice(start, start + BATCH_SIZE);
      const texts = batch.map((r) => `${r.title}\n\n${r.body}`);

      const vectors = await ctx.providers.embedding.embed(texts);

      if (vectors.length !== batch.length) {
        throw new Error(
          `embed: provider returned ${vectors.length} vectors for ${batch.length} inputs`,
        );
      }
      for (const v of vectors) {
        if (v.length !== EMBEDDING_DIM) {
          throw new Error(
            `embed: expected ${EMBEDDING_DIM}-dim vectors, got ${v.length} from provider`,
          );
        }
      }

      // Write each vector back onto its row. Per-row UPDATE keeps the
      // mapping trivial; drizzle's vector helper serialises number[] as
      // JSON which pgvector parses as a literal. Could be collapsed into
      // a single UPDATE ... FROM (VALUES ...) if this becomes a bottleneck.
      const modelTag = ctx.providers.embedding.model;
      for (let i = 0; i < batch.length; i += 1) {
        const recRow = batch[i]!;
        const vector = vectors[i]!;
        await ctx.db
          .update(recommendations)
          .set({
            embedding: vector,
            embeddingModel: modelTag,
            updatedAt: new Date(),
          })
          .where(inArray(recommendations.id, [recRow.id]));
      }

      done += batch.length;
      // Cap progress at 99 — phase:'ready' below is the signal for 100%.
      const percent = Math.min(99, Math.round((done / Math.max(total, 1)) * 100));
      if (percent >= 1) {
        await ctx.emit(sourceId, {
          type: 'progress',
          percent,
          message: `${done}/${total} embedded`,
        });
      }
    }

    await ctx.db
      .update(sources)
      .set({ status: 'ready', updatedAt: new Date() })
      .where(eq(sources.id, sourceId));

    await ctx.emit(sourceId, { type: 'phase', phase: 'ready' });
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
      // bookkeeping failures shouldn't mask the real error
    }
    throw err;
  }
}
