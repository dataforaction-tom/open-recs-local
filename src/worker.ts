import type { Sql } from 'postgres';
import { loadEnv } from '@/lib/env';
import { createDb } from '@/lib/db/client';
import { createProviders } from '@/lib/providers';
import { createQueue, type Queue } from '@/lib/jobs/queue';
import { registerHandlers } from '@/lib/jobs/handlers';

// Wrapped in `main()` because tsx transforms this file under the CJS output
// path on Windows (the package is not `"type": "module"`), and CJS does not
// permit top-level await.
async function main(): Promise<void> {
  let sql: Sql | undefined;
  let queue: Queue | undefined;
  let shuttingDown = false;

  try {
    const env = loadEnv();
    const dbContext = createDb(env.DATABASE_URL);
    sql = dbContext.sql;
    const providers = createProviders(env);
    queue = await createQueue({ connectionString: env.DATABASE_URL });

    // Attach signal handlers BEFORE registerHandlers so that a slow
    // registerHandlers (likely in Task 5+) can still be interrupted cleanly.
    // queue is already built at this point, so shutdown() can drain it.
    const shutdown = async (reason: string): Promise<void> => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log(`[worker] ${reason} — draining`);
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

    // TODO(Task 6): replace this no-op `emit` with the real pg_notify-backed
    // emitter defined in `src/lib/jobs/events.ts`. Kept inline for now so the
    // worker type-checks against the `JobContext` shape introduced in Task 5.
    const emit = async (): Promise<void> => {};
    await registerHandlers({ queue, db: dbContext.db, providers, env, emit });

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
