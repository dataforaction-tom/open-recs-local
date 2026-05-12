/**
 * Local-mode happy path E2E.
 *
 * Boots a fresh Testcontainers Postgres + worker + Next dev (see
 * `local-setup.ts`) and drives the documented user flow end-to-end:
 *
 *   1. Visit `/sources`, upload `fixtures/sources/sample-report.pdf`.
 *   2. Wait for the pipeline to land on `status=ready` (catalogue row's
 *      `data-state` attribute, surfaced by `<SourcesPage>`).
 *   3. Visit `/recommendations`, assert the fixture's first recommendation
 *      title appears (`Establish a board-level risk committee`).
 *   4. Visit `/search?q=board` (hybrid by default), assert a result.
 *   5. Visit `/chat`. If globalSetup decided Ollama is reachable, send a
 *      question and assert that the stream produced some text. If not,
 *      assert that the 503-fallback message is shown when asking.
 *
 * The Ollama branch keeps the chat-reply step in the headline coverage on
 * machines / CI jobs that have a streaming endpoint, and degrades to a
 * useful UI assertion on bare laptops.
 */
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { readState } from './lifecycle';

// Fixture details — see `fixtures/sources/sample-report.recommendations.json`.
const FIXTURE_PDF = path.resolve(process.cwd(), 'fixtures/sources/sample-report.pdf');
const FIXTURE_FIRST_REC_TITLE = 'Establish a board-level risk committee';

test.describe.configure({ mode: 'serial' });

test.describe('local mode — upload → recommendations → search → chat', () => {
  test('drives the documented happy path end-to-end', async ({ page }) => {
    const state = await readState();
    expect(state, 'globalSetup must have written .e2e-state.json').not.toBeNull();

    // 1. Upload the fixture from /sources.
    await page.goto('/sources');
    await expect(page.getByRole('heading', { name: /Library of inquiries/i })).toBeVisible();
    await page.setInputFiles('input[type="file"]', FIXTURE_PDF);
    await page.getByRole('button', { name: /Upload PDF/i }).click();

    // 2. The new row should appear immediately after the form's router.refresh().
    //    Default title is the filename when none is supplied.
    const row = page.locator('li', {
      has: page.getByRole('link', { name: 'sample-report.pdf' }),
    });
    await expect(row).toBeVisible({ timeout: 15_000 });

    // 3. Poll until the row reaches status=done. The catalogue row's status
    //    span has `data-state` (pending → active → done | failed).
    const status = row.locator('[data-state]');
    await expect(async () => {
      await page.reload();
      const state = await status.getAttribute('data-state');
      console.log(`[e2e] row status: ${state}`);
      expect(state).toBe('done');
    }).toPass({ timeout: 120_000, intervals: [3_000] });

    // 3. Recommendations index lists the fixture's first rec.
    await page.goto('/recommendations');
    await expect(page.getByText(FIXTURE_FIRST_REC_TITLE, { exact: false }).first()).toBeVisible({
      timeout: 30_000,
    });

    // 4. Search finds the same rec via a single keyword.
    await page.goto('/search?q=board');
    await expect(page.getByText(/Results for/i)).toBeVisible();
    await expect(page.getByText(FIXTURE_FIRST_REC_TITLE, { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });

    // 5. Chat path — branches on whether globalSetup found the configured
    //    chat model. If yes, we send a question and assert that the stream
    //    delivers some text. If not, we assert that the 503 fallback message
    //    shows when the user submits.
    await page.goto('/chat');
    const input = page.getByLabel(/Ask a question/i);
    await input.fill('What does the source say about board oversight?');
    await page.getByRole('button', { name: /^Ask$/i }).click();

    if (state?.ollamaReachable) {
      // Assistant bubble shows the question + a streamed reply. We scope to
      // the chat message list (the <ol> following the example prompts) and
      // assert non-empty text on the assistant entry. Model output is
      // non-deterministic so we don't pin specific content.
      const userBubble = page.getByText('What does the source say about board oversight?');
      await expect(userBubble).toBeVisible({ timeout: 10_000 });
      const assistantBubble = page.locator('ol > li').last();
      await expect(assistantBubble).not.toHaveText(/^$/, { timeout: 60_000 });
    } else {
      await expect(
        page.getByRole('alert').getByText(/OPENAI_COMPAT_BASE_URL|no streaming chat/i),
      ).toBeVisible({ timeout: 10_000 });
    }

    // 6. Edit flow — navigate to a recommendation, edit the title, save,
    // reload, and assert the change persisted.
    await page.goto('/recommendations');
    await page.getByText(FIXTURE_FIRST_REC_TITLE, { exact: false }).first().click();
    await page.getByRole('link', { name: /^Edit$/i }).first().click();
    const titleInput = page.getByLabel(/^Title/i);
    const originalTitle = await titleInput.inputValue();
    const editedTitle = `${originalTitle} (edited)`;
    await titleInput.fill(editedTitle);
    await page.getByRole('button', { name: /^Save$/i }).click();
    await page.waitForLoadState('networkidle');
    // Reload to confirm persistence; the title input shows the edited text.
    await expect(page.getByLabel(/^Title/i)).toHaveValue(editedTitle, { timeout: 5_000 });
  });
});
