import type { JobContext } from '../context';
import { parseHandler } from './parse';
import { extractHandler } from './extract';
import { embedHandler } from './embed';

/**
 * Wires the three pipeline queues to their handlers. Each handler closes
 * over the shared `JobContext` so business code can stay payload-focused.
 *
 * This is the single place that decides which queues the worker serves — if
 * a queue is missing here it will throw at enqueue time thanks to pg-boss's
 * "queue must exist" rule.
 */
export async function registerHandlers(ctx: JobContext): Promise<void> {
  await ctx.queue.register('source.parse', (payload) => parseHandler(ctx, payload));
  await ctx.queue.register('source.extract', (payload) => extractHandler(ctx, payload));
  await ctx.queue.register('source.embed', (payload) => embedHandler(ctx, payload));
}
