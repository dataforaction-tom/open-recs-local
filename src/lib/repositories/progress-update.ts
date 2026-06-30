import { sql } from 'drizzle-orm';
import { progressUpdates } from '../db/schema';
import { findRecommendationById } from './recommendation';
import type { RepoContext } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CreateProgressUpdateInput = {
  recommendationId: string;
  progressNotes: string;
  evidenceType?: string | undefined;
  evidenceUrl?: string | undefined;
  userProgressRating?: string | undefined;
};

export type CreateProgressUpdateResult = {
  id: string;
  createdAt: Date;
};

/**
 * Inserts a progress update against a recommendation. Auth-checks via
 * `findRecommendationById`; returns null when the rec is invisible to the
 * viewer or doesn't exist. `authorUserId` is taken from the auth context —
 * local-mode writes NULL until Phase 8 wires real user identity.
 */
export async function createProgressUpdate(
  ctx: RepoContext,
  input: CreateProgressUpdateInput,
): Promise<CreateProgressUpdateResult | null> {
  const rec = await findRecommendationById(ctx, input.recommendationId);
  if (!rec) return null;

  const authorUserId =
    ctx.auth.user?.id && UUID_RE.test(ctx.auth.user.id) ? ctx.auth.user.id : null;
  const [row] = await ctx.db
    .insert(progressUpdates)
    .values({
      recommendationId: input.recommendationId,
      progressNotes: input.progressNotes,
      evidenceType: input.evidenceType ?? null,
      evidenceUrl: input.evidenceUrl ?? null,
      userProgressRating: input.userProgressRating ?? null,
      authorUserId,
    })
    .returning({ id: progressUpdates.id, createdAt: progressUpdates.createdAt });
  if (!row) return null;
  return { id: row.id, createdAt: row.createdAt };
}

export type ProgressUpdateRow = {
  id: string;
  createdAt: Date;
  progressNotes: string;
  evidenceType: { slug: string; name: string } | null;
  evidenceUrl: string | null;
  userProgressRating: { slug: string; name: string; weight: number } | null;
  authorUserId: string | null;
  authorName: string | null;
};

/**
 * Returns all progress updates for a rec, newest first. Empty array when the
 * rec is invisible to the viewer or doesn't exist (the caller has typically
 * already 404'd via `findRecommendationById` in that case).
 *
 * Joins `evidence_types` and `progress_ratings` on slug for display. Either
 * field renders as `null` when the slug isn't in the taxonomy — defensive
 * against rows written before a taxonomy edit.
 */
export async function listProgressUpdates(
  ctx: RepoContext,
  recommendationId: string,
): Promise<ProgressUpdateRow[]> {
  if (!UUID_RE.test(recommendationId)) return [];
  const rec = await findRecommendationById(ctx, recommendationId);
  if (!rec) return [];

  const rows = await ctx.db.execute<{
    id: string;
    createdAt: Date | string;
    progressNotes: string;
    evidenceSlug: string | null;
    evidenceName: string | null;
    evidenceUrl: string | null;
    ratingSlug: string | null;
    ratingName: string | null;
    ratingWeight: number | null;
    authorUserId: string | null;
    authorName: string | null;
  }>(sql`
    SELECT
      pu.id::text                   AS "id",
      pu.created_at                 AS "createdAt",
      pu.progress_notes             AS "progressNotes",
      pu.evidence_type              AS "evidenceSlug",
      et.name                       AS "evidenceName",
      pu.evidence_url               AS "evidenceUrl",
      pu.user_progress_rating       AS "ratingSlug",
      pr.name                       AS "ratingName",
      pr.weight                     AS "ratingWeight",
      pu.author_user_id::text       AS "authorUserId",
      u.name                        AS "authorName"
    FROM progress_updates pu
    LEFT JOIN evidence_types et ON et.slug = pu.evidence_type
    LEFT JOIN progress_ratings pr ON pr.slug = pu.user_progress_rating
    LEFT JOIN users u ON u.id = pu.author_user_id
    WHERE pu.recommendation_id = ${recommendationId}::uuid
    ORDER BY pu.created_at DESC
    LIMIT 50
  `);

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    progressNotes: row.progressNotes,
    evidenceType:
      row.evidenceSlug && row.evidenceName
        ? { slug: row.evidenceSlug, name: row.evidenceName }
        : null,
    evidenceUrl: row.evidenceUrl,
    userProgressRating:
      row.ratingSlug && row.ratingName && row.ratingWeight !== null
        ? { slug: row.ratingSlug, name: row.ratingName, weight: row.ratingWeight }
        : null,
    authorUserId: row.authorUserId,
    authorName: row.authorName,
  }));
}
