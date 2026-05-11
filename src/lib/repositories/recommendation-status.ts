import { sql } from 'drizzle-orm';
import { type RecStatus } from '../db/schema';
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
