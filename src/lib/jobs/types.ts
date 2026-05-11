/**
 * Shared job queue types. Centralising these gives us compile-time safety
 * on every enqueue/register call site — the queue name and payload shape
 * are coupled through `QueuePayloads`.
 *
 * Real business queues (`source.*`) are declared here so other modules can
 * reference the names even before handlers are wired up. `test.echo` exists
 * purely for the queue-wrapper's own integration test.
 */
export type QueuePayloads = {
  'source.parse': { sourceId: string };
  'source.extract': { sourceId: string };
  'source.embed': { sourceId: string };
  // Phase 9 scheduled job: refresh the analytics_cache rows.
  // No payload — the handler walks every cache key.
  'analytics.refresh': Record<string, never>;
  'test.echo': { msg: string };
};

export type QueueName = keyof QueuePayloads;
