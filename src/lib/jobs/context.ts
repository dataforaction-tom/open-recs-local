import type { Queue } from './queue';
import type { Env } from '@/lib/env';
import type { Providers } from '@/lib/providers';
import type { Db } from '@/lib/db/client';

/**
 * Events emitted for a job's lifecycle. Consumers (SSE route in Task 6) fan
 * these out to the browser so progress UIs can react as handlers advance.
 *
 * Defined here rather than in a dedicated `events.ts` because Task 5 needs
 * the type to shape `JobContext.emit`, and Task 6's `events.ts` will import
 * from here — keeping a single source of truth and avoiding a circular
 * import between `context.ts` and `events.ts`.
 */
export type JobEvent =
  | { type: 'phase'; phase: 'parsing' | 'extracting' | 'embedding' | 'ready' | 'failed' }
  | { type: 'progress'; percent: number; message?: string }
  | { type: 'error'; message: string };

/**
 * Handler execution context. Created once in the worker entrypoint and
 * partially applied into each queue handler at registration time (see
 * `handlers/index.ts`). Handlers get exactly what they need; nothing is
 * pulled from module-level state.
 *
 * `emit` is intentionally required (no default no-op) so callers must
 * consciously decide what the event sink is. Task 6 replaces the worker's
 * temporary no-op with the real pg_notify-backed implementation.
 */
export type JobContext = {
  queue: Queue;
  db: Db;
  providers: Providers;
  env: Env;
  emit: (jobId: string, event: JobEvent) => Promise<void>;
};
