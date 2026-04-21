import { loadEnv } from '@/lib/env';
import { createDb } from '@/lib/db/client';
import { createProviders } from '@/lib/providers';
import { createQueue } from '@/lib/jobs/queue';
import { registerHandlers } from '@/lib/jobs/handlers';

// Wrapped in `main()` because tsx transforms this file under the CJS output
// path on Windows (the package is not `"type": "module"`), and CJS does not
// permit top-level await.
async function main(): Promise<void> {
  const env = loadEnv();
  const { db, sql } = createDb(env.DATABASE_URL);
  const providers = createProviders(env);
  const queue = await createQueue({ connectionString: env.DATABASE_URL });

  await registerHandlers({ queue, db, providers, env });

  console.log('[worker] ready');

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} — draining`);
    await queue.stop();
    await sql.end();
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
    process.stdin.on('end', () => {
      void shutdown('stdin-closed');
    });
    process.stdin.resume();
  }
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
