import { spawn } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from './helpers/pg-container';

/**
 * Boots `src/worker.ts` via `tsx` in a child process pointed at a throwaway
 * Testcontainers Postgres, waits for the "[worker] ready" line on stdout,
 * then signals shutdown and asserts a clean exit.
 *
 * Windows note: `child.kill(signal)` on Windows unconditionally terminates
 * the process and never fires our SIGINT/SIGTERM handlers. We instead trigger
 * graceful shutdown by closing stdin — the worker listens for stdin 'end'
 * and runs the same shutdown path. On POSIX we use SIGINT directly.
 */

const repoRoot = path.resolve(__dirname, '..');
const workerEntry = path.join(repoRoot, 'src', 'worker.ts');
// Invoke tsx's JS CLI directly via `node` rather than the `.bin/tsx.cmd`
// shell shim. On Windows, `spawn` of a .cmd requires `shell: true`, which
// wraps the child in cmd.exe — and `child.kill('SIGINT')` then terminates
// the shell, never reaching the worker's signal handler.
const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');

let pg: StartedPg;

describe('worker smoke', () => {
  beforeAll(async () => {
    pg = await startPostgres();
  }, 120_000);

  afterAll(async () => {
    await pg?.container.stop();
  });

  it(
    'boots, signals ready, shuts down cleanly on SIGINT',
    async () => {
      const child = spawn(process.execPath, [tsxCli, workerEntry], {
        cwd: repoRoot,
        env: {
          ...process.env,
          APP_MODE: 'local',
          DATABASE_URL: pg.url,
          LLM_PROVIDER: 'fake',
          EMBEDDING_PROVIDER: 'fake',
          OCR_PROVIDER: 'fake',
          STORAGE_PROVIDER: 'fake',
        },
        // stdin is piped so we can close it to trigger graceful shutdown
        // (portable alternative to POSIX signals on Windows).
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      const ready = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`worker never signalled ready. stdout=${stdout} stderr=${stderr}`));
        }, 20_000);
        const check = setInterval(() => {
          if (stdout.includes('[worker] ready')) {
            clearInterval(check);
            clearTimeout(timer);
            resolve();
          }
        }, 100);
        child.on('exit', (code) => {
          clearInterval(check);
          clearTimeout(timer);
          reject(new Error(`worker exited before ready (code=${code}). stderr=${stderr}`));
        });
      });

      await ready;

      const exited = new Promise<number | null>((resolve) => {
        child.once('exit', (code) => resolve(code));
      });

      if (process.platform === 'win32') {
        // Close stdin → worker's 'end' handler runs shutdown().
        child.stdin?.end();
      } else {
        child.kill('SIGINT');
      }

      const exitCode = await Promise.race([
        exited,
        new Promise<number | null>((_, reject) =>
          setTimeout(() => reject(new Error('worker did not exit after SIGINT')), 10_000),
        ),
      ]);

      expect(exitCode).toBe(0);
    },
    30_000,
  );
});
