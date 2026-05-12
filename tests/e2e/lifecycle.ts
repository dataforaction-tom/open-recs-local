/**
 * Shared lifecycle helpers for the Playwright E2E suite.
 *
 * We deliberately do NOT use Playwright's `webServer` config. The dev server
 * needs DATABASE_URL bound to a Testcontainers port that's only known at
 * runtime, and Playwright resolves `webServer.env` at config-load time
 * (before globalSetup runs). Managing the dev server + worker as child
 * processes inside globalSetup is the unambiguous path: we know the exact
 * env each process gets, and teardown can kill them by recorded PID.
 *
 * State file (`E2E_STATE_FILE`) shape: `{ devPid, workerPid, containerId,
 * storageDir, ollamaReachable, baseURL }`. Written by globalSetup, read by
 * the spec (for the Ollama probe result) and by globalTeardown.
 */
import { spawn, type ChildProcess, exec } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { startPostgres } from '../helpers/pg-container';
import { applyMigrations } from '../helpers/migrate';
import { seedTaxonomy } from '@/lib/db/seed-taxonomy';
import { createDb } from '@/lib/db/client';

const execAsync = promisify(exec);

export const E2E_STATE_FILE = path.resolve(process.cwd(), '.e2e-state.json');

export type E2eState = {
  devPid: number;
  workerPid: number;
  containerId: string;
  storageDir: string;
  ollamaReachable: boolean;
  baseURL: string;
};

export type ProvisionedDb = {
  url: string;
  containerId: string;
};

/**
 * Boot Postgres, apply migrations, seed taxonomy. Returns the connection URL
 * and container id (for teardown). Throws on any step.
 */
export async function provisionDatabase(): Promise<ProvisionedDb> {
  const pg = await startPostgres();
  const { sql } = await applyMigrations(pg.url);
  await sql.end();
  const client = createDb(pg.url);
  await seedTaxonomy(client.db);
  await client.sql.end();
  return { url: pg.url, containerId: pg.container.getId() };
}

/**
 * Check whether an OpenAI-compatible server answers at `baseURL` AND serves
 * the requested `model` id. We probe `<base>/models` (the OpenAI list-models
 * route) with a short timeout so unreachable hosts don't stall globalSetup.
 * Requiring the model to be present (not just the server) prevents the spec
 * from running the chat-reply branch with a model id that 404s mid-stream.
 */
export async function probeChatEndpoint(
  baseURL: string,
  model: string,
  timeoutMs = 1500,
): Promise<boolean> {
  const url = baseURL.replace(/\/$/, '') + '/models';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return false;
    const body = (await res.json()) as { data?: Array<{ id?: string }> };
    return Array.isArray(body.data) && body.data.some((m) => m.id === model);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Spawn a long-running command with the given env, inheriting stdout/stderr
 * with a prefix so dev/worker output is visible during test development.
 */
export function spawnTracked(
  label: string,
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): ChildProcess {
  // `stdio: ['pipe', 'pipe', 'pipe']` deliberately. The worker treats
  // stdin-end as a graceful-shutdown cue (Windows lacks SIGTERM); using
  // 'ignore' attaches a /dev/null-backed stdin that fires 'end' immediately
  // and the worker exits before processing any job. Keeping a real pipe
  // open — and never closing it — gives the child an empty-but-open stdin.
  const child = spawn(command, args, {
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk: Buffer) => {
    process.stdout.write(`[${label}] ${chunk.toString()}`);
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(`[${label}] ${chunk.toString()}`);
  });
  return child;
}

/**
 * Poll `${baseURL}` until it returns any HTTP response (even 4xx/5xx — the
 * point is that the server is listening). Throws on timeout.
 */
export async function waitForServer(baseURL: string, timeoutMs = 90_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseURL, { signal: AbortSignal.timeout(2000) });
      if (res.status < 600) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`waitForServer: ${baseURL} not reachable within ${timeoutMs}ms`);
}

/**
 * Allocate a fresh temp directory for the fs storage adapter. Caller is
 * responsible for cleanup via {@link releaseStorageDir}.
 */
export async function reserveStorageDir(): Promise<string> {
  return await mkdtemp(path.join(tmpdir(), 'open-recs-e2e-'));
}

export async function releaseStorageDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export async function writeState(state: E2eState): Promise<void> {
  await writeFile(E2E_STATE_FILE, JSON.stringify(state, null, 2));
}

export async function readState(): Promise<E2eState | null> {
  try {
    const raw = await readFile(E2E_STATE_FILE, 'utf8');
    return JSON.parse(raw) as E2eState;
  } catch {
    return null;
  }
}

export async function clearState(): Promise<void> {
  await rm(E2E_STATE_FILE, { force: true });
}

/**
 * Kill a process by PID, tolerating "already gone".
 */
export function killByPid(pid: number, signal: NodeJS.Signals = 'SIGTERM'): void {
  try {
    process.kill(pid, signal);
  } catch {
    // already dead / never spawned — both are fine for teardown
  }
}

/**
 * Stop a Testcontainers-managed container by id. We shell out to `docker`
 * because we don't have the JS handle anymore — it was created in
 * globalSetup which exited cleanly. The container is still running because
 * Testcontainers' Ryuk sidecar would only clean up on a hard process exit.
 */
export async function stopContainer(id: string): Promise<void> {
  if (!id) return;
  try {
    await execAsync(`docker stop ${id}`, { timeout: 30_000 });
  } catch {
    // best effort — Ryuk will eventually reap if docker stop fails
  }
}
