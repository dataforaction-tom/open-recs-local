/**
 * Playwright globalSetup for `local-mode.spec.ts`.
 *
 * - Boots Testcontainers Postgres + applies migrations + seeds taxonomy.
 * - Allocates a temp dir for the `fs` storage adapter.
 * - Probes the configured Ollama endpoint; if reachable, wires CHAT_* env so
 *   the chat-search route streams real tokens. If not (typical for laptop
 *   runs without Ollama running), CHAT_* stays unset and the spec asserts
 *   the friendly 503 path instead.
 * - Spawns `pnpm worker` and `pnpm dev` as tracked child processes pointing
 *   at the new database.
 * - Waits for the dev server to be reachable.
 * - Writes `.e2e-state.json` for the spec (to read `ollamaReachable`) and
 *   for teardown (PIDs + container id + storage dir).
 */
import path from 'node:path';
import {
  E2E_STATE_FILE,
  probeChatEndpoint,
  provisionDatabase,
  reserveStorageDir,
  spawnTracked,
  waitForServer,
  writeState,
  type E2eState,
} from './lifecycle';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
const CHAT_MODEL = process.env.E2E_CHAT_MODEL ?? 'qwen2.5:0.5b';

export default async function globalSetup(): Promise<void> {
  console.log('[e2e:local-setup] provisioning Postgres + applying migrations + seeding taxonomy…');
  const db = await provisionDatabase();

  console.log('[e2e:local-setup] allocating storage dir…');
  const storageDir = await reserveStorageDir();

  console.log(`[e2e:local-setup] probing Ollama at ${OLLAMA_BASE_URL} for model ${CHAT_MODEL}…`);
  const ollamaReachable = await probeChatEndpoint(OLLAMA_BASE_URL, CHAT_MODEL);
  console.log(`[e2e:local-setup] Ollama+model reachable: ${ollamaReachable}`);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    APP_MODE: 'local',
    DATABASE_URL: db.url,
    PORT: String(PORT),
    LLM_PROVIDER: 'fake',
    EMBEDDING_PROVIDER: 'fake',
    OCR_PROVIDER: 'fake',
    STORAGE_PROVIDER: 'fs',
    STORAGE_FS_PATH: storageDir,
    FILE_TOKEN_SECRET: 'e2e-local-deterministic-secret-32+chars',
    FIXTURES_DIR: path.resolve(process.cwd(), 'fixtures/sources'),
  };
  if (ollamaReachable) {
    env.CHAT_PROVIDER = 'openai-compatible';
    env.CHAT_BASE_URL = OLLAMA_BASE_URL;
    env.CHAT_MODEL = CHAT_MODEL;
  }

  console.log('[e2e:local-setup] starting worker…');
  const worker = spawnTracked('worker', 'pnpm', ['worker'], env);

  console.log(`[e2e:local-setup] starting Next dev on port ${PORT}…`);
  const dev = spawnTracked('dev', 'pnpm', ['dev'], env);

  if (!worker.pid || !dev.pid) {
    throw new Error('[e2e:local-setup] failed to spawn worker / dev (no PID)');
  }

  console.log(`[e2e:local-setup] waiting for ${BASE_URL}…`);
  await waitForServer(BASE_URL);

  const state: E2eState = {
    devPid: dev.pid,
    workerPid: worker.pid,
    containerId: db.containerId,
    storageDir,
    ollamaReachable,
    baseURL: BASE_URL,
  };
  await writeState(state);
  console.log(`[e2e:local-setup] state written to ${E2E_STATE_FILE}`);

  // Surface baseURL for `use.baseURL` in the config (read at runtime per
  // test via process.env, so this affects spawned worker processes too).
  process.env.PLAYWRIGHT_BASE_URL = BASE_URL;
}
