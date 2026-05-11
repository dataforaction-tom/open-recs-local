import { asc } from 'drizzle-orm';
import { evidenceTypes, progressRatings } from '../db/schema';
import type { RepoContext } from './types';

export async function listEvidenceTypes(
  ctx: RepoContext,
): Promise<Array<{ slug: string; name: string }>> {
  const rows = await ctx.db
    .select({ slug: evidenceTypes.slug, name: evidenceTypes.name })
    .from(evidenceTypes)
    .orderBy(asc(evidenceTypes.name));
  return rows;
}

export async function listProgressRatings(
  ctx: RepoContext,
): Promise<Array<{ slug: string; name: string; weight: number }>> {
  const rows = await ctx.db
    .select({
      slug: progressRatings.slug,
      name: progressRatings.name,
      weight: progressRatings.weight,
    })
    .from(progressRatings)
    .orderBy(asc(progressRatings.weight));
  return rows;
}
