# Phase 4 — UI Shell Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** A working app shell that renders the dashboard at `/` after a redirect from the marketing landing, with route groups, a top nav, dark mode, a `DecisionFlow` first-launch experience, and `<FeatureGate>` wrappers that hide hosted-mode-only UI in local mode. No data-heavy pages yet — those land in Phase 5+ (source viewer) and Phase 6 (recommendations table). What ships in Phase 4 is the chrome and the conventions every later UI phase will sit on top of.

**Architecture:** Next.js 16 App Router with three route groups under `src/app/`: `(marketing)/` for the hosted-only public landing, `(app)/` for the authenticated app shell (dashboard, sources, search, recommendations stub, etc. — empty pages for the latter where Phase 5+ owns the content), and `(auth)/` reserved for Phase 8 (Better-auth flows). A new server util `getPublicConfig()` reads the env once on the server and exposes a small JSON blob (`{ appMode, features }`) to the client via a `<ConfigProvider>` context — that's how `<FeatureGate>` knows what to render. Theme uses Tailwind v4's `dark:` modifier driven by a `data-theme="dark"` attribute on `<html>`; `ThemeInitializer` is an inline script in `<head>` that sets the attribute pre-hydration so there's no FOUC. `DecisionFlow` is the first-launch click-through animated with Framer Motion; it persists a "seen" flag in `localStorage` so it doesn't re-show.

**Tech Stack — new tooling at Task 1 (approval-gated):**

- **shadcn/ui** — primitive set, codegenned into `src/components/ui/`. `npx shadcn@latest init` configures `components.json` and pulls in `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`. We then `npx shadcn@latest add` only the primitives Phase 4 actually uses (`button`, `card`). Other shadcn primitives (`dialog`, `tooltip`, `select`, etc.) are added in later phases as their first consumer appears.
- `framer-motion@^12` — DecisionFlow animations (not a shadcn primitive).
- `next-themes@^0.4` — `<ThemeProvider>` + `useTheme()`. Handles SSR + system-pref + localStorage. shadcn's docs show `next-themes` as the canonical theme integration, so this is the path of least friction.
- `@testing-library/react@^17` + `@testing-library/jest-dom@^7` + `@testing-library/user-event@^14` — component testing.
- `happy-dom@^20` — DOM environment for Vitest. Faster startup than jsdom; better React 19 compatibility today.

**shadcn init setup (executed in Task 1 with explicit flags so nothing is interactive):**

- Style: `new-york` (default; lighter visual than `default`).
- Base color: `slate`.
- CSS variables: `yes`.
- Root css: `src/app/globals.css`.
- Aliases: `@/components/ui` for primitives, `@/lib/utils` for `cn()`.

**Components added by `npx shadcn add` in Phase 4:** `button`, `card`. Anything else gets added in the task that first uses it.

**Deferred to later phases (do NOT add in Phase 4):**

- `@tanstack/react-query` + `@tanstack/react-table` — Phase 6 with the recommendations table.
- `zustand` — defer until a non-trivial cross-component state actually shows up; the Phase 4 surface area doesn't need it.
- `pdfjs-dist`, `react-markdown` etc. — Phase 5.
- `chart.js`, `react-chartjs-2` — Phase 9.
- `react-hot-toast` — first toast appears in Phase 5/6; defer install to wherever the first call site lands.
- `react-hook-form`, `react-select` — Phase 6/7.
- `@playwright/test` — out of scope for Phase 4. Component-level testing via testing-library + happy-dom is enough; full browser e2e gets revisited at Phase 10.

**Testing discipline with shadcn primitives:** shadcn components are owned-code (codegenned into the repo), but they ship without tests. We do not re-test the primitives themselves — that would just assert on shadcn's class names, which is brittle. Instead we test our **composition**: `<DarkModeToggle>` (uses `<Button size="icon">`), `<Navigation>` (composes `<Button>` and `<Link>`), `<DashboardView>` (uses `<Card>`). Behavioural assertions (clicks, aria attributes, conditional rendering) — not class-name assertions.

---

## Phase 4 exit criteria

1. Visiting `/` in local mode redirects to `/(app)/dashboard` (or just renders it, depending on Next.js group resolution); in hosted mode the marketing landing at `/(marketing)/` shows.
2. Top nav renders, links work, the page is responsive at 360 / 768 / 1280 widths.
3. Dark mode toggle flips theme, persists across reload, and the initial render matches the persisted choice (no flash).
4. `DecisionFlow` renders on first launch, can be dismissed, and stays dismissed after reload (`localStorage`-backed).
5. `<FeatureGate feature="auth">` renders children in hosted mode and `null` in local mode; children are still typechecked even when not rendered.
6. `pnpm verify` green: typecheck + lint + 40+ test files (existing) + new component tests + Next.js production build.
7. CI green; the homepage manual smoke (`docker compose up -d` → `curl -f http://localhost:3000/`) returns 200.

---

## Preflight facts (resolve at plan time, then re-check during Task 1)

- **Next.js 16.2 + React 19.2** — already installed. Use App Router, server components by default, `'use client'` only where state/event handlers are involved.
- **Tailwind v4** — already installed via `@tailwindcss/postcss`. Dark mode in v4 is configured via `@variant dark (&:where([data-theme="dark"], [data-theme="dark"] *))` in CSS, not via `tailwind.config.ts` — **verify** the existing CSS file at the start of Task 1.
- **Vitest 3.x is pinned** (CLAUDE.md "Known Issues") — do not bump. happy-dom + react testing-library work fine on this version.
- **`@vitejs/plugin-react` is already in devDependencies** (used implicitly via `vite-tsconfig-paths`). Component tests will need it to be wired explicitly into `vitest.config.mts`.
- **No `tests/` directory for UI yet** — component tests live next to source as `*.test.tsx`. Stay consistent with the existing `*.test.ts` convention (CLAUDE.md "Architecture").
- **localStorage in tests** — happy-dom provides it; no shim needed.

---

## Task list

| # | Task | Touches |
|---|---|---|
| 1 | shadcn init + framer-motion / next-themes / RTL deps + vitest UI config | `package.json`, `components.json`, `src/app/globals.css`, `src/lib/utils.ts`, `vitest.config.mts`, `vitest.setup.ts` |
| 2 | shadcn add `button` + `card`; tiny `Container` helper | `src/components/ui/{button,card}.tsx` (codegen), `src/components/ui/container.tsx` |
| 3 | Theme: `ThemeInitializer` + `DarkModeToggle` + dark-mode CSS contract | `src/components/theme/*`, `src/app/globals.css` |
| 4 | `getPublicConfig()` + `<ConfigProvider>` + `useConfig()` | `src/lib/config/public.ts`, `src/lib/config/{provider,context}.tsx` |
| 5 | `<FeatureGate>` component | `src/components/feature-gate.tsx`, `.test.tsx` |
| 6 | `Navigation` + `Footer` | `src/components/nav/*`, `src/components/footer/*` |
| 7 | Route groups `(app)`, `(marketing)`, `(auth)` + group layouts | `src/app/(app)/layout.tsx`, `src/app/(marketing)/layout.tsx`, `src/app/(auth)/layout.tsx`, root layout updates, redirect from `/` |
| 8 | `DecisionFlow` component (framer-motion) | `src/components/decision-flow/*`, `.test.tsx` |
| 9 | Dashboard page stub + recent-jobs panel | `src/app/(app)/dashboard/page.tsx`, `src/lib/repositories/jobs-list.ts`, `.test.ts` |
| 10 | Marketing landing stub | `src/app/(marketing)/page.tsx` |
| 11 | UI smoke test (render full app shell, navigate via testing-library) | `tests/ui-shell.smoke.test.tsx` |
| 12 | End-of-phase verify + PR + doc updates | — |

---

## Out of scope for Phase 4 (called out explicitly)

- The `/api/jobs/list` endpoint (needs to expose pg-boss state — punt to Task 9 inside the dashboard task **only if** trivial; otherwise Phase 5 with the source viewer).
- Real source / recommendation listing pages — they're empty pages in Phase 4 and get filled in Phases 5–7.
- Auth pages under `(auth)/` — group is created with a placeholder `layout.tsx` + a `404` page; real flows are Phase 8.
- Better-auth / hosted features — `<FeatureGate>` is wired but no hosted-only UI exists yet to gate.
- Animation polish, accessibility audit, keyboard-shortcut layer — Phase 10 polish.
- Server-rendered streaming UI for chat-search — Phase 6 with `ChatInterface`.

---

## Task 1 — shadcn init + UI deps + vitest UI config

**Files:**
- Modify: `package.json`
- Create: `components.json` (via `shadcn init`)
- Modify: `src/app/globals.css` (shadcn writes its CSS variable layer + Tailwind imports)
- Create: `src/lib/utils.ts` (shadcn writes `cn()` here)
- Create or modify: `vitest.config.mts`
- Create: `vitest.setup.ts`

**Step 1 — Verify current state:**

```bash
cat vitest.config.mts
cat src/app/globals.css
grep -E '"@testing-library|happy-dom|framer-motion|next-themes|class-variance-authority"' package.json || echo "(none yet)"
ls components.json 2>/dev/null && echo "shadcn already initialised" || echo "(no shadcn yet)"
```

**Step 2 — Run shadcn init non-interactively:**

```bash
pnpm dlx shadcn@latest init --yes --base-color slate --css-variables
```

If the CLI asks any prompts despite `--yes` (some versions still ask about overwriting `globals.css`), use the explicit flags as documented in shadcn-ui.com/docs/installation/next, or run interactively and pick: New York / Slate / CSS variables yes / globals.css path = `src/app/globals.css`.

**Step 3 — Install remaining UI + test deps:**

```bash
pnpm add framer-motion next-themes
pnpm add -D happy-dom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

`shadcn init` already installed `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, and `tw-animate-css`.

**Step 4 — Wire vitest for component tests:**

```ts
// vitest.config.mts — extend with the React plugin + dom env for *.test.tsx
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    setupFiles: ['./vitest.setup.ts'],
    environmentMatchGlobs: [
      ['**/*.test.tsx', 'happy-dom'],
      ['**/*.test.ts', 'node'],
    ],
  },
});
```

```ts
// vitest.setup.ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(cleanup);
```

**Step 5 — Smoke check.** `pnpm typecheck && pnpm lint && pnpm test` (no UI tests yet — must still pass). Then `pnpm build` to confirm shadcn's CSS layer doesn't break Next.js.

**Step 6 — Commit:**

```bash
git add package.json pnpm-lock.yaml components.json src/lib/utils.ts src/app/globals.css vitest.config.mts vitest.setup.ts
git commit -m "build(ui): shadcn init + framer-motion + next-themes + vitest happy-dom"
```

---

## Task 2 — Add shadcn `button` + `card`; tiny `Container` helper

**Files:**
- Create (codegen): `src/components/ui/button.tsx` (via `shadcn add button`)
- Create (codegen): `src/components/ui/card.tsx` (via `shadcn add card`)
- Create: `src/components/ui/container.tsx` + `container.test.tsx`

**Step 1:**

```bash
pnpm dlx shadcn@latest add button card --yes
```

This pulls in `@radix-ui/react-slot` and writes the two component files. They are owned code now — feel free to tweak class strings later if our visual style diverges, but resist editing them in Phase 4.

**Step 2 — Container.** shadcn doesn't ship one. Tiny:

```tsx
// src/components/ui/container.tsx
import { cn } from '@/lib/utils';

export function Container({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mx-auto w-full max-w-screen-xl px-4 sm:px-6 lg:px-8', className)} {...props}>
      {children}
    </div>
  );
}
```

Test: renders children; respects `className` override (asserts cn() merging behaviour, not specific class strings).

**Why no IconButton:** shadcn's `<Button size="icon">` covers it. Use that with `aria-label` everywhere we'd previously have written `<IconButton>`.

**Commit:**

```bash
git add src/components/ui src/components/ui/container.test.tsx
git commit -m "feat(ui): shadcn button + card primitives; Container helper"
```

---

## Task 3 — Theme

**Files:**
- Create: `src/components/theme/theme-initializer.tsx` — inline script that runs before hydration; reads localStorage `theme` and sets `class="dark"` on `<html>` (matches the attribute shadcn writes into `globals.css`).
- Create: `src/components/theme/theme-provider.tsx` — thin wrapper around `next-themes`'s `ThemeProvider` configured with `attribute="class"` and `enableSystem`.
- Create: `src/components/theme/dark-mode-toggle.tsx` + `.test.tsx` — `<Button size="icon">` cycling light → dark → system, calling `setTheme()` from `useTheme()`.
- Modify: `src/app/globals.css` — shadcn already wrote the dark-mode variant. Verify the `@custom-variant dark (&:is(.dark *));` (or v4 equivalent) is present. Don't duplicate.
- Modify: `src/app/layout.tsx` — add `suppressHydrationWarning` to `<html>` (next-themes requirement), render `<ThemeInitializer />` in `<head>`, wrap children in `<ThemeProvider>`.

**Tests:**
- `dark-mode-toggle.test.tsx`: click cycles `light → dark → system → light`. Mock `next-themes`'s `useTheme` directly via vi-mock or wrap test in a stub `<ThemeProvider>`.
- No-FOUC test: `theme-initializer.test.tsx` asserts the inline script body contains the expected `data-theme` setter (string-level assertion since we can't actually run a `<script>` tag in happy-dom).

**Commit:**

```bash
git commit -m "feat(ui): dark mode contract + DarkModeToggle (next-themes, no FOUC)"
```

---

## Task 4 — Public config + provider

**Files:**
- Create: `src/lib/config/public.ts` — `getPublicConfig(env: Env): PublicConfig` returning `{ appMode: 'local'|'hosted'; features: { auth: boolean; ownership: boolean; admin: boolean } }`. Pure function, no I/O.
- Create: `src/lib/config/provider.tsx` — `<ConfigProvider value={config}>` + `useConfig()` hook. Server component reads env once, hands the resulting JSON to a client provider.
- Create: tests for both.

**Behaviour:**
- `appMode: 'local'` → `features.auth = false`, `ownership = false`, `admin = false`.
- `appMode: 'hosted'` → all three `true`.
- `useConfig()` outside the provider throws a clear error.

**Commit:**

```bash
git commit -m "feat: getPublicConfig + ConfigProvider/useConfig for client mode-awareness"
```

---

## Task 5 — `<FeatureGate>`

**Files:**
- Create: `src/components/feature-gate.tsx` + `.test.tsx`.

**Contract:** `<FeatureGate feature="auth"|"ownership"|"admin">{children}</FeatureGate>`. Renders children when `useConfig().features[feature] === true`, otherwise renders `null`. Children prop is typed `ReactNode` so TS still typechecks the JSX even when it'll render to nothing in local mode.

**Tests:**
- Local-mode config: gate of `feature="auth"` renders `null`. Gate's children are NOT in the DOM.
- Hosted-mode config: gate's children ARE rendered.
- A nested gate respects its own feature, not its parent's.
- Useful invariant: pass an invalid feature → TS error (negative-test compile check via `// @ts-expect-error`).

**Commit:**

```bash
git commit -m "feat(ui): <FeatureGate> for hosted/local feature visibility"
```

---

## Task 6 — Navigation + Footer

**Files:**
- Create: `src/components/nav/navigation.tsx` + `.test.tsx`.
- Create: `src/components/footer/footer.tsx` + `.test.tsx`.

**Navigation contents (Phase 4 only — items grow in later phases):**
- App-name link (left).
- Links: Dashboard, Sources, Search, Chat. (Each is a placeholder route in Phase 4; pages exist but show "Coming in Phase N".)
- `<FeatureGate feature="admin">` wrapping an Admin link (renders nothing in local).
- `<DarkModeToggle>` (right).

**Tests:**
- Renders all expected links in local mode (no Admin).
- Renders Admin link when wrapped in a hosted-mode `<ConfigProvider>`.
- Active route gets the `aria-current="page"` attribute (use `usePathname()` from `next/navigation`).

**Footer:** small copyright + GitHub link. No tests beyond a render smoke.

**Commit:**

```bash
git commit -m "feat(ui): top nav + footer with mode-gated admin link"
```

---

## Task 7 — Route groups

**Files (App Router):**
- Move existing pages into `(app)/` if they exist as visible pages today. Audit at task time — Phase 0/1/2/3 added several `src/app/api/*/route.ts` (server-only) but no `page.tsx`s, so this should be a near-empty move.
- Create: `src/app/(app)/layout.tsx` — wraps children in `<Navigation>` + `<main>` + `<Footer>`.
- Create: `src/app/(marketing)/layout.tsx` — minimal marketing-page shell.
- Create: `src/app/(auth)/layout.tsx` — placeholder; renders children, no chrome.
- Create: `src/app/(marketing)/page.tsx` — landing stub (covered in Task 10).
- Create: `src/app/(app)/dashboard/page.tsx` — dashboard stub (covered in Task 9).
- Modify: `src/app/page.tsx` — server-side redirect (`redirect('/dashboard')` in local mode; `redirect('/landing')` in hosted) using `appMode` from `getPublicConfig`.

**Tests:** route-group restructuring is a structural change; the assertions are mostly via `next build` not vitest. Add one happy-dom render test of `(app)/layout.tsx` rendering its children inside the nav chrome.

**Commit:**

```bash
git commit -m "feat: (app) / (marketing) / (auth) route groups + mode-aware root redirect"
```

---

## Task 8 — DecisionFlow

**Files:**
- Create: `src/components/decision-flow/decision-flow.tsx` + `.test.tsx`.
- Create: `src/components/decision-flow/steps.ts` — declarative array of `{ id, title, body, primaryCta }`.
- Create: `src/lib/hooks/use-local-storage.ts` + `.test.ts` — tiny `useLocalStorage(key, default)` hook (no new dep).

**Contract:** First-launch flow with N steps (3 in Phase 4: "Welcome", "Upload your first document", "Search and chat"). Framer Motion `motion.div` for cross-fade between steps. Persists `decision-flow:seen` key in `localStorage`; if seen → renders `null`. Includes a "Skip" link in addition to "Next/Back".

**Tests:**
- First mount with empty localStorage renders step 1.
- "Next" advances; "Back" goes back; can't go below 1 or above N.
- "Skip" sets the seen flag and unmounts (renders `null` after).
- After re-mount with the flag set, immediately renders `null`.
- Animation classes / Framer Motion variants: assert *presence* not pixel positions (Framer's `AnimatePresence` is hard to deterministically assert on).

**Commit:**

```bash
git commit -m "feat(ui): DecisionFlow first-launch click-through (framer-motion)"
```

---

## Task 9 — Dashboard stub + recent jobs

**Files:**
- Create: `src/app/(app)/dashboard/page.tsx` — server component that fetches "recent jobs" + "recent sources" via repository helpers, then renders a `<DashboardView>` client component.
- Create: `src/lib/repositories/jobs-list.ts` + `.test.ts` — `listRecentJobs(ctx, { limit })` querying `pgboss.job` (read-only).
- Create: `src/components/dashboard/dashboard-view.tsx` + `.test.tsx`.

**Contract:**
- `listRecentJobs` returns the last 20 jobs across all queues with `{ id, name, state, createdOn, completedOn? }`. Sorted by `createdOn DESC`. Auth filter: in hosted mode, intersect with sources the viewer can see; in local mode (system ctx), all jobs. Phase 4 implements local-mode only and adds a TODO for the hosted intersect (a 4-line follow-up).
- `<DashboardView>` shows two cards side-by-side at md+ breakpoints: "Recent jobs" and "Recent sources". Each row has a status pill and a "View" button (link disabled in Phase 4 — Phase 5 wires the source viewer).
- DecisionFlow renders ABOVE the dashboard cards on first launch.

**Tests:**
- `jobs-list.test.ts` (Testcontainers): seed pg-boss with three jobs in different states, assert `listRecentJobs` returns them in expected order with right shape.
- `dashboard-view.test.tsx`: fed mock job/source arrays, renders both cards; empty arrays show "No jobs yet" / "No sources yet".

**Commit:**

```bash
git commit -m "feat(ui): dashboard stub with recent jobs + sources cards"
```

---

## Task 10 — Marketing landing stub

**Files:**
- Create: `src/app/(marketing)/page.tsx` — minimal hero section + "Get started" CTA. Hidden in local mode (the root redirect skips it). 30 lines max.

**Tests:** snapshot-free render test — H1 contains the product name, CTA button is present.

**Commit:**

```bash
git commit -m "feat(ui): marketing landing stub for hosted mode"
```

---

## Task 11 — UI shell smoke test

**Files:**
- Create: `tests/ui-shell.smoke.test.tsx`.

**Behaviour:** mount the dashboard page in happy-dom (server component → call its async function → render the returned JSX inside a `<ConfigProvider>` + `<ThemeProvider>` test wrapper). Assert:
- Top nav renders all expected items.
- DarkModeToggle is present.
- DecisionFlow renders on first paint (since localStorage is fresh).
- Clicking the toggle calls `setTheme` (spy).
- Skipping DecisionFlow then re-rendering: DecisionFlow is gone.

This is the closest thing to "open a browser and click around" without adding Playwright. If the assertions feel too narrow, we add a `tests/playwright/` Phase-10 task; until then this earns its keep.

**Commit:**

```bash
git commit -m "test(ui): app-shell smoke covering nav + theme + DecisionFlow"
```

---

## Task 12 — End-of-phase verify + PR

```bash
pnpm verify
docker compose down -v
docker compose up -d
curl -fsS http://localhost:3000/ -o /dev/null -w "%{http_code}\n"  # expect 200
docker compose down
```

Open PR. Update PLAN.md (tick Phase 4, set Phase 5 current), STATE.md (move marker), `docs/changelog.md` (Phase 4 entry: "app shell + nav + dark mode + DecisionFlow + feature gates"), `docs/.docs-state.json` post-merge.

Squash-merge when CI green.

---

## Carry-overs / flags to watch

- `next-themes` ships its own SSR-safe initializer; if its inline script ever conflicts with our `ThemeInitializer`, drop ours.
- Component testing harness uses happy-dom (not jsdom). If a component reaches into APIs happy-dom doesn't implement (rare — `IntersectionObserver`, `MutationObserver` edge cases), we shim per-test rather than swap globally.
- `<FeatureGate>` returning `null` keeps the React tree shape stable but doesn't reduce bundle size for hosted-only code in local mode. Phase 8 adds a build-time switch to tree-shake hosted bundles further; Phase 4 doesn't optimise that path.
- DecisionFlow's "seen" flag is `localStorage`-backed. If a future Phase 8 user logs in to a different account on the same browser, they'll skip the flow. Acceptable for v1; a per-user server-side flag is Phase 8 work.
- The dashboard's "recent jobs" query reads `pgboss.job` directly. If pg-boss bumps its schema (e.g., to v13 with renamed columns), we'll need to update the column list in `listRecentJobs`. Pin pg-boss in package.json explicitly.
