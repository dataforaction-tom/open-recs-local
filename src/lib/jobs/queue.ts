import { PgBoss } from 'pg-boss';
import postgres, { type Sql } from 'postgres';
import type { QueueName, QueuePayloads } from './types';

/**
 * Thin typed wrapper over pg-boss v12. Responsibilities:
 *  - Own the pg-boss lifecycle (start, createQueue, stop).
 *  - Present a compile-time-typed enqueue/register API keyed by `QueueName`.
 *  - Provide `waitForResult` + `rawQuery` helpers intended for tests only.
 *
 * Notes on pg-boss v12:
 *  - `boss.work(name, handler)` passes an array of `Job<T>` to the handler
 *    (batching is part of the v12 API). We unwrap `job.data` and forward a
 *    single-payload handler to callers — matching the shape declared in the
 *    plan test. The return value becomes the job's `output` column.
 *  - `boss.createQueue(name)` must be called before `send` for unknown queues;
 *    pg-boss v12 no longer auto-creates queues on first send.
 */

export type QueueOptions = {
  connectionString: string;
};

export type QueueHandler<Q extends QueueName, R = unknown> = (
  payload: QueuePayloads[Q],
) => Promise<R>;

export type Queue = {
  enqueue: <Q extends QueueName>(queue: Q, payload: QueuePayloads[Q]) => Promise<string>;
  register: <Q extends QueueName, R = unknown>(
    queue: Q,
    handler: QueueHandler<Q, R>,
  ) => Promise<void>;
  /**
   * Test-only: poll `pgboss.job` until the job completes or times out. Resolves
   * with the stored `output` (whatever the handler returned) on success,
   * rejects on `failed` state or timeout.
   */
  waitForResult: <R = unknown>(jobId: string, timeoutMs: number) => Promise<R>;
  /**
   * Test-only escape hatch for introspecting the pgboss schema. Do not use
   * from application code — go through repositories instead.
   */
  rawQuery: (sql: string) => Promise<Array<Record<string, unknown>>>;
  stop: () => Promise<void>;
};

export async function createQueue(options: QueueOptions): Promise<Queue> {
  const boss = new PgBoss(options.connectionString);

  // pg-boss emits 'error' for transient issues; swallow to avoid crashing
  // the test runner when the container is torn down mid-flight.
  boss.on('error', () => {});

  await boss.start();

  // Separate postgres connection for raw introspection + waitForResult polling.
  // pg-boss uses node-postgres internally; we stay on `postgres` (porsager) to
  // match the rest of the app and keep lifecycles explicit.
  const sql: Sql = postgres(options.connectionString, { max: 2, prepare: false });

  // Track queues we've ensured exist to avoid repeated createQueue round-trips.
  const ensured = new Set<QueueName>();
  const ensureQueue = async (name: QueueName): Promise<void> => {
    if (ensured.has(name)) return;
    await boss.createQueue(name);
    ensured.add(name);
  };

  const enqueue: Queue['enqueue'] = async (queue, payload) => {
    await ensureQueue(queue);
    const jobId = await boss.send(queue, payload as unknown as object);
    if (!jobId) {
      throw new Error(`pg-boss rejected job for queue "${queue}" (throttled or debounced)`);
    }
    return jobId;
  };

  const register: Queue['register'] = async (queue, handler) => {
    await ensureQueue(queue);
    await boss.work(queue, async (jobs) => {
      // Default work batchSize is 1, but pg-boss still hands us an array.
      // Forward each job's data through the caller's single-payload handler.
      // Returning the last result matches single-job semantics; for batches
      // larger than 1 pg-boss will store the last return value as `output`.
      let lastResult: unknown;
      for (const job of jobs) {
        lastResult = await handler(job.data as QueuePayloads[typeof queue]);
      }
      return lastResult;
    });
  };

  const waitForResult: Queue['waitForResult'] = async <R>(jobId: string, timeoutMs: number) => {
    const deadline = Date.now() + timeoutMs;
    // Tight-ish poll: 100ms is well under pg-boss's default 2s work-polling
    // interval, so we'll mostly be waiting on the worker tick, not on us.
    const pollIntervalMs = 100;
    while (Date.now() < deadline) {
      const rows = await sql<Array<{ state: string; output: unknown }>>`
        select state, output from pgboss.job where id = ${jobId}
      `;
      const row = rows[0];
      if (row) {
        if (row.state === 'completed') return row.output as R;
        if (row.state === 'failed' || row.state === 'cancelled') {
          throw new Error(`job ${jobId} ended in state "${row.state}": ${JSON.stringify(row.output)}`);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new Error(`timed out waiting for job ${jobId} after ${timeoutMs}ms`);
  };

  const rawQuery: Queue['rawQuery'] = async (query) => {
    // postgres.unsafe lets us run an arbitrary string — acceptable here
    // because this helper is test-only and the input is author-controlled.
    const rows = await sql.unsafe(query);
    return rows as unknown as Array<Record<string, unknown>>;
  };

  const stop: Queue['stop'] = async () => {
    try {
      await boss.stop({ graceful: false, close: true });
    } finally {
      await sql.end({ timeout: 5 });
    }
  };

  return { enqueue, register, waitForResult, rawQuery, stop };
}
