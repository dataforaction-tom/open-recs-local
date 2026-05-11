import { asc, like, sql } from 'drizzle-orm';
import { analyticsCache } from '../db/schema';
import type { RepoContext } from './types';

export type CachedEntry<T> = {
  value: T;
  computedAt: Date;
};

/**
 * Read an entry from `analytics_cache`. Returns null when the key isn't
 * present; the caller decides whether to compute on demand. Open to any
 * authenticated context — cache rows are derived data, the page-level
 * auth gate controls *who can see* the resulting view.
 */
export async function getCached<T>(
  ctx: RepoContext,
  key: string,
): Promise<CachedEntry<T> | null> {
  const rows = await ctx.db
    .select({ value: analyticsCache.value, computedAt: analyticsCache.computedAt })
    .from(analyticsCache)
    .where(sql`${analyticsCache.key} = ${key}`)
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { value: row.value as T, computedAt: row.computedAt };
}

/** Upsert: refresh `value` + `computed_at = now()` on conflict. */
export async function setCached<T>(
  ctx: RepoContext,
  key: string,
  value: T,
): Promise<void> {
  await ctx.db
    .insert(analyticsCache)
    .values({ key, value: value as Record<string, unknown> })
    .onConflictDoUpdate({
      target: analyticsCache.key,
      set: {
        value: value as Record<string, unknown>,
        computedAt: sql`now()`,
      },
    });
}

/** Return cache keys starting with the prefix, alphabetical. Diagnostic. */
export async function listCachedKeys(
  ctx: RepoContext,
  prefix: string,
): Promise<string[]> {
  const rows = await ctx.db
    .select({ key: analyticsCache.key })
    .from(analyticsCache)
    .where(like(analyticsCache.key, `${prefix}%`))
    .orderBy(asc(analyticsCache.key));
  return rows.map((r) => r.key);
}
