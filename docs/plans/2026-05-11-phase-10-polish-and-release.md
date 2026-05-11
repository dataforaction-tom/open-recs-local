# Phase 10 — Polish, docs, and 1.0 release

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close out the carry-overs that block a confident 1.0 ship: real email delivery, readable markdown, responsive source viewer, real install docs, and a browser-level E2E covering both deployment modes. Then cut the 1.0 release.

**Scoped IN for 1.0 (confirmed at scoping):**

- **Real email backend (Resend)** behind `EMAIL_PROVIDER=resend` + `RESEND_API_KEY`. The console fake stays as the default so local mode boots with zero email config.
- **`@tailwindcss/typography`** so the `prose` classes on the markdown body actually style. Long-running Phase 5 carry-over.
- **Mobile layout for `<SourceViewer>`** — stacked panes below the `md:` breakpoint so the split-pane viewer doesn't collapse on narrow screens. Phase 5 carry-over.
- **Playwright browser E2E + CI matrix** — `APP_MODE=local` and `APP_MODE=hosted` both covered. Phase 8 deferral.
- **README screenshots + `docs/running-locally.md`** — Mac mini + Linux + hosted-mode walkthroughs.
- **Changelog / 1.0 release notes**, version bump, tag.

**Scoped OUT for 1.0 (confirmed deferred):**

- **NetworkViz** force-directed similarity graph — 1.1 / its own slot.
- **Audit log of admin actions, GDPR data export, account deletion** — 1.x.
- **Edit / delete UI for progress updates** — workaround exists (post a corrective second update).
- **Custom date ranges / CSV export / drill-downs / per-user analytics** — 1.1.
- **`ANALYTICS_REFRESH_CRON` env override** — add if requested.
- **OAuth (Google / GitHub), 2FA, email rate limiting, rate limiting on `/api/chat-search`** — 1.x.
- **Sub-page chunking, asymmetric retrieval prefixes for `nomic-embed-text`, generated `tsv` on `source_pages`** — retrieval-tuning items that should land only with measurable evidence.
- **Vitest `environmentMatchGlobs` migration** — internal hygiene; do before Vitest 4 actually lands.

**Ship shape:** **two PRs** (confirmed at scoping).

- **PR 10a — polish + docs.** Email backend + typography + mobile viewer + README + running-locally. Small additive changes, fast review.
- **PR 10b — Playwright + CI matrix + 1.0 release.** Heavier (Playwright runtime, hosted-mode CI step) and ends with the version bump + tag.

---

## Phase 10 exit criteria

1. With `APP_MODE=hosted` + `EMAIL_PROVIDER=resend` + `RESEND_API_KEY=…`, a "forgot password" / magic-link request actually delivers an email through Resend. Without those vars, the console fake still works.
2. Markdown source bodies render with `prose` styling (headings, lists, code blocks). Currently silent no-op.
3. `/sources/<slug>` is usable on a narrow viewport — the markdown + PDF stack vertically below `md:` rather than collapsing the split.
4. `pnpm test:e2e` (Playwright) runs against a started dev server and exercises the headline flow (upload → recommendations appear → search → chat reply) in both local and hosted modes. CI matrix runs the verify pipeline with both `APP_MODE` values; both must pass for merge.
5. `README.md` has at least three screenshots (dashboard, source viewer, recommendations index) and a clear "two modes" explanation. `docs/running-locally.md` walks a fresh user from clone → dashboard for Mac mini (native Ollama + Docling container) and Linux (one-command + GPU notes), plus a hosted-mode section with the env vars.
6. Tagged `v1.0.0` release with a changelog entry summarising the journey. LICENSE is MIT (already in place).

---

## PR 10a — polish + docs

### Tasks

| # | Task | Touches |
|---|---|---|
| 1 | Approval-gated dep + Resend `EmailProvider` adapter behind `EMAIL_PROVIDER=resend` | `package.json`, `src/lib/providers/email/resend.ts`, `.test.ts`, `src/lib/providers/email/index.ts`, `src/lib/env.ts` |
| 2 | `@tailwindcss/typography` install + wire into Tailwind config | `package.json`, `src/app/globals.css` or Tailwind config |
| 3 | Mobile layout for `<SourceViewer>` (stacked below `md:`) + tests | `src/components/source-viewer/source-viewer.tsx`, `.test.tsx` |
| 4 | `docs/running-locally.md` — Mac mini, Linux, hosted | `docs/running-locally.md` |
| 5 | README pass: screenshots, dual-mode explanation, link to running-locally | `README.md`, `docs/screenshots/*.png` |
| 6 | Smoke + verify + PR + doc updates (PLAN, STATE, changelog) | `PLAN.md`, `STATE.md`, `docs/changelog.md` |

### Task 1 — Resend email backend

**Approval gate:** before `pnpm add`, confirm with the user.

```bash
pnpm add resend
```

`src/lib/providers/email/resend.ts` implements `EmailProvider` against `resend`'s Node SDK. `createResendEmail({ apiKey, from })` returns `{ name: 'resend', send }`. The factory picks the provider based on `EMAIL_PROVIDER` env (default `'console'`). Env schema extends with `EMAIL_PROVIDER` enum + `RESEND_API_KEY` + `RESEND_FROM` (cross-field refinement requires the latter two when provider is `'resend'`).

Tests:
- The adapter calls `resend.emails.send` with the correct payload (mock the SDK).
- The factory returns the console fake by default and the Resend adapter when env is set.
- Env validation rejects `EMAIL_PROVIDER=resend` without `RESEND_API_KEY`.

**Commit:**
```bash
git commit -m "feat(email): Resend backend behind EMAIL_PROVIDER=resend"
```

### Task 2 — `@tailwindcss/typography`

Install + register the plugin in the Tailwind config (Tailwind v4 uses `@plugin` in the CSS layer). Verify a Markdown body picks up the styling — render a fixture source page and check headings + lists visually.

```bash
pnpm add -D @tailwindcss/typography
```

No tests beyond a visual confirmation in dev; the smoke check is "the source viewer's markdown body is no longer unstyled".

**Commit:**
```bash
git commit -m "build(ui): @tailwindcss/typography (prose styling)"
```

### Task 3 — Mobile source viewer

`<SourceViewer>` currently uses `react-resizable-panels` for a side-by-side layout that doesn't degrade on narrow screens. Two paths:

1. Render two panels stacked vertically below `md:` (cheaper, less elegant).
2. Use a `<Tabs>` switcher below `md:` so the user picks Markdown or PDF (preserves screen real estate).

Default: option 1 (stacked). Tests: render at narrow + wide widths via `matchMedia` mock, assert correct layout.

**Commit:**
```bash
git commit -m "feat(ui): stacked source viewer below md: breakpoint"
```

### Task 4 — `docs/running-locally.md`

Three sections:
- **Mac mini (native Ollama + Docling container).** Step through Ollama install + model pulls, Docling container startup, `.env` for `LLM_BASE_URL=http://localhost:11434`, etc.
- **Linux (Docker compose with GPU).** Full-stack `docker compose up`, optional GPU passthrough for Ollama.
- **Hosted mode.** Env vars (`APP_MODE=hosted`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `RESEND_FROM`). First-signup-becomes-admin caveat.

**Commit:**
```bash
git commit -m "docs: running-locally.md (Mac mini, Linux, hosted)"
```

### Task 5 — README pass + screenshots

Add `docs/screenshots/` directory with three PNGs:
- `dashboard.png` — `/dashboard` with the recent-sources + recent-jobs cards
- `source-viewer.png` — `/sources/<slug>` with the split-pane open
- `recommendations.png` — `/recommendations` with filters applied

README adds an `## At a glance` section above `## What it does` with the screenshots in a small grid. Cross-reference `docs/running-locally.md` from the `## Quick start` section.

Note: screenshots must be captured against the running dev stack — there's no automation for this. The plan flags it and leaves the actual capture to the operator.

**Commit:**
```bash
git commit -m "docs: README screenshots + dual-mode explanation"
```

### Task 6 — PR 10a wrap-up

`pnpm verify` → push → PR → squash-merge.

---

## PR 10b — Playwright + CI matrix + 1.0 release

### Tasks

| # | Task | Touches |
|---|---|---|
| 1 | Approval-gated dep: `@playwright/test` + a `playwright.config.ts` | `package.json`, `playwright.config.ts` |
| 2 | Local-mode E2E: upload → recommendation appears → search → chat reply | `tests/e2e/local-mode.spec.ts` |
| 3 | Hosted-mode E2E: signup → private upload → second user requests → admin approves → access granted | `tests/e2e/hosted-mode.spec.ts` |
| 4 | CI matrix: `APP_MODE=local` and `APP_MODE=hosted` both run verify + e2e | `.github/workflows/ci.yml` (or equivalent) |
| 5 | Final `pnpm verify` + `docker compose up -d` smoke across all compose override combinations | manual |
| 6 | 1.0 release: version bump + changelog entry + tag | `package.json`, `docs/changelog.md`, git tag |
| 7 | PR + squash-merge | — |

### Task 1 — Playwright install

**Approval gate.** Playwright pulls in browser binaries; the install footprint is meaningful but well-understood.

```bash
pnpm add -D @playwright/test
pnpm exec playwright install --with-deps chromium
```

`playwright.config.ts` configures a single `chromium` project, baseURL from `PLAYWRIGHT_BASE_URL` (default `http://localhost:3000`), and `webServer` to launch `pnpm dev` against a Testcontainers-backed Postgres in CI.

### Task 2-3 — E2E specs

Each spec:
- Starts a fresh Postgres + worker via Testcontainers (reuse the existing `tests/helpers/pg-container.ts` driver).
- Boots the Next.js app via `playwright.config.ts`'s `webServer`.
- Drives the browser through the documented happy path.
- Uses fixture PDFs (already in `fixtures/sources/`) for the upload step.

The hosted-mode spec needs `APP_MODE=hosted` + a freshly generated `BETTER_AUTH_SECRET` in its env; the test infrastructure injects both before `webServer` boots.

### Task 4 — CI matrix

Existing CI runs `pnpm verify` once. Phase 10b adds a job matrix that runs the same pipeline with `APP_MODE=local` and `APP_MODE=hosted` (the latter also passes through `EMAIL_PROVIDER=console` so the test environment doesn't need Resend creds). Both jobs must pass for merge.

### Task 5 — Compose smoke

Run `docker compose up -d` for every documented override combination:
- Base (Postgres + app + worker)
- `+ docker-compose.docling.yml` (Mac mini + Docling sidecar)
- `+ docker-compose.minio.yml` (hosted multi-user with S3-shaped storage)

Each must come up healthy; document any required setup steps in `running-locally.md`.

### Task 6 — 1.0 release

- Bump `package.json` to `1.0.0`.
- `docs/changelog.md` gets a `## 2026-05-XX — 1.0.0` section summarising the journey from 0.1 → 1.0.
- Tag `v1.0.0` on master after the squash-merge.

### Task 7 — PR

`pnpm verify` → push → PR → squash-merge → tag.

---

## Carry-overs intentionally left for post-1.0

These are documented as "1.x roadmap" rather than blockers:

- **NetworkViz** — force-directed similarity graph. Multi-day project of its own; valuable but not load-bearing for v1's "track recommendations" core.
- **Audit log of admin actions** — useful operational telemetry; non-blocking.
- **GDPR account deletion / data export** — compliance feature; ship when there's a user who actually needs it.
- **Edit / delete UI for progress updates** — workaround works.
- **Analytics drill-downs / custom date ranges / CSV export / per-user view** — refinements over the four headline charts.
- **`ANALYTICS_REFRESH_CRON` env override** — operators in non-UTC server timezones can request.
- **OAuth providers (Google / GitHub)** — opt-in for a 1.1.
- **Two-factor auth** — not v1 scope.
- **Email rate limiting** — Phase 8 op-hardening.
- **Rate limiting on `/api/chat-search`** — Phase 3 op-hardening.
- **Sub-page chunking, asymmetric retrieval prefixes for `nomic-embed-text`, generated `tsv` on `source_pages`** — retrieval-tuning; ship with measurable evidence.
- **Vitest `environmentMatchGlobs` migration to `test.projects`** — internal hygiene; do before Vitest 4.
- **`/api/files/[token]` in-place token refresh** — Phase 5 polish; tokens currently last 5 minutes with reload-to-refresh.
- **`/api/recommendations` keyword endpoint** — kept for v1-compat; retire when the table UI is fully canonical.
