import { sql, type SQL } from 'drizzle-orm';
import type { RepoContext } from '../repositories/types';
import type { RecStatus } from '../db/schema';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Build the standard source-visibility filter shared across the analytics
 * queries. Mirrors the pattern used elsewhere in the repo layer: system
 * sees everything; signed-in users see public sources + their own private
 * sources; anonymous sees only public.
 */
function composeAuthFilter(ctx: RepoContext): SQL {
  if (ctx.auth.isSystem) return sql`TRUE`;
  const viewerId = ctx.auth.user.id;
  if (viewerId && UUID_RE.test(viewerId)) {
    return sql`(s.is_private = FALSE OR s.owner_user_id = ${viewerId}::uuid)`;
  }
  return sql`s.is_private = FALSE`;
}

function composeSourcePredicate(opts: { sourceId?: string } | undefined): SQL {
  if (!opts?.sourceId || !UUID_RE.test(opts.sourceId)) return sql`TRUE`;
  return sql`r.source_id = ${opts.sourceId}::uuid`;
}

export type RecsPerStatusRow = { status: RecStatus; count: number };
export type RecsPerThemeRow = {
  slug: string;
  name: string;
  colorHex: string;
  count: number;
};
export type MonthlyCountRow = { bucket: string; count: number };

const DEFAULT_MONTHS = 12;

/**
 * Count recommendations grouped by their latest status. Recs with no status
 * history default to 'open' (matches Phase 7's getLatestStatuses fallback).
 * Returns one row per status that actually has any recs; the chart layer
 * pads missing statuses to zero.
 */
export async function recsPerStatus(
  ctx: RepoContext,
  opts: { sourceId?: string } = {},
): Promise<RecsPerStatusRow[]> {
  const auth = composeAuthFilter(ctx);
  const srcPred = composeSourcePredicate(opts);

  const rows = await ctx.db.execute<{ status: RecStatus; count: string | number }>(sql`
    WITH latest AS (
      SELECT DISTINCT ON (rs.recommendation_id)
        rs.recommendation_id, rs.status
      FROM recommendation_statuses rs
      ORDER BY rs.recommendation_id, rs.created_at DESC
    )
    SELECT
      COALESCE(latest.status, 'open') AS status,
      COUNT(*)::int AS count
    FROM recommendations r
    JOIN sources s ON s.id = r.source_id
    LEFT JOIN latest ON latest.recommendation_id = r.id
    WHERE ${auth}
      AND ${srcPred}
    GROUP BY 1
    ORDER BY 1
  `);

  return rows.map((row) => ({ status: row.status, count: Number(row.count) }));
}

/**
 * Count recommendations grouped by thematic area. Only counts recs that have
 * at least one thematic area link; recs without a theme are skipped (the
 * chart heading should reflect "by theme — recs may belong to multiple").
 */
export async function recsPerThematicArea(
  ctx: RepoContext,
  opts: { sourceId?: string } = {},
): Promise<RecsPerThemeRow[]> {
  const auth = composeAuthFilter(ctx);
  const srcPred = composeSourcePredicate(opts);

  const rows = await ctx.db.execute<{
    slug: string;
    name: string;
    colorHex: string;
    count: string | number;
  }>(sql`
    SELECT
      ta.slug,
      ta.name,
      ta.color_hex AS "colorHex",
      COUNT(*)::int AS count
    FROM recommendations r
    JOIN sources s ON s.id = r.source_id
    JOIN recommendations_thematic_areas rta ON rta.recommendation_id = r.id
    JOIN thematic_areas ta ON ta.id = rta.thematic_area_id
    WHERE ${auth}
      AND ${srcPred}
    GROUP BY ta.id, ta.slug, ta.name, ta.color_hex
    ORDER BY count DESC, ta.name
  `);

  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    colorHex: row.colorHex,
    count: Number(row.count),
  }));
}

/**
 * Monthly count of progress updates. Backfills empty months in the window so
 * the line is continuous (chart-friendly). Window defaults to 12 months,
 * inclusive of the current month.
 */
export async function progressCadence(
  ctx: RepoContext,
  opts: { sourceId?: string; months?: number } = {},
): Promise<MonthlyCountRow[]> {
  const auth = composeAuthFilter(ctx);
  const srcPred = composeSourcePredicate(opts);
  const months = opts.months ?? DEFAULT_MONTHS;

  const rows = await ctx.db.execute<{ bucket: Date | string; count: string | number }>(sql`
    WITH spine AS (
      SELECT generate_series(
        date_trunc('month', now()) - (${months - 1} || ' months')::interval,
        date_trunc('month', now()),
        '1 month'::interval
      ) AS bucket
    ),
    counts AS (
      SELECT date_trunc('month', pu.created_at) AS bucket, COUNT(*)::int AS count
      FROM progress_updates pu
      JOIN recommendations r ON r.id = pu.recommendation_id
      JOIN sources s ON s.id = r.source_id
      WHERE ${auth}
        AND ${srcPred}
        AND pu.created_at >= date_trunc('month', now()) - (${months - 1} || ' months')::interval
      GROUP BY 1
    )
    SELECT spine.bucket, COALESCE(counts.count, 0)::int AS count
    FROM spine
    LEFT JOIN counts USING (bucket)
    ORDER BY spine.bucket
  `);

  return rows.map((row) => ({
    bucket: row.bucket instanceof Date ? row.bucket.toISOString() : String(row.bucket),
    count: Number(row.count),
  }));
}

/**
 * Monthly count of new sources by `created_at`. Same window + backfill
 * shape as `progressCadence`. Doesn't take a `sourceId` filter — the
 * timeline is inherently cross-source.
 */
export async function sourcePublicationTimeline(
  ctx: RepoContext,
  opts: { months?: number } = {},
): Promise<MonthlyCountRow[]> {
  const auth = composeAuthFilter(ctx);
  const months = opts.months ?? DEFAULT_MONTHS;

  const rows = await ctx.db.execute<{ bucket: Date | string; count: string | number }>(sql`
    WITH spine AS (
      SELECT generate_series(
        date_trunc('month', now()) - (${months - 1} || ' months')::interval,
        date_trunc('month', now()),
        '1 month'::interval
      ) AS bucket
    ),
    counts AS (
      SELECT date_trunc('month', s.created_at) AS bucket, COUNT(*)::int AS count
      FROM sources s
      WHERE ${auth}
        AND s.created_at >= date_trunc('month', now()) - (${months - 1} || ' months')::interval
      GROUP BY 1
    )
    SELECT spine.bucket, COALESCE(counts.count, 0)::int AS count
    FROM spine
    LEFT JOIN counts USING (bucket)
    ORDER BY spine.bucket
  `);

  return rows.map((row) => ({
    bucket: row.bucket instanceof Date ? row.bucket.toISOString() : String(row.bucket),
    count: Number(row.count),
  }));
}
