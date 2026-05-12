/**
 * Hosted-mode end-to-end. Drives the two-user flow that gates 1.0:
 *
 *   1. First user signs up → auto-admin via the post-signup hook.
 *   2. Admin uploads a private source via the API (the form has no
 *      private toggle yet — Phase 10 carry-over).
 *   3. Second user signs up in a fresh browser context → defaults to viewer.
 *   4. Viewer visits the source slug → sees the request-access form.
 *   5. Viewer submits the request → "Your request is pending review."
 *   6. Admin visits /admin → sees the request → clicks Approve.
 *   7. Viewer revisits the slug → the request-access form is gone (the
 *      source body now renders, even if the upload pipeline is mid-run).
 *
 * We rely on the existing tests/hosted-mode.smoke.test.ts for service-layer
 * coverage; this spec proves the UI plumbing works in a real browser.
 */
import path from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { readState } from './lifecycle';

const FIXTURE_PDF = path.resolve(process.cwd(), 'fixtures/sources/sample-report.pdf');

const ADMIN_EMAIL = `admin-${Date.now()}@e2e.test`;
const VIEWER_EMAIL = `viewer-${Date.now()}@e2e.test`;
const PASSWORD = 'e2e-password-12345';
const SOURCE_TITLE = `Private Report ${Date.now()}`;

test.describe.configure({ mode: 'serial' });

/**
 * Upload a private source via the JSON API using the supplied authed
 * request context. The form doesn't expose a private toggle, so a direct
 * multipart POST is the only way to mark a source private from the UI
 * layer right now.
 */
async function uploadPrivateSource(
  request: APIRequestContext,
  baseURL: string,
): Promise<string> {
  const fs = await import('node:fs/promises');
  const buf = await fs.readFile(FIXTURE_PDF);
  const res = await request.post(`${baseURL}/api/sources`, {
    multipart: {
      file: {
        name: 'sample-report.pdf',
        mimeType: 'application/pdf',
        buffer: buf,
      },
      title: SOURCE_TITLE,
      is_private: 'true',
    },
  });
  expect(res.status(), `upload status (body: ${await res.text().catch(() => '?')})`).toBe(201);
  const body = (await res.json()) as { sourceId: string };
  expect(body.sourceId).toBeTruthy();
  return body.sourceId;
}

test('hosted mode — signup, private upload, ownership request, admin approval', async ({ browser }) => {
  const state = await readState();
  expect(state, 'globalSetup must have written .e2e-state.json').not.toBeNull();
  const baseURL = state!.baseURL;

  // -- 1. Admin signs up (becomes admin via the post-signup hook). -----------
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await adminPage.goto('/signup');
  await adminPage.getByLabel(/Name/i).fill('Admin User');
  await adminPage.getByLabel(/Email/i).fill(ADMIN_EMAIL);
  await adminPage.getByLabel(/Password/i).fill(PASSWORD);
  await adminPage.getByRole('button', { name: /Create account/i }).click();
  await adminPage.waitForURL((url) => !url.pathname.startsWith('/signup'), { timeout: 30_000 });

  // -- 2. Admin uploads a private source through the API. --------------------
  // (We use the admin context's authed request session so the cookie is
  // already attached and Better-auth sees the admin role.)
  const sourceId = await uploadPrivateSource(adminContext.request, baseURL);
  console.log(`[e2e:hosted] uploaded private source id=${sourceId}`);

  // Discover the slug from the catalogue listing.
  await adminPage.goto('/sources');
  const sourceLink = adminPage.getByRole('link', { name: SOURCE_TITLE });
  await expect(sourceLink).toBeVisible({ timeout: 10_000 });
  const href = await sourceLink.getAttribute('href');
  expect(href).toMatch(/^\/sources\//);
  const slug = href!.replace('/sources/', '');
  console.log(`[e2e:hosted] discovered slug=${slug}`);

  // -- 3. Second user signs up in a fresh context (defaults to viewer). ------
  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();
  await viewerPage.goto('/signup');
  await viewerPage.getByLabel(/Name/i).fill('Viewer User');
  await viewerPage.getByLabel(/Email/i).fill(VIEWER_EMAIL);
  await viewerPage.getByLabel(/Password/i).fill(PASSWORD);
  await viewerPage.getByRole('button', { name: /Create account/i }).click();
  await viewerPage.waitForURL((url) => !url.pathname.startsWith('/signup'), { timeout: 30_000 });

  // -- 4. Viewer visits the private source — sees the request-access form. ---
  await viewerPage.goto(`/sources/${slug}`);
  await expect(viewerPage.getByText(/This source is private/i)).toBeVisible({ timeout: 10_000 });

  // -- 5. Viewer submits the access request. ---------------------------------
  const noteField = viewerPage.getByLabel(/Note/i);
  await noteField.fill('Working on the same engagement.');
  await viewerPage.getByRole('button', { name: /^Request access$/i }).click();
  await expect(viewerPage.getByText(/Your request is pending review/i)).toBeVisible({
    timeout: 10_000,
  });

  // -- 6. Admin sees the request in /admin and approves it. ------------------
  await adminPage.goto('/admin');
  const requestRow = adminPage.locator('li', { hasText: SOURCE_TITLE });
  await expect(requestRow).toBeVisible({ timeout: 10_000 });
  await requestRow.getByRole('button', { name: /Approve/i }).click();
  // The row should leave the queue after approval. The queue empties when
  // it was the only pending row.
  await expect(adminPage.getByText(/queue is quiet/i)).toBeVisible({ timeout: 10_000 });

  // -- 7. Viewer revisits the source — request-access form is gone. ----------
  await viewerPage.goto(`/sources/${slug}`);
  await expect(viewerPage.getByText(/This source is private/i)).toHaveCount(0);

  await adminContext.close();
  await viewerContext.close();
});
