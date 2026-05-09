import { sql } from 'drizzle-orm';
import { type RepoContext } from './types';

/**
 * One row returned from a keyword search. `rank` is the `ts_rank_cd` score
 * (cover-density) for ordering; `snippet` is an HTML-ish fragment produced
 * by `ts_headline` with `<b>...</b>` markers around the hit terms.
 */
export type KeywordSearchHit = {
  id: string;
  title: string;
  snippet: string;
  rank: number;
  sourceId: string;
};

/**
 * Full-text keyword search over `recommendations.tsv`.
 *
 * - Uses `websearch_to_tsquery('english', q)` so the caller gets a natural
 *   query grammar (quoted phrases, OR, leading `-` for negation).
 * - Orders by `ts_rank_cd` DESC so title matches outrank body matches given
 *   identical vocabulary density (the `tsv` is generated from title + body
 *   concatenated; weighting is intrinsic to document length, not explicit
 *   A/B setweight — good enough for v1).
 * - Authorization: public sources are visible to everyone; private sources
 *   are visible only to their owner. `isSystem` ctx (local mode) sees all.
 *   This mirrors the hosted-mode filter so switching `APP_MODE` doesn't
 *   change the shape of the query — Phase 8 can flip auth on without a
 *   query rewrite.
 */
export async function searchRecommendationsKeyword(
  ctx: RepoContext,
  q: string,
  limit = 50,
): Promise<KeywordSearchHit[]> {
  const tsQuery = sql`websearch_to_tsquery('english', ${q})`;

  // Build the auth filter in TS rather than SQL so we avoid casting the
  // local-mode sentinel `user.id = 'system'` to uuid. System ctx skips the
  // filter entirely; for a non-system ctx we only accept a valid uuid.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const viewerId = ctx.auth.user?.id;
  const authFilter = ctx.auth.isSystem
    ? sql`TRUE`
    : viewerId && UUID_RE.test(viewerId)
      ? sql`(s.is_private = FALSE OR s.owner_user_id = ${viewerId}::uuid)`
      : sql`s.is_private = FALSE`;

  const rows = await ctx.db.execute<{
    id: string;
    title: string;
    snippet: string;
    rank: number;
    sourceId: string;
  }>(sql`
    SELECT
      r.id AS "id",
      r.title AS "title",
      r.source_id AS "sourceId",
      -- Rebuild a weighted tsvector at query time for ranking only.
      -- The stored r.tsv handles the @@ index predicate (fast GIN path);
      -- the setweight-ed vector here gives title matches a genuine lift
      -- over body matches under ts_rank_cd.
      ts_rank_cd(
        setweight(to_tsvector('english', coalesce(r.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(r.body, '')), 'B'),
        ${tsQuery}
      ) AS "rank",
      ts_headline(
        'english',
        r.title || E'\n' || r.body,
        ${tsQuery},
        'MaxFragments=2,MaxWords=30,MinWords=5,ShortWord=3'
      ) AS "snippet"
    FROM recommendations r
    JOIN sources s ON s.id = r.source_id
    WHERE r.tsv @@ ${tsQuery}
      AND ${authFilter}
    ORDER BY "rank" DESC, r.created_at DESC
    LIMIT ${limit}
  `);

  // drizzle-orm/postgres-js returns an array of rows from `execute` with
  // numeric fields typed as `number` already — `rank` is a float4.
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    snippet: row.snippet,
    rank: Number(row.rank),
    sourceId: row.sourceId,
  }));
}
