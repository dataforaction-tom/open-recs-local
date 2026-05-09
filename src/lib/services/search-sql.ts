import { sql, type SQL } from 'drizzle-orm';
import type { RepoContext } from '../repositories/types';

export type SearchFilters = {
  sourceId?: string;
  thematicAreaId?: string;
  createdAfter?: Date;
  createdBefore?: Date;
};

export type RrfRow = {
  id: string;
  title: string;
  body: string;
  sourceId: string;
  sourceSlug: string;
  rrfScore: number | null;
  keywordRank: number | null;
  vectorRank: number | null;
};

export type RunRrfArgs = {
  q: string;
  queryEmbedding: number[];
  limit?: number;
  filters?: SearchFilters;
};

export type RunKeywordArgs = {
  q: string;
  limit?: number;
  filters?: SearchFilters;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_LIMIT = 50;
const PER_CTE_LIMIT = 100;

export function arrayToVectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}

function composeAuthFilter(ctx: RepoContext): SQL {
  if (ctx.auth.isSystem) return sql`TRUE`;
  const viewerId = ctx.auth.user?.id;
  if (viewerId && UUID_RE.test(viewerId)) {
    return sql`(s.is_private = FALSE OR s.owner_user_id = ${viewerId}::uuid)`;
  }
  return sql`s.is_private = FALSE`;
}

function composeRecFilters(filters: SearchFilters | undefined): {
  predicates: SQL;
  themaJoin: SQL;
} {
  if (!filters) return { predicates: sql`TRUE`, themaJoin: sql`` };

  const parts: SQL[] = [];
  let themaJoin: SQL = sql``;

  if (filters.sourceId && UUID_RE.test(filters.sourceId)) {
    parts.push(sql`r.source_id = ${filters.sourceId}::uuid`);
  }
  if (filters.thematicAreaId && UUID_RE.test(filters.thematicAreaId)) {
    themaJoin = sql`JOIN recommendations_thematic_areas rta ON rta.recommendation_id = r.id`;
    parts.push(sql`rta.thematic_area_id = ${filters.thematicAreaId}::uuid`);
  }
  if (filters.createdAfter) {
    parts.push(sql`r.created_at >= ${filters.createdAfter.toISOString()}::timestamptz`);
  }
  if (filters.createdBefore) {
    parts.push(sql`r.created_at < ${filters.createdBefore.toISOString()}::timestamptz`);
  }

  if (parts.length === 0) return { predicates: sql`TRUE`, themaJoin };

  let predicates: SQL = parts[0]!;
  for (let i = 1; i < parts.length; i++) {
    predicates = sql`${predicates} AND ${parts[i]!}`;
  }
  return { predicates, themaJoin };
}

type RawRow = {
  id: string;
  title: string;
  body: string;
  sourceId: string;
  sourceSlug: string;
  rrfScore: number | null;
  keywordRank: number | null;
  vectorRank: number | null;
};

function toRrfRow(row: RawRow): RrfRow {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    sourceId: row.sourceId,
    sourceSlug: row.sourceSlug,
    rrfScore: row.rrfScore === null ? null : Number(row.rrfScore),
    keywordRank: row.keywordRank === null ? null : Number(row.keywordRank),
    vectorRank: row.vectorRank === null ? null : Number(row.vectorRank),
  };
}

export async function runRecommendationsRrf(
  ctx: RepoContext,
  args: RunRrfArgs,
): Promise<RrfRow[]> {
  const limit = args.limit ?? DEFAULT_LIMIT;
  const tsQuery = sql`websearch_to_tsquery('english', ${args.q})`;
  const auth = composeAuthFilter(ctx);
  const { predicates, themaJoin } = composeRecFilters(args.filters);
  const vectorLit = arrayToVectorLiteral(args.queryEmbedding);

  // RRF (Cormack et al., 2009): two ranked candidate sets fused as
  //   sum( 1 / (k + rank_i) )  with k=60.
  // Missing rank is treated as 1000 — strictly worse than any present rank
  // (1/(60+1000) ≈ 9.4e-4 vs 1/(60+1) ≈ 0.0164) — so a row missing from
  // one side never beats a row present in both.
  const rows = await ctx.db.execute<RawRow>(sql`
    WITH keyword_ranked AS (
      SELECT r.id,
        row_number() OVER (
          ORDER BY ts_rank_cd(
            setweight(to_tsvector('english', coalesce(r.title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(r.body, '')), 'B'),
            ${tsQuery}
          ) DESC, r.created_at DESC
        ) AS rank
      FROM recommendations r
      JOIN sources s ON s.id = r.source_id
      ${themaJoin}
      WHERE r.tsv @@ ${tsQuery}
        AND ${auth}
        AND ${predicates}
      LIMIT ${PER_CTE_LIMIT}
    ),
    vector_ranked AS (
      SELECT r.id,
        row_number() OVER (
          ORDER BY r.embedding <=> ${sql.raw(`'${vectorLit}'`)}::vector(768), r.created_at DESC
        ) AS rank
      FROM recommendations r
      JOIN sources s ON s.id = r.source_id
      ${themaJoin}
      WHERE r.embedding IS NOT NULL
        AND ${auth}
        AND ${predicates}
      LIMIT ${PER_CTE_LIMIT}
    ),
    fused AS (
      SELECT coalesce(kr.id, vr.id) AS id,
        1.0 / (60 + coalesce(kr.rank, 1000))
          + 1.0 / (60 + coalesce(vr.rank, 1000)) AS rrf_score,
        kr.rank AS keyword_rank,
        vr.rank AS vector_rank
      FROM keyword_ranked kr
      FULL OUTER JOIN vector_ranked vr ON vr.id = kr.id
    )
    SELECT
      r.id          AS "id",
      r.title       AS "title",
      r.body        AS "body",
      r.source_id   AS "sourceId",
      s.slug        AS "sourceSlug",
      f.rrf_score   AS "rrfScore",
      f.keyword_rank AS "keywordRank",
      f.vector_rank  AS "vectorRank"
    FROM fused f
    JOIN recommendations r ON r.id = f.id
    JOIN sources s ON s.id = r.source_id
    ORDER BY f.rrf_score DESC, r.created_at DESC
    LIMIT ${limit}
  `);

  return rows.map(toRrfRow);
}

export async function runRecommendationsKeyword(
  ctx: RepoContext,
  args: RunKeywordArgs,
): Promise<RrfRow[]> {
  const limit = args.limit ?? DEFAULT_LIMIT;
  const tsQuery = sql`websearch_to_tsquery('english', ${args.q})`;
  const auth = composeAuthFilter(ctx);
  const { predicates, themaJoin } = composeRecFilters(args.filters);

  const rows = await ctx.db.execute<RawRow>(sql`
    WITH keyword_ranked AS (
      SELECT r.id,
        row_number() OVER (
          ORDER BY ts_rank_cd(
            setweight(to_tsvector('english', coalesce(r.title, '')), 'A') ||
            setweight(to_tsvector('english', coalesce(r.body, '')), 'B'),
            ${tsQuery}
          ) DESC, r.created_at DESC
        ) AS rank
      FROM recommendations r
      JOIN sources s ON s.id = r.source_id
      ${themaJoin}
      WHERE r.tsv @@ ${tsQuery}
        AND ${auth}
        AND ${predicates}
      LIMIT ${PER_CTE_LIMIT}
    )
    SELECT
      r.id          AS "id",
      r.title       AS "title",
      r.body        AS "body",
      r.source_id   AS "sourceId",
      s.slug        AS "sourceSlug",
      NULL::float   AS "rrfScore",
      kr.rank       AS "keywordRank",
      NULL::int     AS "vectorRank"
    FROM keyword_ranked kr
    JOIN recommendations r ON r.id = kr.id
    JOIN sources s ON s.id = r.source_id
    ORDER BY kr.rank ASC, r.created_at DESC
    LIMIT ${limit}
  `);

  return rows.map(toRrfRow);
}
