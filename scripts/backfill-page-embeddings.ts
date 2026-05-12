/**
 * One-shot backfill: re-enqueues `source.embed` for any source that has
 * unembedded `source_pages`. Safe to run repeatedly — the embed handler
 * uses `embedding IS NULL` to scope work, so already-embedded rows stay
 * untouched and already-finished sources flip back to `ready` cleanly.
 *
 * Why this exists
 * ---------------
 * Before this commit, `embedHandler` only embedded `recommendations` and
 * never `source_pages`. Sources that completed the pipeline pre-fix have
 * NULL page embeddings, so `searchSourcePages` (the /chat retrieval
 * layer) returns 0 hits and the assistant says "no passages retrieved".
 *
 * Run: `pnpm tsx scripts/backfill-page-embeddings.ts`
 *
 * Output: one line per source enqueued, with the source slug and the
 * number of NULL pages it has, plus a final tally.
 */
import { and, eq, isNull, sql as drizzleSql } from 'drizzle-orm';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createQueue } from '@/lib/jobs/queue';
import { sourcePages, sources } from '@/lib/db/schema';

async function main(): Promise<void> {
  const env = loadEnv();
  const { db, sql } = createDb(env.DATABASE_URL);
  const queue = await createQueue({ connectionString: env.DATABASE_URL });

  try {
    // Restrict to sources that have already reached `ready`. parseHandler
    // inserts source_pages before extraction completes, so an in-flight
    // source (status `parsing` / `extracting` / `embedding`) will show up
    // here with NULL page embeddings — enqueuing `source.embed` for it
    // would race the natural pipeline and flip status to `ready` while
    // extraction is still running. Failed sources are also skipped: their
    // partial pages shouldn't suddenly promote the row to `ready`.
    const rows = await db
      .select({
        sourceId: sources.id,
        slug: sources.slug,
        status: sources.status,
        nullPages: drizzleSql<number>`count(${sourcePages.id})`.as('null_pages'),
      })
      .from(sources)
      .innerJoin(sourcePages, drizzleSql`${sourcePages.sourceId} = ${sources.id}`)
      .where(and(isNull(sourcePages.embedding), eq(sources.status, 'ready')))
      .groupBy(sources.id, sources.slug, sources.status);

    if (rows.length === 0) {
      console.log('[backfill] no sources with unembedded pages — nothing to do');
      return;
    }

    console.log(`[backfill] ${rows.length} source(s) with unembedded pages:`);
    for (const row of rows) {
      console.log(
        `  - ${row.slug} (status=${row.status}, ${row.nullPages} NULL page(s))`,
      );
      await queue.enqueue('source.embed', { sourceId: row.sourceId });
    }
    console.log(`[backfill] enqueued source.embed for ${rows.length} source(s)`);
  } finally {
    await queue.stop().catch(() => {});
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
