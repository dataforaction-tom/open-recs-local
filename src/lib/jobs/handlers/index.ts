import { getProviders } from '../../providers/config';
import type { JobContext, JobDeps } from '../context';
import { parseHandler } from './parse';
import { extractHandler } from './extract';
import { embedHandler } from './embed';
import { analyticsRefreshHandler } from './analytics-refresh';

/**
 * Wires the queue handlers and any cron schedules. Providers are resolved
 * **per job** (not once at boot) so DB-backed provider settings take effect
 * without a worker restart — each invocation rebuilds the handler-facing
 * `JobContext` with freshly-resolved providers (cached in-process by
 * `getProviders`, invalidated immediately on NOTIFY).
 *
 * This is the single place that decides which queues the worker serves — if
 * a queue is missing here it will throw at enqueue time thanks to pg-boss's
 * "queue must exist" rule.
 *
 * Scheduled jobs: `analytics.refresh` runs at 02:00 server time daily.
 * pg-boss's schedule API is idempotent on (queue, key) so calling it on
 * every worker boot is safe — the cron monitor inside pg-boss promotes
 * the scheduled row into a runnable job when the time comes.
 */
export async function registerHandlers(deps: JobDeps): Promise<void> {
  const resolve = deps.resolveProviders ?? getProviders;
  const withProviders = async (): Promise<JobContext> => {
    const providers = await resolve(deps.db, deps.env);
    return { ...deps, providers };
  };

  await deps.queue.register('source.parse', async (payload) =>
    parseHandler(await withProviders(), payload),
  );
  await deps.queue.register('source.extract', async (payload) =>
    extractHandler(await withProviders(), payload),
  );
  await deps.queue.register('source.embed', async (payload) =>
    embedHandler(await withProviders(), payload),
  );
  await deps.queue.register('analytics.refresh', async () =>
    analyticsRefreshHandler(await withProviders()),
  );
  await deps.queue.schedule('analytics.refresh', '0 2 * * *');
}
