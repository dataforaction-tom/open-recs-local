import { eq, sql } from 'drizzle-orm';
import { recommendations } from '../db/schema';
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function composeAuthFilter(ctx: RepoContext) {
  if (ctx.auth.isSystem) return sql`TRUE`;
  const viewerId = ctx.auth.user?.id;
  if (viewerId && UUID_RE.test(viewerId)) {
    return sql`(s.is_private = FALSE OR s.owner_user_id = ${viewerId}::uuid)`;
  }
  return sql`s.is_private = FALSE`;
}

export type RecommendationDetail = {
  id: string;
  title: string;
  body: string;
  sourceId: string;
  sourceSlug: string;
  sourceTitle: string;
  pageAnchor: number | null;
  hasEmbedding: boolean;
  confidence: 'high' | 'medium' | 'low' | null;
  targetOrganization: string | null;
  priorityTimescaleName: string | null;
  notes: string | null;
};

export async function findRecommendationById(
  ctx: RepoContext,
  id: string,
): Promise<RecommendationDetail | null> {
  if (!UUID_RE.test(id)) return null;
  const auth = composeAuthFilter(ctx);
  const rows = await ctx.db.execute<{
    id: string;
    title: string;
    body: string;
    sourceId: string;
    sourceSlug: string;
    sourceTitle: string;
    pageAnchor: number | null;
    hasEmbedding: boolean;
    confidence: 'high' | 'medium' | 'low' | null;
    targetOrganization: string | null;
    priorityTimescaleName: string | null;
    notes: string | null;
  }>(sql`
    SELECT
      r.id::text       AS "id",
      r.title          AS "title",
      r.body           AS "body",
      r.source_id      AS "sourceId",
      s.slug           AS "sourceSlug",
      s.title          AS "sourceTitle",
      r.page_anchor    AS "pageAnchor",
      (r.embedding IS NOT NULL) AS "hasEmbedding",
      r.confidence     AS "confidence",
      r.target_organization AS "targetOrganization",
      pt.name          AS "priorityTimescaleName",
      r.notes          AS "notes"
    FROM recommendations r
    JOIN sources s ON s.id = r.source_id
    LEFT JOIN priority_timescales pt ON pt.id = r.priority_timescale_id
    WHERE r.id = ${id}::uuid
      AND ${auth}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

export type SimilarRec = {
  id: string;
  title: string;
  sourceSlug: string;
  sourceTitle: string;
  distance: number;
};

/**
 * Top-K most-similar recs by pgvector cosine distance, excluding the source
 * rec itself. Returns [] when the source rec has no embedding yet (still
 * being processed) — caller renders an empty state. Auth filter mirrors
 * the pattern in searchRecommendationsKeyword.
 */
export async function findSimilarRecommendations(
  ctx: RepoContext,
  id: string,
  k = 5,
): Promise<SimilarRec[]> {
  if (!UUID_RE.test(id)) return [];
  const auth = composeAuthFilter(ctx);
  const rows = await ctx.db.execute<{
    id: string;
    title: string;
    sourceSlug: string;
    sourceTitle: string;
    distance: number | string;
  }>(sql`
    WITH self AS (
      SELECT embedding FROM recommendations WHERE id = ${id}::uuid
    )
    SELECT
      r.id::text     AS "id",
      r.title        AS "title",
      s.slug         AS "sourceSlug",
      s.title        AS "sourceTitle",
      (r.embedding <=> (SELECT embedding FROM self)) AS "distance"
    FROM recommendations r
    JOIN sources s ON s.id = r.source_id
    WHERE r.id != ${id}::uuid
      AND r.embedding IS NOT NULL
      AND (SELECT embedding FROM self) IS NOT NULL
      AND ${auth}
    ORDER BY r.embedding <=> (SELECT embedding FROM self)
    LIMIT ${k}
  `);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    sourceSlug: row.sourceSlug,
    sourceTitle: row.sourceTitle,
    distance: Number(row.distance),
  }));
}

export type RecommendationListRow = {
  id: string;
  title: string;
  body: string;
  sourceId: string;
  sourceSlug: string;
  sourceTitle: string;
  createdAt: Date;
};

export type ListRecentFilters = {
  sourceId?: string;
  thematicAreaId?: string;
};

/**
 * Plain "browse mode" listing — the /recommendations page falls back to this
 * when the user hasn't typed a query yet. Sorted by created_at DESC; auth
 * filter and the same source/theme filters as the hybrid search service.
 */
export async function listRecentRecommendations(
  ctx: RepoContext,
  args: { limit?: number; offset?: number; filters?: ListRecentFilters } = {},
): Promise<RecommendationListRow[]> {
  const limit = args.limit ?? 50;
  const offset = args.offset ?? 0;
  const auth = composeAuthFilter(ctx);

  const predicates: ReturnType<typeof sql>[] = [];
  let themaJoin = sql``;
  if (args.filters?.sourceId && UUID_RE.test(args.filters.sourceId)) {
    predicates.push(sql`r.source_id = ${args.filters.sourceId}::uuid`);
  }
  if (args.filters?.thematicAreaId && UUID_RE.test(args.filters.thematicAreaId)) {
    themaJoin = sql`JOIN recommendations_thematic_areas rta ON rta.recommendation_id = r.id`;
    predicates.push(sql`rta.thematic_area_id = ${args.filters.thematicAreaId}::uuid`);
  }
  let predicateSql: ReturnType<typeof sql> = sql`TRUE`;
  for (let i = 0; i < predicates.length; i++) {
    predicateSql = i === 0 ? predicates[i]! : sql`${predicateSql} AND ${predicates[i]!}`;
  }

  const rows = await ctx.db.execute<{
    id: string;
    title: string;
    body: string;
    sourceId: string;
    sourceSlug: string;
    sourceTitle: string;
    createdAt: Date | string;
  }>(sql`
    SELECT
      r.id::text       AS "id",
      r.title          AS "title",
      r.body           AS "body",
      r.source_id      AS "sourceId",
      s.slug           AS "sourceSlug",
      s.title          AS "sourceTitle",
      r.created_at     AS "createdAt"
    FROM recommendations r
    JOIN sources s ON s.id = r.source_id
    ${themaJoin}
    WHERE ${auth}
      AND ${predicateSql}
    ORDER BY r.created_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    sourceId: row.sourceId,
    sourceSlug: row.sourceSlug,
    sourceTitle: row.sourceTitle,
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
  }));
}

/**
 * Edit-page projection: pulls the full set of editable columns for a
 * recommendation, gated by the same auth filter as `findRecommendationById`.
 */
export type RecommendationForEdit = {
  id: string;
  title: string;
  body: string;
  pageAnchor: number | null;
  targetOrganization: string | null;
  priorityTimescaleId: string | null;
  notes: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
};

export async function findRecommendationByIdForEdit(
  ctx: RepoContext,
  id: string,
): Promise<RecommendationForEdit | null> {
  if (!UUID_RE.test(id)) return null;
  const auth = composeAuthFilter(ctx);
  const rows = await ctx.db.execute<RecommendationForEdit>(sql`
    SELECT
      r.id::text                AS "id",
      r.title                   AS "title",
      r.body                    AS "body",
      r.page_anchor             AS "pageAnchor",
      r.target_organization     AS "targetOrganization",
      r.priority_timescale_id   AS "priorityTimescaleId",
      r.notes                   AS "notes",
      r.confidence              AS "confidence"
    FROM recommendations r
    JOIN sources s ON s.id = r.source_id
    WHERE r.id = ${id}::uuid
      AND ${auth}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

/**
 * UPDATE direct columns on a recommendation row. Tags + M2M memberships
 * are handled separately by the calling action via the per-axis
 * `replaceRecommendation*` repo functions.
 */
export type UpdateRecommendationCoreInput = {
  title: string;
  body: string;
  targetOrganization: string | null;
  priorityTimescaleId: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  notes: string | null;
  pageAnchor: number | null;
};

export async function updateRecommendationCore(
  ctx: RepoContext,
  recommendationId: string,
  input: UpdateRecommendationCoreInput,
): Promise<void> {
  await ctx.db
    .update(recommendations)
    .set({
      title: input.title,
      body: input.body,
      targetOrganization: input.targetOrganization,
      priorityTimescaleId: input.priorityTimescaleId,
      confidence: input.confidence,
      notes: input.notes,
      pageAnchor: input.pageAnchor,
      updatedAt: new Date(),
    })
    .where(eq(recommendations.id, recommendationId));
}
