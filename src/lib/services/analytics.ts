import { getCached, setCached } from '../repositories/analytics-cache';
import { sources } from '../db/schema';
import type { RepoContext } from '../repositories/types';
import {
  progressCadence,
  recsPerStatus,
  recsPerThematicArea,
  sourcePublicationTimeline,
  type MonthlyCountRow,
  type RecsPerStatusRow,
  type RecsPerThemeRow,
} from './analytics-sql';

/**
 * How long a cached entry is trusted before it's recomputed on read. The
 * 02:00 cron is a periodic full refresh; this TTL is the freshness
 * guarantee in between — without it a cache row populated when the DB was
 * empty would keep serving zeros for up to 24 hours after new data lands.
 * Five minutes is a round number that's fast enough to feel live during
 * interactive use and long enough to keep hot pages cheap under traffic.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Read a cache key; on miss OR stale hit, compute it, store the result,
 * and return it. Auth: the cache itself is open-read; the *page* calling
 * this is what gates visibility. `compute` runs with whatever ctx the
 * caller passed — usually a system ctx (cron) or a system-equivalent
 * admin ctx for global pages. Per-source pages pass the request ctx so
 * the auth filter narrows.
 */
export async function getOrCompute<T>(
  ctx: RepoContext,
  key: string,
  compute: () => Promise<T>,
): Promise<T> {
  const hit = await getCached<T>(ctx, key);
  if (hit && Date.now() - hit.computedAt.getTime() < CACHE_TTL_MS) {
    return hit.value;
  }
  const value = await compute();
  await setCached(ctx, key, value);
  return value;
}

const KEY = {
  globalRecsPerStatus: 'analytics:global:recs-per-status',
  globalRecsPerTheme: 'analytics:global:recs-per-theme',
  globalProgressCadence: 'analytics:global:progress-cadence',
  globalSourceTimeline: 'analytics:global:source-timeline',
  sourceRecsPerStatus: (id: string) => `analytics:source:${id}:recs-per-status`,
  sourceProgressCadence: (id: string) => `analytics:source:${id}:progress-cadence`,
};

export const ANALYTICS_KEYS = KEY;

export async function getGlobalRecsPerStatus(
  ctx: RepoContext,
): Promise<RecsPerStatusRow[]> {
  return getOrCompute<RecsPerStatusRow[]>(ctx, KEY.globalRecsPerStatus, () =>
    recsPerStatus(ctx),
  );
}

export async function getGlobalRecsPerTheme(
  ctx: RepoContext,
): Promise<RecsPerThemeRow[]> {
  return getOrCompute<RecsPerThemeRow[]>(ctx, KEY.globalRecsPerTheme, () =>
    recsPerThematicArea(ctx),
  );
}

export async function getGlobalProgressCadence(
  ctx: RepoContext,
): Promise<MonthlyCountRow[]> {
  return getOrCompute<MonthlyCountRow[]>(ctx, KEY.globalProgressCadence, () =>
    progressCadence(ctx),
  );
}

export async function getGlobalSourceTimeline(
  ctx: RepoContext,
): Promise<MonthlyCountRow[]> {
  return getOrCompute<MonthlyCountRow[]>(ctx, KEY.globalSourceTimeline, () =>
    sourcePublicationTimeline(ctx),
  );
}

export async function getSourceRecsPerStatus(
  ctx: RepoContext,
  sourceId: string,
): Promise<RecsPerStatusRow[]> {
  return getOrCompute<RecsPerStatusRow[]>(ctx, KEY.sourceRecsPerStatus(sourceId), () =>
    recsPerStatus(ctx, { sourceId }),
  );
}

export async function getSourceProgressCadence(
  ctx: RepoContext,
  sourceId: string,
): Promise<MonthlyCountRow[]> {
  return getOrCompute<MonthlyCountRow[]>(ctx, KEY.sourceProgressCadence(sourceId), () =>
    progressCadence(ctx, { sourceId }),
  );
}

export type ComputeAllResult = {
  wrote: number;
  errored: Array<{ key: string; error: string }>;
};

/**
 * Compute every cache key — global plus per-source — and stamp `computed_at`
 * fresh. The cron handler calls this with a system ctx. Partial failures
 * are collected into `errored` rather than thrown, so one broken aggregate
 * doesn't tank the rest of the refresh run.
 */
export async function computeAll(ctx: RepoContext): Promise<ComputeAllResult> {
  const errored: ComputeAllResult['errored'] = [];
  let wrote = 0;

  const runners: Array<{ key: string; compute: () => Promise<unknown> }> = [
    { key: KEY.globalRecsPerStatus, compute: () => recsPerStatus(ctx) },
    { key: KEY.globalRecsPerTheme, compute: () => recsPerThematicArea(ctx) },
    { key: KEY.globalProgressCadence, compute: () => progressCadence(ctx) },
    { key: KEY.globalSourceTimeline, compute: () => sourcePublicationTimeline(ctx) },
  ];

  // Per-source variants. Lookup is via the standard auth filter, so a
  // system-ctx caller covers every source; a narrower ctx covers only what
  // it can see (useful for tests).
  const sourceRows = await ctx.db
    .select({ id: sources.id })
    .from(sources);
  for (const { id } of sourceRows) {
    runners.push({
      key: KEY.sourceRecsPerStatus(id),
      compute: () => recsPerStatus(ctx, { sourceId: id }),
    });
    runners.push({
      key: KEY.sourceProgressCadence(id),
      compute: () => progressCadence(ctx, { sourceId: id }),
    });
  }

  for (const { key, compute } of runners) {
    try {
      const value = await compute();
      await setCached(ctx, key, value);
      wrote += 1;
    } catch (err) {
      errored.push({ key, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { wrote, errored };
}
