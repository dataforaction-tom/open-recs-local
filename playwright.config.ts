import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the E2E suite that lives in `tests/e2e/**\/*.spec.ts`.
 *
 * - Vitest owns `*.test.ts` / `*.test.tsx` (see vitest.config.mts). Playwright
 *   uses `*.spec.ts` so the runners never see each other's files.
 * - We don't use Playwright's `webServer` config: the dev server's
 *   DATABASE_URL is bound to a Testcontainers port only known at runtime,
 *   and `webServer.env` is resolved before globalSetup. Instead globalSetup
 *   spawns the dev server + worker itself and globalTeardown kills them.
 * - baseURL is read from `PLAYWRIGHT_BASE_URL` at runtime (set by
 *   globalSetup) so the spec uses whatever port the lifecycle reserved.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './tests/e2e/local-setup.ts',
  globalTeardown: './tests/e2e/local-teardown.ts',
  timeout: 120_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
