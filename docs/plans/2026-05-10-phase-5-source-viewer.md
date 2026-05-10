# Phase 5 — Source Viewer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A `/sources/[slug]` detail page renders the canonical markdown beside the original PDF in a resizable split pane. Scroll position stays synchronised — scrolling the markdown advances the PDF to the matching page, and scrolling the PDF advances the markdown to the matching `source_pages` anchor. Image references inside markdown resolve through a new short-lived signed-URL route, so neither the storage backend nor its raw URLs leak into the page.

**Architecture:** Source detail is a server component under the `(app)/` group at `src/app/(app)/sources/[slug]/page.tsx`. It loads the source row + canonical markdown + per-page metadata + the original-PDF storage key in one read, then hands them to `<SourceViewer>` (client). `<SourceViewer>` is the split layout: a resizable pane (mouse-drag handle, min 25% / max 75%), a `<SourceMarkdown>` on the left, a `<SourcePdfViewer>` on the right. Scroll sync is a single `useScrollSync` hook coordinating the two panes via `IntersectionObserver` — when a markdown page-section enters the viewport, set `activePage`; when the PDF's visible page changes, set `activePage`; the other pane reacts to `activePage` by scrolling its corresponding element into view. A signed-URL route `/api/files/[token]` serves storage objects through the app: `token` is an HMAC-signed JSON `{ key, exp }`, valid 5 minutes by default. Markdown images get rewritten by a `rehype` plugin that maps any URL we recognise as a storage key (no scheme + matches the page-image prefix) into `/api/files/<signed-token>`.

**Tech Stack — new deps to add at Task 1 (approval-gated):**

- `react-pdf@^11` — pdfjs-dist wrapper that handles the worker setup, rendering, and viewport math. Needs a small Next.js side-config so the worker file ships via the public/ folder.
- `react-markdown@^9` + `remark-gfm@^4` + `rehype-sanitize@^6` — the design names these. We add them now since Phase 5 is the first markdown-rendering surface.
- `react-resizable-panels@^3` — handles the split-pane resizer cleanly. Alternative is hand-rolling drag math; this lib is ~6KB gzipped and well-tested.

**Out of scope for Phase 5:**

- Annotations on the PDF, text selection from the PDF (Phase 10 polish).
- Inline-editing the canonical markdown (no plan for that yet).
- Recommendations bound to a specific page anchor — `pageAnchor` is on the schema but populated by Phase 6.
- Multi-source comparison view.
- Mobile-friendly stacked layout — Phase 4's responsive work covers nav; Phase 5 ships desktop-first split-pane with an "open PDF in new tab" fallback at narrow widths.

---

## Phase 5 exit criteria

1. `GET /sources/<slug>` for a `ready` source renders the markdown pane and the PDF pane side-by-side, both scrollable.
2. The split is resizable (mouse drag, persists for the session via `localStorage`).
3. Scrolling the markdown changes the active page indicator AND advances the PDF to the matching page (and vice versa).
4. Markdown images that reference page-image storage keys render via `/api/files/<token>`. The raw storage URL never appears in the DOM.
5. `/api/files/<token>` returns 200 for a valid unexpired token, 401 for a tampered/missing/expired token, 404 for a key that doesn't exist.
6. `pnpm verify` green: typecheck + lint + tests + Next.js production build.
7. `docker compose up -d` brings the stack up and a manual smoke against `/sources/<slug>` of the seeded fixture renders both panes (smoke step in Task 8).

---

## Preflight facts (resolve at plan time, then re-check during Task 1)

- **`source_pages.markdown`** holds the per-page split (the parse handler splits on `\r?\n---\r?\n`). Whole-document markdown is `sources.canonicalMarkdown`. Phase 5's left pane uses the per-page rows so we have a stable anchor for scroll sync — render each as `<section data-page={n}>` and observe them with `IntersectionObserver`.
- **PDF storage** lives behind `source_files` rows where `role = 'original'`. The `key` is what we hand to `storage.get(key)` or `storage.signedUrl(key)`. Phase 2's upload writes a single `original` row per source.
- **Image refs** are in `source_pages.imageRefs` (`jsonb string[]`). The parse handler stores keys like `<source-id>/page-<n>/img-<i>.<ext>` (verify exact format in `src/lib/jobs/handlers/parse.ts` at task time). The markdown body itself can also embed `![](relative/path)` — the rewriter handles both shapes.
- **Server vs. client split.** The detail page is a server component; `<SourceViewer>` is a client component. The page **pre-mints** the signed URL for the PDF and per-page image URLs server-side and hands them down already-resolved. No client-side token-mint round trip in Phase 5; expiry refresh is Phase 10 polish.
- **react-pdf + Next.js.** The pdfjs worker has to be reachable at a stable URL. We copy `pdfjs-dist/build/pdf.worker.min.mjs` to `public/pdf.worker.mjs` at install time (a tiny `postinstall` script — verify it doesn't conflict with the existing one) and set `pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs'` once at module load.
- **Tailwind v4 + react-resizable-panels.** The lib uses inline-styled handles by default; we override with a thin Tailwind-styled child. No CSS-import surprises expected.
- **Auth on `/api/files/[token]`.** Local mode = system; hosted mode = the auth provider's getContext. The token already encodes `key`, but we still re-check ownership server-side: the key has to belong to a source the viewer can see (via the same auth filter from `recommendation.ts` / Phase 4's `listRecentSources`).
- **HMAC.** Secret comes from a new env var `FILE_TOKEN_SECRET` (32+ chars). In local mode it defaults to a static string; hosted mode requires it to be set (zod refinement). Same pattern as `BETTER_AUTH_SECRET`.

---

## Task list

| # | Task | Touches |
|---|---|---|
| 1 | Approval-gated dep install + pdfjs worker copy + `FILE_TOKEN_SECRET` env | `package.json`, `next.config.ts`, `public/pdf.worker.mjs`, `src/lib/env.ts` |
| 2 | `/api/files/[token]` signed-URL route + HMAC sign/verify helpers + tests | `src/lib/files/sign.ts`, `src/app/api/files/[token]/route.ts`, tests |
| 3 | `<SourcePdfViewer pdfUrl>` (react-pdf, page-aware viewport) + mock-based tests | `src/components/source-viewer/source-pdf-viewer.tsx`, `.test.tsx` |
| 4 | `<SourceMarkdown pages>` with rehype image-rewrite plugin + tests | `src/components/source-viewer/source-markdown.tsx`, `rewrite-storage-images.ts`, `.test.tsx` |
| 5 | `<SourceViewer>` split-pane shell + resizable + persisted ratio | `src/components/source-viewer/source-viewer.tsx`, `.test.tsx` |
| 6 | `useScrollSync({ activePage, setActivePage })` debounced two-pane state | `src/lib/hooks/use-scroll-sync.ts`, `.test.tsx` |
| 7 | `/sources/[slug]` server page wires repository fetch → `<SourceViewer>` | `src/lib/repositories/source.ts` (extend), `src/app/(app)/sources/[slug]/page.tsx`, `.test.ts` |
| 8 | UI smoke + end-of-phase verify + PR + doc updates | `tests/source-viewer.smoke.test.tsx`, `PLAN.md`, `STATE.md`, `docs/changelog.md` |

**Tokens are pre-minted server-side** by the page in Task 7 — no client hook is needed. The page hands `<SourceViewer>` already-resolved `pdfUrl: string` and per-page image-URL maps. Tokens last 5 minutes; refreshing the page re-mints. Re-fetching after expiry without reload is Phase 10 polish.

---

## Task 1 — deps + pdfjs worker + env

**Approval gate:** before `pnpm add`, confirm the lib choices in **Tech Stack**. CLAUDE.md "Don't add dependencies without asking."

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Modify: `next.config.ts` (allow `*.mjs` in worker, raise external bundling tolerance)
- Create: `scripts/copy-pdf-worker.ts` (copies pdfjs worker to `public/pdf.worker.mjs`)
- Modify: `src/lib/env.ts` — add `FILE_TOKEN_SECRET: z.string().min(32)` with the same hosted-mode-required refinement as `BETTER_AUTH_SECRET`.

**Step 1 — Inspect:**

```bash
cat next.config.ts
grep -E "pdfjs|react-pdf|react-markdown|react-resizable-panels" package.json || echo "(none yet)"
```

**Step 2 — Install (after approval):**

```bash
pnpm add react-pdf react-markdown remark-gfm rehype-sanitize react-resizable-panels
```

`react-pdf` brings `pdfjs-dist` transitively. We do not add it directly.

**Step 3 — Worker copy script + invocation.** Add `tsx scripts/copy-pdf-worker.ts` to a new `prepare` or `predev` npm script so the worker is in `public/` before Next.js starts. Idempotent — if the file exists and matches the installed pdfjs version, no-op.

**Step 4 — `FILE_TOKEN_SECRET` env.** Mirror `BETTER_AUTH_SECRET`: required in hosted mode, default to `'local-dev-only-' + 32-char-pad'` in local mode. Update `src/lib/env.test.ts` if needed.

**Step 5 — `pnpm verify` green (no business code changes yet — typecheck + lint + tests should still pass; build will newly include `public/pdf.worker.mjs`).**

**Commit:**

```bash
git commit -m "build: react-pdf + react-markdown + react-resizable-panels; pdfjs worker copy + FILE_TOKEN_SECRET env"
```

---

## Task 2 — `/api/files/[token]` signed-URL route

**Files:**
- Create: `src/lib/files/sign.ts` (sign + verify token; pure HMAC, no Next deps)
- Create: `src/lib/files/sign.test.ts`
- Create: `src/app/api/files/[token]/route.ts`
- Create: `src/app/api/files/[token]/route.test.ts`

**Token shape:** base64url-encoded `{ payload, signature }` where `payload = base64url(JSON.stringify({ key, exp }))` and `signature = base64url(HMAC-SHA256(payload, secret))`. Verify is constant-time.

**`signFileToken(secret, { key, expiresInSeconds = 300 }) → string`**
**`verifyFileToken(secret, token) → { key } | null`** (null on tampering, expired, malformed)

Tests:
1. round-trip: sign → verify → same key.
2. tampered payload → null.
3. tampered signature → null.
4. expired (advance fake timers past exp) → null.
5. malformed string → null (not a thrown error).

**Route — `GET /api/files/[token]`:**

1. Verify the token. Invalid → 401.
2. Look the key up to a `source_files` row to determine the owning source. Auth-filter the source via the standard `(public OR owned-by-viewer OR isSystem)` predicate. If no row OR the viewer can't see the source → 404.
3. Stream the file via `storage.get(key)` with `Content-Type` derived from `source_files.contentType` and `Cache-Control: private, max-age=300`. (For `original` PDFs that's `application/pdf`; page images are `image/png` etc.)

Route tests (Testcontainers; seed two sources, one private with a different owner, mint tokens for each, request and assert the matrix):
- valid token + viewer-can-see → 200 + body matches stored bytes.
- valid token + private-source-not-mine → 404.
- tampered token → 401.
- expired token → 401.
- non-existent key → 404.
- non-PDF (a page-image) returns its own content-type.

**Commit:**

```bash
git commit -m "feat: /api/files/[token] signed-URL route + HMAC sign/verify helpers"
```

---

## Task 3 — `<SourcePdfViewer pdfUrl>`

**Files:**
- Create: `src/components/source-viewer/source-pdf-viewer.tsx`
- Create: `src/components/source-viewer/source-pdf-viewer.test.tsx`

**Contract:** Takes `{ pdfUrl: string; activePage: number; onPageChange: (n: number) => void }`. Uses `react-pdf`'s `<Document>` + `<Page>` with `pageNumber={activePage}`. Reports the in-view page back via `onPageChange` (use `react-pdf`'s `onLoadSuccess` to learn page count, IntersectionObserver on each rendered `<Page>` for activity). Page width is computed from a `ResizeObserver` on the host element so the PDF scales with the pane.

Tests **mock `react-pdf`** with a stub `<Document>` that renders `<Page>` placeholders — happy-dom can't run pdfjs's worker. Assert that:
- Setting `activePage=2` calls the stub's expected `pageNumber` prop.
- Clicking a "next page" control calls `onPageChange(activePage + 1)`.
- Loading state is shown while the document hasn't loaded.

**Commit:**

```bash
git commit -m "feat(ui): <SourcePdfViewer> backed by react-pdf with controlled active page"
```

---

## Task 4 — `<SourceMarkdown pages>` + image rewrite

**Files:**
- Create: `src/components/source-viewer/source-markdown.tsx`
- Create: `src/components/source-viewer/rewrite-storage-images.ts` (rehype plugin)
- Create: `.test.tsx` for both

**Contract:** `<SourceMarkdown pages={Page[]} activePage onPageChange />` renders each page as a `<section data-page={n}>` running react-markdown over `page.markdown`. The rehype plugin walks `<img>` nodes; if the `src` matches a known storage-key pattern (or appears in `page.imageUrls` as a key→signed-URL map), it rewrites to the signed URL. Anything else passes through (so external images still render).

Tests:
- Plain markdown renders as expected (use `getByText`).
- An `<img>` whose src is a storage key rewrites to the supplied URL.
- An `<img>` with an unknown src is left untouched.
- Each page wraps in `<section data-page>` with the correct number.

**Commit:**

```bash
git commit -m "feat(ui): <SourceMarkdown> with rehype image-rewrite to signed URLs"
```

---

## Task 5 — `<SourceViewer>` split-pane

**Files:**
- Create: `src/components/source-viewer/source-viewer.tsx`
- Create: `.test.tsx`

**Contract:** Renders two children — left pane (markdown), right pane (PDF) — separated by `react-resizable-panels`'s draggable handle. Initial split 50/50; persisted in `localStorage` under `source-viewer:split` (use the existing `useLocalStorage` hook). Mins 25%, max 75%. Above the split-pane row, a tiny header bar shows source title + a "Page X / Y" indicator wired to `activePage`.

Tests:
- Renders both children.
- Drags the handle to ~30% → re-render reads the persisted ratio from `localStorage`.
- Header reflects `activePage` changes from either child.

**Commit:**

```bash
git commit -m "feat(ui): <SourceViewer> resizable split-pane with persisted ratio"
```

---

## Task 6 — `useScrollSync`

**Files:**
- Create: `src/lib/hooks/use-scroll-sync.ts`
- Create: `.test.tsx`

**Contract:** A small hook that coordinates `activePage` between the two panes. `setActivePage` is debounced (~120ms) to avoid scroll feedback loops. Pure state machine — IntersectionObservers live in the leaf components and call `setActivePage` directly; this hook is mostly the debounced state holder + an `imperativeScroll(side, page)` helper used by the leaf components when `activePage` changes externally.

Tests:
- Calling `setActivePage(3)` settles to `activePage = 3` after the debounce window.
- Two rapid `setActivePage` calls within debounce window collapse to the last value (no thrashing).
- `imperativeScroll('pdf', 5)` invokes the registered scroller for the PDF side.

**Commit:**

```bash
git commit -m "feat(ui): useScrollSync hook for two-pane page coordination"
```

---

## Task 7 — `/sources/[slug]` page

**Files:**
- Modify: `src/lib/repositories/source.ts` — add `getSourceWithPagesBySlug(ctx, slug) → { source, pages, originalPdfKey }`. Auth-filter on read; throws `NotFoundError` if invisible.
- Modify: tests for source repo.
- Create: `src/app/(app)/sources/[slug]/page.tsx`.

The page mints signed tokens for the original PDF and for any image refs server-side, then hands the result to `<SourceViewer>`. The page is server-rendered (RSC); `<SourceViewer>` is the client boundary.

Tests for `getSourceWithPagesBySlug` (Testcontainers): public source → returns; private source mine → returns; private not mine → throws NotFound.

**Commit:**

```bash
git commit -m "feat: /sources/[slug] detail page wired through SourceViewer"
```

---

## Task 8 — UI smoke + verify + PR + docs

**Files:**
- Create: `tests/source-viewer.smoke.test.tsx` — mounts `<SourceViewer>` with mocked PDF + a small fixture markdown set, asserts both panes render, the resizer can move, and `activePage` updates flow both ways (with mocked IntersectionObserver).
- Modify: `PLAN.md`, `STATE.md`, `docs/changelog.md`, `docs/.docs-state.json` (post-merge).

**Manual smoke (post-build):** `docker compose up -d`, navigate to `/sources/sample-report` (the fixture seeded by Phase 2), confirm both panes render, scroll the markdown, watch the PDF jump pages.

Open PR; squash-merge when CI green.

**Commit cadence:** one commit per task, plus the docs commit. Mirror prior phases.

---

## Carry-overs / flags to watch

- `react-pdf` doesn't ship its own React 19 type compatibility yet on every release; verify at install time and pin if needed.
- The pdfjs worker path is hardcoded to `/pdf.worker.mjs`. If we move to a CDN later (faster cold start), update `GlobalWorkerOptions.workerSrc` and drop the postinstall script.
- The signed-URL token doesn't include the viewer's identity — it gates by the source's public/owner predicate at request time. This means if a private source becomes public, an old token still works; that's intentional. If we ever need stricter revocation, encode the viewer id in the token and re-check on serve.
- Mobile layout is desktop-first only. Phase 10 polish will add a stacked-pane mode below `md:`.
- Rendering tests mock `react-pdf` because pdfjs requires a real Canvas + worker. If we add Playwright in Phase 10, replace the mock with a real-browser smoke.
