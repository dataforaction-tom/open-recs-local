import type { Sql } from 'postgres';
import { loadEnv } from '@/lib/env';
import { createDb } from '@/lib/db/client';
import { listenForProviderSettingsChanges } from '@/lib/providers/config';
import { emitJobEvent } from '@/lib/jobs/events';
import { createQueue, type Queue } from '@/lib/jobs/queue';
import { registerHandlers } from '@/lib/jobs/handlers';

// Wrapped in `main()` because tsx transforms this file under the CJS output
// path on Windows (the package is not `"type": "module"`), and CJS does not
// permit top-level await.
async function main(): Promise<void> {
  let sql: Sql | undefined;
  let queue: Queue | undefined;
  let unlisten: (() => Promise<void>) | undefined;
  let shuttingDown = false;

  try {
    const env = loadEnv();
    const dbContext = createDb(env.DATABASE_URL);
    sql = dbContext.sql;
    queue = await createQueue({ connectionString: env.DATABASE_URL });

    // Invalidate the in-process provider cache the moment a provider setting
    // changes, so DB-config edits take effect on the next job without a restart.
    ({ unlisten } = await listenForProviderSettingsChanges(sql));

    // Attach signal handlers BEFORE registerHandlers so that a slow
    // registerHandlers (likely in Task 5+) can still be interrupted cleanly.
    // queue is already built at this point, so shutdown() can drain it.
    const shutdown = async (reason: string): Promise<void> => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[worker] ${reason} — draining`);
      await unlisten?.().catch(() => {});
      await queue?.stop().catch(() => {});
      await sql?.end({ timeout: 5 }).catch(() => {});
      process.exit(0);
    };
    process.on('SIGTERM', () => {
      void shutdown('SIGTERM');
    });
    process.on('SIGINT', () => {
      void shutdown('SIGINT');
    });

    // Windows note: child_process `subprocess.kill('SIGINT')` unconditionally
    // terminates the target on Windows — there is no graceful-shutdown signal.
    // To keep the worker testable and to support supervisors that close stdin
    // as a shutdown cue, we also treat stdin 'end' as a shutdown trigger.
    // In production the stdin is either inherited from a TTY (never closes)
    // or /dev/null-equivalent (also never emits 'end'), so this is inert
    // outside of test harnesses.
    if (process.stdin.readable) {
      process.stdin.resume();
      process.stdin.once('end', () => {
        void shutdown('stdin-end');
      });
    }

    // pg_notify-backed event sink. Uses the worker's long-lived `sql` client;
    // subscribers (SSE route) open their own connection — LISTEN is
    // connection-scoped.
    const boundSql = sql;
    const emit = (jobId: string, event: Parameters<typeof emitJobEvent>[2]): Promise<void> =>
      emitJobEvent(boundSql, jobId, event);
    await registerHandlers({ queue, db: dbContext.db, env, emit });

    console.log('[worker] ready');
  } catch (err) {
    // Partial-init cleanup: best-effort close whatever was built before the
    // throw. Swallow close errors so the original failure is what bubbles.
    await queue?.stop().catch(() => {});
    await sql?.end({ timeout: 5 }).catch(() => {});
    throw err;
  }
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
