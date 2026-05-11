import { sql } from 'drizzle-orm';
import { recommendationStatuses, type RecStatus } from '../db/schema';
import { findRecommendationById } from './recommendation';
import type { RepoContext } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function composeAuthFilter(ctx: RepoContext) {
  if (ctx.auth.isSystem) return sql`TRUE`;
  const viewerId = ctx.auth.user?.id;
  if (viewerId && UUID_RE.test(viewerId)) {
    return sql`(s.is_private = FALSE OR s.owner_user_id = ${viewerId}::uuid)`;
  }
  return sql`s.is_private = FALSE`;
}

export type LatestStatus = {
  status: RecStatus;
  setAt: Date;
  note: string | null;
};

/**
 * Returns the most-recent status row per recommendation. Recs with no history
 * are absent from the map — the caller substitutes the default ('open') so it
 * can use information the repo doesn't have (the rec's `created_at`, say).
 *
 * Defends against arbitrary callers by JOINing through `sources` and applying
 * the standard auth filter — a private rec the viewer can't see will not
 * appear in the result even if its id is in the input array.
 */
export async function getLatestStatuses(
  ctx: RepoContext,
  recIds: string[],
): Promise<Map<string, LatestStatus>> {
  const validIds = recIds.filter((id) => UUID_RE.test(id));
  if (validIds.length === 0) return new Map();

  const auth = composeAuthFilter(ctx);
  const idList = sql.join(
    validIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const rows = await ctx.db.execute<{
    recId: string;
    status: RecStatus;
    note: string | null;
    setAt: Date | string;
  }>(sql`
    SELECT DISTINCT ON (rs.recommendation_id)
      rs.recommendation_id::text AS "recId",
      rs.status                  AS "status",
      rs.note                    AS "note",
      rs.created_at              AS "setAt"
    FROM recommendation_statuses rs
    JOIN recommendations r ON r.id = rs.recommendation_id
    JOIN sources s ON s.id = r.source_id
    WHERE rs.recommendation_id IN (${idList})
      AND ${auth}
    ORDER BY rs.recommendation_id, rs.created_at DESC
  `);

  const out = new Map<string, LatestStatus>();
  for (const row of rows) {
    out.set(row.recId, {
      status: row.status,
      note: row.note,
      setAt: row.setAt instanceof Date ? row.setAt : new Date(row.setAt),
    });
  }
  return out;
}

/**
 * Single-rec convenience over `getLatestStatuses`. Returns null when the rec
 * has no status history (caller substitutes the default 'open').
 */
export async function getLatestStatus(
  ctx: RepoContext,
  recommendationId: string,
): Promise<LatestStatus | null> {
  const map = await getLatestStatuses(ctx, [recommendationId]);
  return map.get(recommendationId) ?? null;
}

export type AppendStatusInput = {
  recommendationId: string;
  status: RecStatus;
  note?: string | undefined;
};

export type AppendStatusResult = {
  id: string;
  status: RecStatus;
  setAt: Date;
};

/**
 * Appends a row to `recommendation_statuses` for the given rec. Auth-checks
 * via `findRecommendationById` first; returns null when the rec is invisible
 * to the viewer or doesn't exist. `setByUserId` is taken from the auth
 * context — local-mode contexts (no real user) write NULL, which the schema
 * permits until Better-auth lands in Phase 8.
 */
export async function appendStatus(
  ctx: RepoContext,
  input: AppendStatusInput,
): Promise<AppendStatusResult | null> {
  const rec = await findRecommendationById(ctx, input.recommendationId);
  if (!rec) return null;

  const setByUserId = ctx.auth.user?.id && UUID_RE.test(ctx.auth.user.id) ? ctx.auth.user.id : null;
  const [row] = await ctx.db
    .insert(recommendationStatuses)
    .values({
      recommendationId: input.recommendationId,
      status: input.status,
      note: input.note ?? null,
      setByUserId,
    })
    .returning({
      id: recommendationStatuses.id,
      status: recommendationStatuses.status,
      setAt: recommendationStatuses.createdAt,
    });
  if (!row) return null;
  return { id: row.id, status: row.status, setAt: row.setAt };
}
