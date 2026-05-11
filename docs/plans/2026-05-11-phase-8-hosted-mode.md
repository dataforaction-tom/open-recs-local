# Phase 8 — Hosted-mode auth, ownership, and admin

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** With `APP_MODE=hosted`, users can sign up (email + password OR magic link), log in, upload sources flagged as private that only they can see; admins can approve ownership requests on existing private sources and assign roles. Local mode (`APP_MODE=local`) keeps working unchanged — no auth, no login screen, no admin nav. The same code, two surfaces.

**Architecture:**

- **Better-auth + Drizzle adapter.** Better-auth manages the `users`, `sessions`, `accounts`, and `verifications` tables. Schema lives in our Drizzle file (single source of truth) using the table shapes Better-auth expects; `pnpm db:migrate` applies them just like any other migration. Roles do *not* live on the Better-auth user — they go in our own `user_roles` table so the role concept stays portable across auth libs.
- **`BetterAuthProvider` implements the existing `AuthContext` interface.** `getContext(req)` reads the Better-auth session cookie, looks up the user + their role(s), returns `{ user, roles, isSystem: false }`. No Next middleware required — the inline validation on every request keeps the runtime story simple (server components and route handlers each get a fresh context).
- **Email provider abstraction.** A new `EmailProvider` interface (`send({ to, subject, html, text })`) with a console-logger fake. Better-auth's password-reset and magic-link emails route through it. Real backends (Resend, SMTP) slot in via env in Phase 10. Hosted mode boots fine on the stub — operators see the reset URLs in the logs until they configure a real sender.
- **First-signup-becomes-admin bootstrap.** On post-signup, if `user_roles` is empty, grant `admin` to the new user. Documented one-shot behaviour; subsequent signups default to `viewer`.
- **Magic-link** is the second auth method, alongside email/password — uses Better-auth's `magicLink` plugin. The same `EmailProvider` carries it.
- **Mode flip is one env var (`APP_MODE`)** — already wired through the provider factory and `<FeatureGate>`. Phase 8 just wires the hosted slot of `selectAuth` to `BetterAuthProvider` (currently throws), populates the auth nav + landing redirect via the existing config flags, and lights up the (auth) and /admin route groups.
- **Ownership requests** map to the existing `ownership_requests` table (Phase 1 schema). Logged-in users on a private source they don't own see a "Request access" form; admins see the queue at /admin with approve/reject. Approval flips `sources.owner_user_id` to the requester. Rejected requests can't be undone in v1; the requester can `withdraw` their own pending request.
- **Admin dashboard** at `/admin` (gated by `feature: admin`): ownership-request queue + per-user role assignment table + a link to the existing recent-jobs card. Lives in `(app)/` because admins need the full app shell.

**Tech stack — new tooling at Task 1 (approval-gated):**

- `better-auth` + the `magic-link` plugin. Drizzle adapter is built in.
- shadcn additions if needed: `dialog` (admin confirm modals), `dropdown-menu` (user menu in nav). Default: only add if a task actually requires them.
- No new email lib in Phase 8 — the stub `EmailProvider` writes to `console.log`.

**Out of scope for Phase 8 (called out explicitly):**

- **Real email delivery.** The `EmailProvider` ships with a console-logging fake only. A `ResendEmailProvider` or `SmtpEmailProvider` lands in Phase 10 polish. Operators see reset / magic-link URLs in logs in the meantime.
- **OAuth (Google/GitHub).** Email + password and magic link cover the v1 parity surface. OAuth adds per-provider client config that pushes burden onto self-hosters; revisit if requested.
- **Two-factor auth.** Stretch goal, not in v1 scope.
- **Account deletion / GDPR data export.** Phase 10 polish.
- **Audit log of admin actions** (who approved which ownership request when). Belongs with hosted-mode telemetry; defer.
- **Multi-tenancy / per-organisation isolation.** This is a single-tenant hosted instance. Multi-org is a 2.0 conversation.
- **Edit / delete of progress updates by author or admin** (Phase 7 carry-over). Now possible since real user IDs land — but the UI work is its own slice. List as a fast-follow if you want it in Phase 8; otherwise Phase 9 polish.
- **Email rate limiting.** No protection against signup floods. Phase 10 ops hardening.

---

## Phase 8 exit criteria

1. Boot with `APP_MODE=hosted`, navigate to `/`, get the marketing landing. Click "Sign up", create an account with email + password — land on `/dashboard` authenticated. The first such user is `admin`; subsequent signups default to `viewer`.
2. Sign out → `/login` works. Log back in. The "Forgot password" flow logs a reset URL to the console; pasting that URL into the browser lands on `/reset-password?token=…` and a new password works.
3. The "Sign in with magic link" flow on `/login` logs a sign-in URL to the console; pasting it into the browser lands signed in.
4. Upload a source with `is_private=true` while signed in — it appears in your dashboard. Sign out, log in as a different user, navigate to `/sources/<slug>` for that source — get a "Request access" page (404-equivalent; visibility filter hides the body). Click Request, submit the note. Sign in as admin, navigate to `/admin`, see the request, click Approve. Sign back in as the requester — the source is now visible.
5. The admin dashboard `/admin` shows: ownership-request queue (pending), per-user role table with inline role select, recent jobs widget.
6. With `APP_MODE=local` (the existing default), `/login`, `/signup`, `/admin`, "Request access", and any auth-related nav links are absent. The existing local-mode flow is unchanged. `pnpm verify` green for both modes.
7. `pnpm verify` green: typecheck, lint, all tests, Next.js build. New tests: schema (users + sessions + user_roles), `BetterAuthProvider` (session → context), first-admin bootstrap, ownership-request repo (create + approve + reject + withdraw), the auth pages (form behaviours under mocked Better-auth), `/admin` page composition, plus a Playwright E2E that exercises signup → private upload → ownership request → admin approve.

---

## Preflight facts (resolve at plan time, then re-check during Task 1)

- **Schema scaffolding:** none of `users`, `sessions`, `accounts`, `verifications`, `user_roles` exist yet. The other Phase 1 tables already include uuid-typed `owner_user_id` / `set_by_user_id` / `author_user_id` / `resolved_by` columns with **no FKs** — wire FKs in this phase's migration so the Phase 8 user table actually constrains them.
- **`AuthProvider` interface:** in place at `src/lib/providers/auth/types.ts`. Single shape (`{ user, roles, isSystem }`) covers both modes. `getContext(req)` is the only method.
- **Provider factory:** `selectAuth` currently throws when `APP_MODE === 'hosted'`. Wire `BetterAuthProvider` into that branch at Task 5.
- **Env schema:** `BETTER_AUTH_SECRET` (≥32 chars) and `BETTER_AUTH_URL` are already required for hosted mode — no env changes needed. Local mode does not require them.
- **`<FeatureGate>` flags:** `auth`, `ownership`, `admin` are already plumbed via `getPublicConfig` and the `<ConfigProvider>`. Phase 8 wraps existing nav + new admin/auth links with `<FeatureGate>` rather than introducing a new flag system.
- **Route groups:** `(auth)/layout.tsx` exists as a placeholder; `(app)/` and `(marketing)/` already do their jobs. `/admin` is a new page inside `(app)/`.
- **Test infra:** Testcontainers + Drizzle migrations work cleanly. Component tests use Vitest + Testing Library. E2E tests are not yet in the codebase — Phase 8 introduces Playwright (its own approval gate at Task 8). If introducing Playwright pulls too much chrome, we can fall back to Vitest + happy-dom for the smoke flow and defer Playwright to Phase 10 (where the master plan already has it scoped).
- **Local-mode user.id:** the `localAuth` provider returns `user.id = 'system'` (literal string, not a uuid). Phase 7 wrote `NULL` for the various `*_user_id` columns when the id wasn't a uuid; that pattern continues to work after Phase 8's FKs land — `NULL` satisfies a `references(...)` constraint.
- **Better-auth's Drizzle adapter** generates table shapes that we'll embed in `src/lib/db/schema.ts`. Pin the Better-auth version at Task 1 so we control the schema rather than letting it drift; re-pin only on a deliberate upgrade.

---

## Task list

| # | Task | Touches |
|---|---|---|
| 1 | Approval-gated deps + Drizzle migration: `users`, `sessions`, `accounts`, `verifications`, `user_roles`; FKs on the existing `*_user_id` columns | `package.json`, `src/lib/db/schema.ts`, `src/lib/db/migrations/000X_*.sql`, `src/lib/db/schema.test.ts` |
| 2 | `EmailProvider` interface + console-logger fake + factory + tests | `src/lib/providers/email/{types,fake,index}.ts`, `.test.ts`, `src/lib/providers/index.ts` |
| 3 | Better-auth config (Drizzle adapter, email+password + magic-link plugin, post-signup first-admin hook) | `src/lib/auth/config.ts`, `.test.ts`, `src/app/api/auth/[...all]/route.ts` |
| 4 | `BetterAuthProvider` behind `AuthContext` + factory wire-up + tests | `src/lib/providers/auth/better-auth.ts`, `.test.ts`, `src/lib/providers/index.ts` |
| 5 | `userRoles` repo helpers (`getRoles`, `assignRole`) + first-admin guard test | `src/lib/repositories/user-role.ts`, `.test.ts` |
| 6 | Auth pages: `/login`, `/signup`, `/magic-link`, `/forgot-password`, `/reset-password`, `/profile` + nav user menu | `src/app/(auth)/{signup,login,magic-link,forgot-password,reset-password}/page.tsx`, `src/app/(app)/profile/page.tsx`, `src/components/nav/user-menu.tsx`, tests |
| 7 | Ownership request UI + repo + server actions + page wiring | `src/lib/repositories/ownership-request.ts`, `.test.ts`, `src/app/(app)/sources/[slug]/{actions,request-access.tsx}.ts`, source-page wiring |
| 8 | Admin dashboard `/admin`: ownership queue + role assignment table + jobs widget link | `src/app/(app)/admin/page.tsx`, components, tests |
| 9 | E2E: Playwright (or Vitest+happy-dom fallback) for the full hosted flow + local-mode-only `/login` 404 check | `tests/hosted-mode.e2e.ts`, `playwright.config.ts` (if Playwright path) |
| 10 | Smoke + verify + PR + doc updates (PLAN, STATE, changelog, README) | `PLAN.md`, `STATE.md`, `docs/changelog.md`, `README.md` |

---

## Task 1 — Deps + schema migration

**Approval gate:** before `pnpm add`, confirm with the user. Pre-confirmed in planning: `better-auth` plus its `magic-link` plugin (which may ship in the main package). Resolve `@latest` and pin at install time; flag deltas if the major has changed since this plan was written.

**Steps:**

```bash
pnpm add better-auth
# magic-link plugin may be in-package or a separate import; confirm at install
```

Add Drizzle table definitions (using Better-auth's expected shape):

- `users(id uuid pk default randomUUID, email text unique not null, emailVerified boolean default false, name text, image text, createdAt timestamptz default now, updatedAt timestamptz default now)`
- `sessions(id uuid pk, userId uuid references users.id on delete cascade, token text unique not null, expiresAt timestamptz not null, ipAddress text, userAgent text, createdAt timestamptz default now)`
- `accounts(id uuid pk, userId uuid references users.id on delete cascade, providerId text not null, accountId text not null, password text, accessToken text, refreshToken text, expiresAt timestamptz, createdAt timestamptz default now, ...)` — Better-auth's columns; copy the shape from its docs at install time.
- `verifications(id uuid pk, identifier text not null, value text not null, expiresAt timestamptz not null, createdAt timestamptz default now)`
- `userRoles(userId uuid references users.id on delete cascade, role text not null check role in ('admin', 'editor', 'viewer'), grantedAt timestamptz default now, primary key(userId, role))`

Then **add FKs** on the existing nullable user-id columns:

- `sources.owner_user_id` → `users.id` on delete `set null`
- `recommendation_statuses.set_by_user_id` → `users.id` on delete `set null`
- `progress_updates.author_user_id` → `users.id` on delete `set null`
- `ownership_requests.resolved_by` → `users.id` on delete `set null`

Test: extend `src/lib/db/schema.test.ts` to assert the new tables and the new FKs exist after `applyMigrations`.

**Commit:**

```bash
git commit -m "build: better-auth dep + users/sessions/accounts/user_roles schema"
```

---

## Task 2 — `EmailProvider` interface + console-logger fake

**Files:**
- New: `src/lib/providers/email/types.ts` — `EmailProvider.send({ to, subject, html, text }): Promise<void>`.
- New: `src/lib/providers/email/console.ts` — logs the email to stdout in a copy-pastable format (`To:`, `Subject:`, `URL:` extracted from the body if present).
- New: `src/lib/providers/email/index.ts` — re-exports.
- Modify: `src/lib/providers/index.ts` — add `email: EmailProvider` to the `Providers` type, default to the console fake; future env switch (`EMAIL_PROVIDER=resend|smtp`) is a Phase 10 hook.
- New: `src/lib/providers/email/console.test.ts` — assert the stdout shape.

**Commit:**

```bash
git commit -m "feat(providers): EmailProvider interface + console-logger fake"
```

---

## Task 3 — Better-auth config + catch-all route

**Files:**
- New: `src/lib/auth/config.ts` — exports `auth = betterAuth({...})` with the Drizzle adapter pointed at our Drizzle client, email+password enabled, the magic-link plugin registered, and a `sendResetPassword` / `sendMagicLink` hook calling our `EmailProvider`. Includes a post-signup hook: if `user_roles` is empty, insert `(userId, 'admin')`; otherwise insert `(userId, 'viewer')`.
- New: `src/app/api/auth/[...all]/route.ts` — Next.js catch-all that hands GET/POST off to `auth.handler(req)`. Standard Better-auth wiring.
- New: `src/lib/auth/config.test.ts` — Testcontainers test that exercises signup → second signup, asserts the role assignments, and confirms a session row gets written.

**Commit:**

```bash
git commit -m "feat(auth): better-auth config (email+password + magic link + first-admin)"
```

---

## Task 4 — `BetterAuthProvider` + factory wire-up

**Files:**
- New: `src/lib/providers/auth/better-auth.ts` — implements `AuthProvider`. `getContext(req)` calls Better-auth's session-from-headers helper, returns `{ user: { id, email, name }, roles: [...], isSystem: false }` when present, or a `{ user: { id: 'anonymous' }, roles: [], isSystem: false }` shape when absent (the repo layer's auth filter already handles "no real user → only public").
- Modify: `src/lib/providers/auth/types.ts` — verify the existing shape is compatible. May need an `isAnonymous` flag if "no session" needs distinguishing from "real user with no roles". Decide at implementation time.
- Modify: `src/lib/providers/index.ts` — `selectAuth` returns `betterAuth` for hosted mode (currently throws).
- New: `src/lib/providers/auth/better-auth.test.ts` — uses Testcontainers + a real Better-auth signup to verify the cookie → context round trip.

**Commit:**

```bash
git commit -m "feat(auth): BetterAuthProvider + hosted-mode factory branch"
```

---

## Task 5 — `userRoles` repo helpers

**Files:**
- New: `src/lib/repositories/user-role.ts` + `.test.ts`.
- `getRoles(ctx, userId): Promise<Role[]>`
- `assignRole(ctx, userId, role): Promise<void>` — admin-only (caller checks `ctx.roles.includes('admin')`)
- `revokeRole(ctx, userId, role): Promise<void>` — admin-only
- `listUsersWithRoles(ctx): Promise<Array<{ id, email, name, roles: Role[] }>>` — admin-only, used by /admin

The first-admin bootstrap lives in the Better-auth post-signup hook (Task 3), not here. This repo is the regular CRUD surface.

**Commit:**

```bash
git commit -m "feat: userRoles repo helpers"
```

---

## Task 6 — Auth pages + nav user menu

**Files:**
- New: `(auth)/{signup,login,magic-link,forgot-password,reset-password}/page.tsx`. RHF + Zod for each.
- New: `(app)/profile/page.tsx` — shows email, name, role(s), sign-out button. `<FeatureGate feature="auth">` around the nav link.
- New: `src/components/nav/user-menu.tsx` — shadcn `dropdown-menu` (add at Task 6 if not yet present). Replaces the existing nav's logged-out state with a "Sign in" link in hosted mode.
- Modify: `src/components/nav/navigation.tsx` — render the user menu when `feature.auth` is on.
- Tests: form-level for each page (mock `auth.signIn.email`, etc.); navigation test for the user menu.

**Commit:**

```bash
git commit -m "feat(ui): hosted-mode auth pages (signup, login, magic-link, reset, profile)"
```

---

## Task 7 — Ownership requests

**Files:**
- New: `src/lib/repositories/ownership-request.ts` + `.test.ts`.
  - `createOwnershipRequest(ctx, { sourceId, requesterEmail, requesterName, note })`
  - `listPendingOwnershipRequests(ctx)` — admin-only
  - `approveOwnershipRequest(ctx, id)` — admin-only; flips `sources.owner_user_id` and `ownership_requests.status='approved'`
  - `rejectOwnershipRequest(ctx, id, note?)` — admin-only
  - `withdrawOwnershipRequest(ctx, id)` — requester-only
- New: `src/app/(app)/sources/[slug]/actions.ts` — server actions wrapping the four writes.
- Modify: `src/app/(app)/sources/[slug]/page.tsx` — when the rec is invisible (returns null) but the user is signed in, render `<RequestAccessForm>` instead of a 404.
- New: `src/components/sources/request-access-form.tsx` — RHF + Zod, `<FeatureGate feature="ownership">`.
- Tests: repo Testcontainers, form Vitest+Testing Library.

**Commit:**

```bash
git commit -m "feat: ownership request flow (create + admin approve/reject)"
```

---

## Task 8 — Admin dashboard

**Files:**
- New: `src/app/(app)/admin/page.tsx`. `<FeatureGate feature="admin">` at the page level; server-side auth check returns 404 for non-admins (don't leak the route).
- New: `src/components/admin/ownership-queue.tsx` — table of pending requests with Approve/Reject buttons (server actions from Task 7).
- New: `src/components/admin/role-table.tsx` — list users with an `<EditableSelectCell>` for role (reuses Phase 7's primitive).
- New: `src/components/admin/jobs-widget.tsx` — links to the existing recent-jobs card, no new data.
- Tests: page-level smoke + per-component.

**Commit:**

```bash
git commit -m "feat(ui): /admin dashboard (ownership queue + role table + jobs widget)"
```

---

## Task 9 — E2E

**Approval gate:** Playwright introduces a sizeable test runner footprint. Confirm with the user before installing — alternative is a Vitest + happy-dom flow that mocks the Better-auth handler and exercises the page composition. Defer the real browser E2E to Phase 10 if Playwright is too heavy here.

**Files (Playwright path):**
- New: `playwright.config.ts`
- New: `tests/e2e/hosted-mode.spec.ts` — full flow: signup → upload private source → log in as second user → request access → admin approves → second user sees source.
- New: `tests/e2e/local-mode.spec.ts` — confirm `/login`, `/signup`, `/admin` 404 in local mode.

**Files (fallback path):**
- New: `tests/hosted-mode.smoke.test.tsx` — Vitest + happy-dom rendering the auth pages with mocked Better-auth, verifying the signup form flow end-to-end through to the dashboard redirect.

**Commit:**

```bash
git commit -m "test: hosted-mode E2E (auth → upload → ownership → approve)"
```

---

## Task 10 — Smoke, verify, PR, docs

**Files:**
- Modify: `PLAN.md`, `STATE.md`, `docs/changelog.md`.
- Modify: `README.md` — hosted-mode setup section: env vars, first-signup-becomes-admin behaviour, where reset/magic-link URLs go (logs).

`pnpm verify` → push → PR → squash-merge.

---

## Carry-overs / flags to watch

- **Real email delivery** — Phase 10 ships `ResendEmailProvider` and/or `SmtpEmailProvider` behind an `EMAIL_PROVIDER` env switch.
- **Edit / delete of progress updates** — now possible (real user IDs land); Phase 9 polish or fast-follow.
- **Audit log of admin actions** — Phase 9 / 10.
- **Account deletion / GDPR data export** — Phase 10 polish.
- **OAuth providers (Google / GitHub)** — opt-in, keep in mind for a 1.x.
- **2FA** — explicit non-goal for v1.
- **Email rate limiting** — Phase 10 ops hardening.
- **`prose` styling** still uninstalled (`@tailwindcss/typography`) — long-running Phase 5 carry-over; install when markdown styling actually matters.
- **`?status=` filter on the recommendations index** — Phase 7 carry-over; one-line addition once needed.
- **NetworkViz** — Phase 9, alongside analytics canvas tooling.
