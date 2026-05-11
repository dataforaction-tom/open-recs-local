import type { JobContext } from '../context';
import { parseHandler } from './parse';
import { extractHandler } from './extract';
import { embedHandler } from './embed';
import { analyticsRefreshHandler } from './analytics-refresh';

/**
 * Wires the queue handlers and any cron schedules. Each handler closes over
 * the shared `JobContext` so business code can stay payload-focused.
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
export async function registerHandlers(ctx: JobContext): Promise<void> {
  await ctx.queue.register('source.parse', (payload) => parseHandler(ctx, payload));
  await ctx.queue.register('source.extract', (payload) => extractHandler(ctx, payload));
  await ctx.queue.register('source.embed', (payload) => embedHandler(ctx, payload));
  await ctx.queue.register('analytics.refresh', () => analyticsRefreshHandler(ctx));
  await ctx.queue.schedule('analytics.refresh', '0 2 * * *');
}
