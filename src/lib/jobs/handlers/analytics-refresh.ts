import type { JobContext } from '../context';
import { computeAll } from '@/lib/services/analytics';
import type { RepoContext } from '@/lib/repositories/types';

/**
 * `analytics.refresh` handler.
 *
 * Recomputes every `analytics_cache` row under a system context so the
 * aggregates capture private sources too. Errors per cache key are
 * surfaced via the service's `errored[]` collector rather than thrown —
 * one bad aggregate shouldn't tank the whole nightly run.
 *
 * No payload: pg-boss schedules an empty `{}` body, which we ignore.
 */
export async function analyticsRefreshHandler(
  ctx: JobContext,
): Promise<{ wrote: number; errored: number }> {
  const repoCtx: RepoContext = {
    db: ctx.db,
    auth: { user: { id: 'system' }, roles: ['admin'], isSystem: true },
  };
  const result = await computeAll(repoCtx);
  if (result.errored.length > 0) {
    console.warn(
      `[analytics.refresh] ${result.errored.length} key(s) errored:`,
      result.errored,
    );
  }
  console.log(
    `[analytics.refresh] wrote ${result.wrote} cache rows; ${result.errored.length} errors`,
  );
  return { wrote: result.wrote, errored: result.errored.length };
}
