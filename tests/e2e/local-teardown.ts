/**
 * Playwright globalTeardown for `local-mode.spec.ts`. Reverses globalSetup
 * idempotently — every step swallows errors so a partial setup still
 * tears down cleanly.
 */
import {
  clearState,
  killByPid,
  readState,
  releaseStorageDir,
  stopContainer,
} from './lifecycle';

export default async function globalTeardown(): Promise<void> {
  const state = await readState();
  if (!state) {
    console.log('[e2e:local-teardown] no state file — nothing to tear down');
    return;
  }
  console.log('[e2e:local-teardown] stopping dev + worker…');
  killByPid(state.devPid);
  killByPid(state.workerPid);
  // Give the child processes a beat to exit before yanking the database.
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log('[e2e:local-teardown] stopping Postgres container…');
  await stopContainer(state.containerId);
  console.log('[e2e:local-teardown] cleaning storage dir…');
  await releaseStorageDir(state.storageDir);
  await clearState();
  console.log('[e2e:local-teardown] done');
}
