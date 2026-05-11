# Phase 7 — Progress updates implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stakeholders can post progress updates against a recommendation — `progress_notes`, `evidence_type`, `evidence_url`, `user_progress_rating` — and transition the recommendation's status (`open → in_progress → done | blocked | withdrawn`) without leaving the detail page. The Progress tab on `/recommendations/[id]` (currently an empty-state stub) renders the time series of updates plus the current status. The recommendations table grows a Status column backed by an inline `<EditableSelectCell>` so the same status writes are reachable from the index.

**Architecture:**

- **Writes are server actions, not REST routes.** Progress-update creation and status transitions are local-form actions invoked by the Progress tab and the table. Following Phase 6's pattern (server components calling services directly, no internal HTTP), forms target server actions in `src/app/(app)/recommendations/[id]/actions.ts`. Both actions revalidate `/recommendations/[id]` and `/recommendations` paths so the new row appears without a manual reload. No external HTTP surface for these — external integrations would call the repository functions or future hosted-mode endpoints.
- **Reads ride the existing detail-page server component.** When `/recommendations/[id]` renders, it loads progress updates, the latest status, and the evidence/rating taxonomies in parallel with the existing `findRecommendationById` + `findSimilarRecommendations` calls. The Progress tab receives this data already populated — no client fetch.
- **Latest-status surface is a single SQL helper** — `getLatestStatuses(ctx, recIds)` — using a `DISTINCT ON (recommendation_id) … ORDER BY created_at DESC` pattern. Used both per-rec on the detail page and batched on the table. No materialised view, no Drizzle relation magic; one function, two call sites.
- **Form state uses `react-hook-form` + Zod resolver.** Same Zod schema validates the form on the client and again inside the server action — single source of truth for the shape. The taxonomy `<Select>` options come from the seeded `evidence_types` and `progress_ratings` tables (loaded server-side, passed as props).
- **`<EditableSelectCell>`** is a small TanStack-Table cell that renders as the current status badge by default, expands to a `<Select>` on click, and on change calls the same `appendStatus` server action. Optimistic update via `useTransition`; rolls back on error.

**Tech stack — new tooling at Task 1 (approval-gated):**

- `react-hook-form@^7` — form state. Pairs with the existing Zod via `@hookform/resolvers/zod`.
- `@hookform/resolvers@^3` — the Zod adapter only.
- shadcn additions: `select`, `textarea`, `label`. Status badge reuses the existing `badge` from Phase 6.

**Out of scope for Phase 7 (called out explicitly):**

- **Edit / delete of existing updates.** Create + list only. Edit needs role-aware authorization (own vs. admin), which belongs with hosted mode in Phase 8. Local mode shipping without edit is an acceptable temporary limitation — the worst case is "post a second update correcting the typo".
- **Soft-delete of statuses.** `recommendation_statuses` is append-only; "undoing" a status is itself a new transition.
- **Notification on update.** No email / digest. Phase 8+ once auth + email are wired.
- **File attachments for evidence.** `evidence_url` is a free-text field for a URL or storage-path string. Direct uploads on the form would re-use the StorageProvider — punted to Phase 10 polish.
- **Server-Sent live updates.** Progress lists are SSR per navigation; no LISTEN/NOTIFY plumbing for this surface (the SSE infrastructure is reserved for job progress).
- **Aggregate analytics over progress updates.** Belongs in Phase 9 (`SourceAnalytics` cadence chart).
- **Filtering the recommendations table by status.** The Status column is read-write but not filterable in this phase — the URL-driven filter set stays at `q + source + theme + mode`. A `?status=` filter is a one-line follow-up once the column is in place.

---

## Phase 7 exit criteria

1. Open `/recommendations/[id]` and post a progress update via the form: the list above the form shows the new entry without a hard reload.
2. The Progress tab also exposes a status transition control. Changing the status writes a row to `recommendation_statuses` and the displayed "current status" badge updates.
3. The `/recommendations` table renders a Status column. Each cell shows the latest status as a badge; clicking opens an inline select; choosing a new status posts the transition and the cell rerenders to the new value.
4. Form validation rejects empty `progress_notes`, evidence_type values not in the taxonomy, ratings not in the taxonomy, and `evidence_url` longer than 2048 chars. Errors surface inline; the server action mirrors the validation.
5. `pnpm verify` green: typecheck, lint, all tests, Next.js build. New tests:
   - `getLatestStatuses` Testcontainers test — covers single rec, batched, no-status fallback (=`open`).
   - `createProgressUpdate` + `appendStatus` repo tests with auth filter coverage.
   - `<ProgressUpdateForm>` component test — renders, validates, submits.
   - `<ProgressUpdatesList>` component test — renders empty + populated states.
   - `<EditableSelectCell>` test — click → select → action call.
6. CI green; the seeded fixture corpus on the dev box shows the table-status column populated and the detail page form working end-to-end.

---

## Preflight facts (resolve at plan time, then re-check during Task 1)

- **Schema is already in place from Phase 1.** No new migrations.
  - `recommendation_statuses(id, recommendation_id, status, note, set_by_user_id, created_at)` indexed on `(recommendation_id, created_at)`.
  - `progress_updates(id, recommendation_id, progress_notes, evidence_type, evidence_url, user_progress_rating, author_user_id, created_at)` indexed on `(recommendation_id, created_at)`.
  - `evidence_types(slug, name)` and `progress_ratings(slug, name, weight)` seeded by `seed.ts` from `seeds/taxonomy.ts`.
- **`REC_STATUS` enum** = `['open', 'in_progress', 'done', 'blocked', 'withdrawn']` (`src/lib/db/schema.ts:88`). Use this constant; don't re-declare strings in the form.
- **`set_by_user_id` and `author_user_id`** are uuid columns with **no FK** (Phase 8 will wire them when Better-auth lands). Local mode passes `NULL` — the existing `RepoContext.auth.user?.id` is undefined in local. The repo functions accept the optional uuid and write `NULL` cleanly.
- **No status row → status is `'open'`.** A freshly-created recommendation has no `recommendation_statuses` row. The latest-status helper must return `'open'` (the seed default for the enum) rather than `null` so the table cell always has something to render.
- **Auth filter.** Both repo functions (`createProgressUpdate`, `appendStatus`, `getLatestStatuses`, `listProgressUpdates`) gate by the source's visibility via `findRecommendationById` (already auth-checked) — i.e. the rec has to be readable before any progress write/read is attempted. No new SQL auth idiom.
- **Taxonomy fetch.** `evidence_types` and `progress_ratings` rarely change; the detail page loads them once per render. No caching layer needed in Phase 7 — premature optimisation.
- **Path revalidation.** Server actions call `revalidatePath('/recommendations/[id]', 'page')` and `revalidatePath('/recommendations', 'page')` after a successful write so the table and detail page both refresh on the next navigation tick.
- **`<EditableSelectCell>` lives on a client TanStack-Table.** The server action returns `{ ok: true }` or `{ ok: false, error }`; the cell flips back to the previous status on error and surfaces a toast (existing toast pattern in `src/components/ui/sonner.tsx` if shadcn-installed; otherwise inline error chip).

---

## Task list

| # | Task | Touches |
|---|---|---|
| 1 | Approval-gated deps + shadcn additions: `react-hook-form`, `@hookform/resolvers`, shadcn `select`/`textarea`/`label` | `package.json`, `src/components/ui/{select,textarea,label}.tsx` |
| 2 | `getLatestStatuses` SQL helper + Testcontainers test | `src/lib/repositories/recommendation-status.ts`, `.test.ts` |
| 3 | `createProgressUpdate` + `listProgressUpdates` + `appendStatus` repo functions + tests | `src/lib/repositories/progress-update.ts`, `recommendation-status.ts`, tests |
| 4 | Server actions for the above + Zod schema shared with the form | `src/app/(app)/recommendations/[id]/actions.ts`, `src/lib/validation/progress-update.ts` |
| 5 | `<ProgressUpdateForm>` (RHF + Zod) + tests | `src/components/progress/progress-update-form.tsx`, `.test.tsx` |
| 6 | `<ProgressUpdatesList>` + `<StatusBadge>` + tests | `src/components/progress/progress-updates-list.tsx`, `status-badge.tsx`, tests |
| 7 | Wire Progress tab on the detail page: load updates + statuses + taxonomies, render list + form + status control | `src/app/(app)/recommendations/[id]/page.tsx` |
| 8 | `<EditableSelectCell>` + Status column on the table; surface latest-status batch on the index page | `src/components/recommendations/editable-select-cell.tsx`, `recommendations-table.tsx`, `recommendations/page.tsx` |
| 9 | Smoke + end-of-phase verify + PR + doc updates | `tests/progress-updates.smoke.test.tsx`, `PLAN.md`, `STATE.md`, `docs/changelog.md` |

---

## Task 1 — Dependencies + shadcn additions

**Approval gate:** before `pnpm add`, confirm with the user. CLAUDE.md "Don't add dependencies without asking." (Pre-confirmed in the planning conversation: `react-hook-form` is in.)

**Steps:**

```bash
pnpm add react-hook-form @hookform/resolvers
pnpm dlx shadcn@latest add select textarea label --yes
```

shadcn `sonner` (toast) is optional — only add if Task 8 needs it. Default: skip; surface errors inline.

**Commit:**

```bash
git commit -m "build(ui): react-hook-form + shadcn select/textarea/label"
```

---

## Task 2 — `getLatestStatuses` SQL helper

**Files:**
- New: `src/lib/repositories/recommendation-status.ts`
- New: `src/lib/repositories/recommendation-status.test.ts`

**Function:** `getLatestStatuses(ctx, recIds: string[])` returns `Map<string, { status: RecStatus; setAt: Date; note: string | null }>`. For each recId, returns the most-recent row from `recommendation_statuses`. Recs with no status default to `{ status: 'open', setAt: <rec.created_at>, note: null }` — but the helper does not look up the rec; the caller handles the fallback (passing the recommendation list it already has).

**Single-rec convenience wrapper:** `getLatestStatus(ctx, recId)` calls `getLatestStatuses(ctx, [recId])` and returns the single value (or the default).

**SQL:**

```sql
SELECT DISTINCT ON (recommendation_id)
  recommendation_id::text AS "recId",
  status,
  note,
  created_at AS "setAt"
FROM recommendation_statuses
WHERE recommendation_id = ANY($1::uuid[])
ORDER BY recommendation_id, created_at DESC;
```

UUID validation: filter `recIds` through `UUID_RE` before binding; reject the call with an `Error('invalid uuid')` if any fail (consistent with existing repo patterns).

**Tests:** Testcontainers; cover (a) single rec with two history rows returns the most recent, (b) batch of three recs with mixed history returns one entry each, (c) recs without history are absent from the map (so the caller knows to fall back), (d) auth gate — a private rec the viewer can't see is not returned (delegate to the same auth check used by `findRecommendationById`; if simpler, document that this helper trusts the caller and is never called for unfiltered recIds).

**Commit:**

```bash
git commit -m "feat: getLatestStatuses repo helper"
```

---

## Task 3 — `createProgressUpdate`, `listProgressUpdates`, `appendStatus`

**Files:**
- New: `src/lib/repositories/progress-update.ts` + `.test.ts`
- Modify: `src/lib/repositories/recommendation-status.ts` — add `appendStatus`.

**`createProgressUpdate(ctx, input)`:** input is `{ recommendationId, progressNotes, evidenceType?, evidenceUrl?, userProgressRating? }`. Calls `findRecommendationById` first to enforce the auth filter (returns `{ ok: false, error: 'not_found' }` on miss). Inserts a row with `authorUserId = ctx.auth.user?.id ?? null`. Returns `{ ok: true, id, createdAt }`.

**`listProgressUpdates(ctx, recommendationId)`:** Auth-checks via `findRecommendationById` then SELECTs all updates for the rec, newest first, joining `evidence_types` and `progress_ratings` for the display name. Returns `Array<{ id, createdAt, progressNotes, evidenceType: { slug, name } | null, evidenceUrl: string | null, userProgressRating: { slug, name, weight } | null, authorUserId: string | null }>`.

**`appendStatus(ctx, input)`:** input is `{ recommendationId, status: RecStatus, note? }`. Auth-checks. Inserts a row into `recommendation_statuses` with `setByUserId = ctx.auth.user?.id ?? null`. Returns `{ ok: true, id, status, setAt }`.

**Tests:** Testcontainers; per function:
- Create: happy path; rejects when rec is invisible to the viewer; rejects on Zod failure (caller's responsibility, but assert the function trusts shape since validation is the action layer).
- List: returns rows newest-first; returns empty array for rec with no updates; auth filter excludes private siblings.
- Append status: writes the row; honours `setByUserId = NULL` in local mode; rejects unknown status (Drizzle enum check).

**Commit:**

```bash
git commit -m "feat: createProgressUpdate + listProgressUpdates + appendStatus"
```

---

## Task 4 — Server actions + shared Zod schema

**Files:**
- New: `src/lib/validation/progress-update.ts` — `ProgressUpdateInput` Zod schema (see below).
- New: `src/lib/validation/status-transition.ts` — `StatusTransitionInput` Zod schema.
- New: `src/app/(app)/recommendations/[id]/actions.ts` — `'use server'` actions wrapping the repo functions.

**`ProgressUpdateInput` schema:**

```ts
z.object({
  recommendationId: z.string().uuid(),
  progressNotes: z.string().trim().min(1, 'Add a brief progress note').max(4000),
  evidenceType: z.string().min(1).max(64).optional(),
  evidenceUrl: z.string().trim().max(2048).optional(),
  userProgressRating: z.string().min(1).max(64).optional(),
});
```

`evidenceUrl` is intentionally not `.url()` — the field is documented as a "url or path-style reference" so the form accepts internal storage paths as well as http URLs.

**`StatusTransitionInput` schema:**

```ts
z.object({
  recommendationId: z.string().uuid(),
  status: z.enum(REC_STATUS),
  note: z.string().trim().max(1000).optional(),
});
```

**Action signatures:**

```ts
export async function postProgressUpdate(input: unknown): Promise<ActionResult>;
export async function transitionStatus(input: unknown): Promise<ActionResult>;
```

Each:
1. Parse with the corresponding Zod schema → `{ ok: false, error: 'validation', issues }` on failure.
2. Build a `RepoContext` via `getProviders().auth.getContext(req)` from `headers()`.
3. Call the repo function.
4. On success, `revalidatePath('/recommendations/[id]', 'page')` and `revalidatePath('/recommendations', 'page')`.
5. Always close the DB client in a `finally`.

`ActionResult = { ok: true } | { ok: false, error: string, issues?: ZodIssue[] }`. The form renders error messages from this shape.

**Commit:**

```bash
git commit -m "feat: server actions for progress updates and status transitions"
```

---

## Task 5 — `<ProgressUpdateForm>`

**Files:**
- `src/components/progress/progress-update-form.tsx` (client)
- `.test.tsx`

**Contract:** `<ProgressUpdateForm recommendationId evidenceTypes progressRatings onSuccess?: () => void />`. Uses `useForm({ resolver: zodResolver(ProgressUpdateInput) })`. Submits via `useTransition` calling the `postProgressUpdate` action. On success, resets the form and calls `onSuccess`. Errors surface as inline `<FormMessage>` per field plus a banner for non-field errors.

Visual: textarea for notes (required, autoexpanding), two `<Select>` dropdowns (evidence type, rating) populated from the props, optional `<input type="text">` for the URL. Submit button disabled while pending. The form is in a `<Card>` for visual grouping under the list.

**Tests** (Vitest + Testing Library):
- Renders all fields; required label on notes.
- Submitting with empty notes shows the validation message and does NOT call the action.
- Submitting valid input calls a mocked `postProgressUpdate` once with the trimmed values.
- Server-action error in the result causes a banner.

**Commit:**

```bash
git commit -m "feat(ui): <ProgressUpdateForm> with RHF + Zod"
```

---

## Task 6 — `<ProgressUpdatesList>` + `<StatusBadge>`

**Files:**
- `src/components/progress/progress-updates-list.tsx` + test
- `src/components/progress/status-badge.tsx` + test

**`<ProgressUpdatesList rows />`:** Time-ordered (newest first) list of update cards. Each card shows `createdAt` (relative, e.g. "2 days ago"), evidence type badge if set, rating badge if set, the notes (whitespace preserved), and the URL as a link if set. Empty state: "No progress updates yet — be the first to post one."

Date formatting: use `Intl.RelativeTimeFormat` directly (no new dep). Tooltip on hover shows the absolute timestamp.

**`<StatusBadge status, note? />`:** Maps `RecStatus` → colour + label using a tiny lookup. Reuses the existing `<Badge>` primitive. `note` renders as a tooltip if provided.

**Tests:** rendering both empty + populated states for the list; each status mapping to its expected variant for the badge.

**Commit:**

```bash
git commit -m "feat(ui): <ProgressUpdatesList> and <StatusBadge>"
```

---

## Task 7 — Wire the Progress tab on the detail page

**Files:**
- Modify: `src/app/(app)/recommendations/[id]/page.tsx`

**Changes:**
1. Add `listProgressUpdates(ctx, id)`, `getLatestStatus(ctx, id)`, and the two taxonomy SELECTs to the `Promise.all`. The taxonomies are tiny (≤8 rows total); fetch every time, no cache.
2. Replace the Progress tab placeholder with:
   - `<StatusBadge>` plus an inline `<StatusTransitionControl>` (a small client-island wrapping the `<Select>` + `transitionStatus` action).
   - `<ProgressUpdatesList rows={updates}>` above
   - `<ProgressUpdateForm recommendationId={id} evidenceTypes={...} progressRatings={...}>` below.

**`<StatusTransitionControl>`** lives in `src/components/progress/status-transition-control.tsx` — small `'use client'` wrapper around the same action used by the table cell. Tested as part of Task 8 to avoid duplicate test scaffolding.

**Commit:**

```bash
git commit -m "feat: wire Progress tab on /recommendations/[id]"
```

---

## Task 8 — `<EditableSelectCell>` + Status column on the table

**Files:**
- New: `src/components/recommendations/editable-select-cell.tsx` + `.test.tsx`
- Modify: `src/components/recommendations/recommendations-table.tsx` — add Status column.
- Modify: `src/app/(app)/recommendations/page.tsx` — call `getLatestStatuses(ctx, rows.map(r => r.id))` and merge into the row data.

**`<EditableSelectCell>` contract:** `<EditableSelectCell value, options, onSubmit, render? />`. By default renders `options.find(o => o.value === value)?.label` inside a button. On click → expands to a `<Select>` populated from `options`. On change calls `onSubmit(newValue)` inside `useTransition`; flips back on error. Generic — not tied to status; the table column passes a status-flavoured `render` for the badge styling.

**Status column:** New column key `latestStatus`, renders `<EditableSelectCell value={row.latestStatus.status} options={REC_STATUS_OPTIONS} onSubmit={(s) => transitionStatus({ recommendationId: row.id, status: s })} render={(label) => <StatusBadge status={label} />} />`. Goes between Source and Created.

The `RrfRow` returned by the search service does not carry status. The page does the batched `getLatestStatuses` lookup and merges. For both the search and browse paths.

**Tests:** click toggles the cell into edit mode; selecting an option calls the mocked submit handler with the new value; error result restores the previous value.

**Commit:**

```bash
git commit -m "feat(ui): <EditableSelectCell> + Status column on recommendations table"
```

---

## Task 9 — Smoke, verify, PR, docs

**Files:**
- New: `tests/progress-updates.smoke.test.tsx` — renders the Progress tab against mock data, fills the form, asserts the action is called.
- Modify: `PLAN.md`, `STATE.md`, `docs/changelog.md`.

`pnpm verify` → push → PR → squash-merge.

**Commit:**

```bash
git commit -m "test: progress-updates smoke + phase-7 doc updates"
```

---

## Carry-overs / flags to watch

- **Edit / delete of progress updates** — picked up in Phase 8 once Better-auth provides `ctx.auth.user.id` and roles.
- **Soft-delete / undo for status transitions** — append a new row; no destructive UX in Phase 7.
- **`?status=` filter on the index** — one-line addition once the column is in place; defer to Phase 9 when other table refinements happen.
- **Notification on update** — Phase 8+.
- **File attachments for evidence_url** — requires StorageProvider direct uploads; defer to Phase 10 polish.
- **Live updates via SSE** — current page revalidation is sufficient at expected scale; revisit if multi-user collaboration becomes a thing.
- **Aggregate analytics over progress updates** — Phase 9 (`SourceAnalytics`).
- **`@tailwindcss/typography`** still uninstalled — `prose` classes on the rec body remain visually unstyled until installed.
- **`uuid` columns for user refs** still have no FKs — wire up when Better-auth schema lands (Phase 8 carry-over from Phase 1).
