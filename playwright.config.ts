import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the E2E suite that lives in `tests/e2e/**\/*.spec.ts`.
 *
 * - Vitest owns `*.test.ts` / `*.test.tsx` (see vitest.config.mts). Playwright
 *   uses `*.spec.ts` so the runners never see each other's files.
 * - `webServer` boots `pnpm dev` against whatever `DATABASE_URL` the spec
 *   set up (Postgres lifecycle lives in the specs themselves, not here).
 * - `PLAYWRIGHT_NO_WEBSERVER=1` skips the auto-boot for cases where the
 *   developer already has `pnpm dev` running. Useful in iteration.
 */
const PORT = Number(process.env.PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;
const skipWebServer = process.env.PLAYWRIGHT_NO_WEBSERVER === '1';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  ...(skipWebServer
    ? {}
    : {
        webServer: {
          command: 'pnpm dev',
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      }),
});
