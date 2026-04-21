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
  'test.echo': { msg: string };
};

export type QueueName = keyof QueuePayloads;
