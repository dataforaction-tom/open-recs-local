/**
 * Playwright globalSetup for `hosted-mode.spec.ts`. Mirrors `local-setup.ts`
 * but with hosted-mode-specific env: APP_MODE=hosted, a real
 * BETTER_AUTH_SECRET, EMAIL_PROVIDER=console (so password reset / magic
 * link calls don't crash without RESEND_API_KEY), and a separate port so a
 * local-mode dev server doesn't collide.
 *
 * No Ollama probe — the hosted spec doesn't exercise /chat.
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import {
  E2E_STATE_FILE,
  provisionDatabase,
  reserveStorageDir,
  spawnTracked,
  waitForServer,
  writeState,
  type E2eState,
} from './lifecycle';

const PORT = Number(process.env.E2E_PORT ?? 3101);
const BASE_URL = `http://localhost:${PORT}`;

export default async function globalSetup(): Promise<void> {
  console.log('[e2e:hosted-setup] provisioning Postgres + applying migrations + seeding taxonomy…');
  const db = await provisionDatabase();

  console.log('[e2e:hosted-setup] allocating storage dir…');
  const storageDir = await reserveStorageDir();

  // 32 random hex chars = 64 chars; satisfies BETTER_AUTH_SECRET min(32).
  const betterAuthSecret = randomBytes(32).toString('hex');

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    APP_MODE: 'hosted',
    DATABASE_URL: db.url,
    PORT: String(PORT),
    BETTER_AUTH_SECRET: betterAuthSecret,
    BETTER_AUTH_URL: BASE_URL,
    FILE_TOKEN_SECRET: 'e2e-hosted-deterministic-secret-32+chars',
    PROVIDER_SECRET_KEY: 'e2e-hosted-deterministic-provider-secret-32+chars',
    LLM_PROVIDER: 'fake',
    EMBEDDING_PROVIDER: 'fake',
    OCR_PROVIDER: 'fake',
    STORAGE_PROVIDER: 'fs',
    STORAGE_FS_PATH: storageDir,
    EMAIL_PROVIDER: 'console',
    FIXTURES_DIR: path.resolve(process.cwd(), 'fixtures/sources'),
  };

  console.log('[e2e:hosted-setup] starting worker…');
  const worker = spawnTracked('worker', 'pnpm', ['worker'], env);

  console.log(`[e2e:hosted-setup] starting Next dev on port ${PORT}…`);
  const dev = spawnTracked('dev', 'pnpm', ['dev'], env);

  if (!worker.pid || !dev.pid) {
    throw new Error('[e2e:hosted-setup] failed to spawn worker / dev (no PID)');
  }

  console.log(`[e2e:hosted-setup] waiting for ${BASE_URL}…`);
  await waitForServer(BASE_URL);

  const state: E2eState = {
    devPid: dev.pid,
    workerPid: worker.pid,
    containerId: db.containerId,
    storageDir,
    ollamaReachable: false,
    baseURL: BASE_URL,
  };
  await writeState(state);
  console.log(`[e2e:hosted-setup] state written to ${E2E_STATE_FILE}`);

  process.env.PLAYWRIGHT_BASE_URL = BASE_URL;
}
