# Product Assessment — open-recs-local

> Generated 2026-06-30. A product-level audit of the current feature surface,
> what works, what's missing, and what to build next — ranked by impact.

---

## 1. Feature Inventory

### Ingestion pipeline (upload → parse → extract → embed)
**State: Complete and functional**

- Upload bay with live SSE progress (phase/percent/message), auto-close on ready/failed.
- Three pg-boss queues (`source.parse`, `source.extract`, `source.embed`) all registered and tested.
- `analytics.refresh` cron at 02:00 daily, pre-warming the cache.
- Provider settings are DB-backed and hot-reloaded via NOTIFY — no worker restart needed.

**Gaps:**
- No re-extraction without re-uploading. If extraction quality is poor, the only path is to re-upload the PDF. There's no "re-run extract" or "re-embed" button on a source.
- No bulk upload. One PDF at a time. A user with a back-catalogue of 50 reports faces 50 manual uploads.
- No drag-and-drop onto the page (the form uses a file input — functional but not the "drop a PDF into the bay" the prose promises).
- No retry from failed state. A failed source stays failed; there's no "retry pipeline" action.
- No re-embed when the embedding model changes. If you swap models, old vectors stay with the old model.

### Source reading experience (`/sources/[slug]`)
**State: Complete**

- Split-pane markdown + PDF viewer with scroll sync, resizable panels, mobile stack fallback.
- Tag chips (themes, types, purposes, roles, audiences) displayed when present.
- Edit page for metadata + tags with unverified-tag flow into `/admin/tags`.
- Access-gating for private sources in hosted mode with request-access form.

**Gaps:**
- **No deep-link to page anchors.** The `pageAnchor` on recommendations links to `/sources/<slug>#page=N`, but the source viewer doesn't parse or honour that hash — the `useScrollSync` hook initialises at page 1. The message-bubble component explicitly notes this is "deferred." This is a significant UX gap: chat citations and recommendation "Filed from page X" links don't jump to the right page.
- No full-text search within a source. You can read page-by-page but can't Ctrl-F across the whole document.
- No table of contents or section navigation for long reports.
- No "jump to recommendation" from the source view — you can't see which recommendations were extracted from the page you're reading.
- Source list (`/sources`) has no search, no filter by status, no filter by tag, no pagination. Just a flat newest-first list capped at 50.

### Recommendations index (`/recommendations`)
**State: Complete**

- Hybrid/keyword search with source + theme filters, sortable table, inline status editing.
- Falls back to recent list when no query.
- Status badge + editable select cell with optimistic transition.

**Gaps:**
- **No pagination.** Hard limit of 100 (`limit.max(100)`). A corpus of 500+ recommendations means 400 are invisible.
- No filter by status. You can filter by source and theme but not "show me all blocked recommendations."
- No filter by tag axis other than theme. The schema has purposes, audiences, location scopes — none are filterable on the index.
- No export (CSV/JSON). A common ask for analysts who want to work in Excel.
- No bulk status changes. Status is edited one cell at a time.
- Search results don't show excerpts or highlighted terms — just title + source + date. The `/search` page shows excerpts; the `/recommendations` page doesn't.

### Recommendation detail (`/recommendations/[id]`)
**State: Complete and well-structured**

- Three tabs: Overview (tags), Similar (embedding-based), Progress (status + updates).
- Progress update form with evidence type, evidence URL, progress rating.
- Similar recommendations ranked by embedding distance.
- Edit page for body, tags, metadata, priority timescale, confidence.

**Gaps:**
- **No author attribution on progress updates.** The schema has `authorUserId` on `progress_updates` but the list doesn't show who posted. In hosted/multi-user mode this is a trust problem.
- **No status history.** The `recommendation_statuses` table records every transition with timestamps, but the UI only shows the latest. You can't see "this was open, then in_progress, then blocked, then done."
- No comments or discussion beyond progress updates. Progress updates are the only interaction modality.
- No "link to another recommendation" — can't create cross-references between related recs manually.
- The "Similar" tab relies on embeddings existing. If embed failed, it just says "may still be processing" — no diagnostic.
- No notification when someone posts a progress update or changes a status you care about.

### Search (`/search`)
**State: Complete**

- Hybrid (RRF) and keyword modes, source + theme filters.
- Results show excerpt, rank chips (kw rank, vec rank, rrf score).
- Query embedding cache to avoid re-embedding repeated queries.

**Gaps:**
- **No search across source pages** — only recommendations. The chat endpoint searches source pages (`searchSourcePages`) but the `/search` page doesn't expose this. A user who wants to find a passage that wasn't extracted as a recommendation has no way to search for it outside chat.
- No faceted filtering beyond source/theme. No filter by status, date range, tag axis.
- No result count estimate or "show more" pagination. Fixed result set.
- No saved searches or search history.
- No highlighting of matched terms in excerpts.

### Chat (`/chat`)
**State: Complete**

- Streaming responses with inline `[[source:slug#page:n]]` citations rendered as links.
- Retrieved passages sidebar showing source + page.
- Conversation history (last 20 messages) sent with each request.
- Example prompts for empty state.

**Gaps:**
- **No chat persistence.** Conversations live only in React state — refresh and it's gone. No session history, no "continue this conversation later."
- **No follow-up from citations.** Clicking a citation link navigates away from chat entirely (to `/sources/<slug>`), losing the conversation. Should open in a new tab or a side panel.
- No "ask about this recommendation" — can't scope chat to a single source or rec.
- No regeneration or "retry" for a bad answer.
- No copy-to-clipboard for answers.
- No feedback mechanism (thumbs up/down) to collect RAG quality signal.
- The retrieved passages sidebar shows slug + page but not a snippet of what was retrieved. You can't judge if retrieval was good without clicking through.
- No model selector if multiple chat models are configured.

### Analytics
**State: Complete — global + per-source**

- Global: recs by status (donut), recs by theme (bar), progress cadence (line), source timeline (line).
- Per-source: recs by status (donut), progress cadence (line).
- Nightly cache refresh + 5-min TTL on read.

**Gaps:**
- **No time-range selector.** Everything is a fixed 12-month window. Can't zoom into a quarter or see all-time.
- **No cross-source comparison.** Can't compare "source A vs source B" on status distribution or progress cadence.
- **No export.** Charts are visual only — no CSV/JSON download of the underlying aggregates.
- **No recommendations-by-purpose or by-audience charts.** The data exists (M2M join tables) but isn't aggregated or visualized. Only theme is charted.
- **No progress-update analytics.** The `progress_updates` table has evidence types and ratings, but there's no chart showing "evidence type distribution" or "rating trends over time."
- **No stale cache indicator.** The page says "aggregates refresh nightly" but doesn't show when the cache was last computed (the `computedAt` timestamp exists but isn't surfaced).
- Per-source analytics is missing the theme breakdown and source timeline that the global page has.

### Onboarding / decision flow
**State: Partial — minimal**

- 3-step modal (welcome, upload, search) with skip + dismiss-via-localStorage.
- Appears only on the dashboard, only once per browser.

**Gaps:**
- **Too shallow to be useful.** Three text-only steps with no images, no interactive guidance, no links to the actual upload page. The "upload" step says "Drop a PDF" but doesn't link to `/sources`.
- No "replay onboarding" option anywhere in the UI.
- No empty-state guidance on `/search`, `/chat`, `/recommendations` when the corpus is empty. A fresh install with 0 sources shows "No matches" with no hint to upload first.
- No contextual help or tooltips on key concepts (RRF, hybrid search, status transitions).

### Landing page (`/`)
**State: Stub**

- 18 lines: a title, one sentence, a "Get started" button. No feature description, no screenshots, no value proposition.

**Gaps:**
- This is a placeholder. For a local-first tool this is acceptable (the user installed it, they know what it is), but for hosted mode it's not a marketing page.

### Profile (`/profile`)
**State: Complete (hosted-only)**

- Shows name, email, roles, sign-out button.
- Redirects to `/dashboard` in local mode.

**Gaps:**
- No "my contributions" view — can't see progress updates I've posted or recommendations I've tagged.
- No notification preferences.
- No API key management for personal use.

### Admin
**State: Complete (hosted-only)**

- Ownership request queue (approve/reject).
- User role table (change roles).
- Tag review queue (promote/rename/merge/delete unverified tags across 7 taxonomy axes).

**Gaps:**
- No provider settings UI in the admin panel. Provider settings are DB-backed (`provider_settings` table) and there's an API (`/api/providers/llm/models`), but no admin form to set/change them. Operators must edit the DB directly or use env vars.
- No job monitoring or queue health dashboard. The dashboard shows recent jobs but there's no admin view for failed job retry, queue depth, worker status.
- No source moderation (delete/hide a source).
- No audit log of admin actions.

---

## 2. Data Collected but Not Surfenced

| Data | Where it lives | Where it's shown | Gap |
|------|---------------|-----------------|-----|
| `progress_updates.authorUserId` | schema | nowhere | Not displayed in update list |
| `recommendation_statuses` full history | schema | only latest | No status timeline view |
| `recommendations.confidence` (high/medium/low) | schema | edit page only | Not shown on detail page or index |
| `recommendations.targetOrganization` | schema | edit page only | Not shown on detail page, not filterable |
| `recommendations.priorityTimescaleId` | schema | edit page only | Not shown on detail page, not filterable, not in analytics |
| `recommendations.notes` | schema | edit page only | Not shown on detail page |
| `sources.datasets` (description + url pairs) | schema | edit page only | Not shown on source viewer |
| `sources.summary` | schema | edit page only | Not shown on source list or viewer |
| `sources.authors` | schema | edit page only | Not shown on source list or viewer |
| `sources.publicationDate` | schema | edit page only | Not shown, not sortable, not in timeline filter |
| `sources.orgOwner` | schema | edit page only | Not shown, not filterable |
| `progress_updates.evidenceType` + `evidenceUrl` | schema | update list | Collected but not aggregated in analytics |
| `progress_updates.userProgressRating` | schema | update list | Collected but not aggregated in analytics |
| `analyticsCache.computedAt` | schema | nowhere | No "last refreshed" indicator on analytics pages |
| `jobResults` (per-stage detail) | schema | dashboard list | No drill-down into what a job actually did or where it failed |
| `providerSettings` | schema | API only | No admin UI to manage provider config |

---

## 3. Queue Coverage

**Defined in `types.ts`:** `source.parse`, `source.extract`, `source.embed`, `analytics.refresh`, `test.echo`

**Registered in `handlers/index.ts`:** All four real queues + `analytics.refresh` cron schedule.

**No orphaned queues** — every defined queue has a handler. No handlers exist for queues that aren't defined.

**Missing queue opportunities:**
- No `source.reextract` queue — can't re-run extraction with a different prompt/model.
- No `source.reembed` queue — can't re-embed after model swap.
- No `source.reparse` queue — can't re-parse after OCR improvements.
- No `recommendation.reembed` queue — can't re-embed individual recs after edits.
- No `export.generate` queue — no background export job for large CSV/PDF generation.

---

## 4. Suggested Improvements — Ranked by Impact

### Tier 1: High impact, addresses broken core flows

1. **Deep-link to source page anchors**
   - *Problem:* Chat citations and "Filed from page X" links go to `/sources/<slug>#page=N` but the viewer ignores the hash. This breaks the core "trace the evidence" flow.
   - *Fix:* Parse `#page=N` in `useScrollSync`'s `initialPage` and in the PDF viewer's initial page.
   - *Effort:* Small (1-2 files, ~30 lines).

2. **Chat persistence + conversation history**
   - *Problem:* Refreshing `/chat` loses the conversation. This makes chat unusable for real work.
   - *Fix:* Store conversations in a `chat_sessions` table, list past sessions, allow resuming.
   - *Effort:* Medium (new table, repo, API changes, client state).

3. **Pagination on recommendations index**
   - *Problem:* Hard cap of 100 recs. A real corpus has hundreds.
   - *Fix:* Cursor-based pagination with "load more" or page numbers.
   - *Effort:* Small-medium (search-sql + page + component).

4. **Re-run pipeline actions on source**
   - *Problem:* Failed source stays failed. Bad extraction can't be fixed without re-uploading.
   - *Fix:* Add "Retry" (from failed), "Re-extract", "Re-embed" buttons on the source page, backed by new queue jobs.
   - *Effort:* Medium (2-3 new queue types + handlers + UI).

5. **Status history timeline on recommendation detail**
   - *Problem:* `recommendation_statuses` records every transition but only the latest is shown. Users can't audit progress.
   - *Fix:* Add a timeline component to the Progress tab showing all status changes with dates and notes.
   - *Effort:* Small (repo query already exists, new component).

### Tier 2: Medium impact, fills obvious feature gaps

6. **Author attribution on progress updates**
   - *Problem:* In hosted mode, you can't see who posted an update. Trust problem.
   - *Fix:* Join `authorUserId` → `users.name` in the repo, display in `ProgressUpdatesList`.
   - *Effort:* Small.

7. **Source list search + filters**
   - *Problem:* 50-item flat list, no search, no status/tag filter, no pagination.
   - *Fix:* Add a search input, status filter, tag filter, and pagination to `/sources`.
   - *Effort:* Small-medium.

8. **Recommendations index: filter by status + more tag axes**
   - *Problem:* Can filter by source and theme but not by status, purpose, audience, location.
   - *Fix:* Extend `RecommendationsIndexControls` with status dropdown and additional tag axis filters.
   - *Effort:* Small-medium.

9. **Surface collected-but-hidden metadata on detail pages**
   - *Problem:* `confidence`, `targetOrganization`, `priorityTimescale`, `notes`, `summary`, `authors`, `publicationDate`, `datasets` are all collected but invisible on the read-only detail pages.
   - *Fix:* Add a metadata section to the recommendation detail header and the source viewer header.
   - *Effort:* Small (display-only changes).

10. **Search across source pages (not just recommendations)**
    - *Problem:* The `/search` page only searches recommendations. Source-page search exists in the service layer (`searchSourcePages`) but is only used by chat.
    - *Fix:* Add a "pages" tab or mode toggle to the search page, using the existing `searchSourcePages` function.
    - *Effort:* Small (service exists, just needs UI).

11. **Open chat citations in new tab**
    - *Problem:* Clicking a citation navigates away from chat, losing the conversation.
    - *Fix:* Add `target="_blank"` to citation links in `message-bubble.tsx` and the retrieved passages sidebar.
    - *Effort:* Trivial.

12. **Analytics: time-range selector + last-refreshed indicator**
    - *Problem:* Fixed 12-month window, no freshness indicator.
    - *Fix:* Add a date-range dropdown that passes bounds to the SQL aggregates; surface `computedAt` as "Last refreshed: Xh ago."
    - *Effort:* Medium (SQL changes + cache key variations).

### Tier 3: Lower impact, polish and power features

13. **Bulk upload** — multiple PDFs at once with per-file progress.
14. **Export recommendations as CSV/JSON** — for analysts working in Excel.
15. **Admin: provider settings UI** — manage LLM/embedding/OCR/chat config from the browser instead of env vars + DB.
16. **Admin: job/queue health dashboard** — failed jobs, queue depth, worker status.
17. **Recommendations by purpose/audience charts** — data exists, not visualized.
18. **Progress update analytics** — evidence type distribution, rating trends.
19. **Saved searches** — persist a query + filters for reuse.
20. **Chat: scope to single source** — "ask only about this report."
21. **Chat: copy answer + regenerate** — basic chat UX affordances.
22. **Drag-and-drop upload** — match the "drop a PDF into the bay" prose.
23. **Notifications** — email/in-app when a watched recommendation gets a progress update.
24. **Recommendation cross-references** — manually link related recs.
25. **Full-text search within a source** — Ctrl-F across all pages.

---

## 5. Architecture Observations (non-blocking)

- **DB client inconsistency:** Dashboard and analytics pages use `getSharedDb` (shared pool). Source, recommendation, edit, and admin pages use `createDb` (per-request) with manual `client.sql.end()` in `finally`. This is likely a migration-in-progress — the shared pool is the intended end state. The per-request pattern leaks connections if `finally` is missed and adds latency from pool acquisition.
- **No API for recommendations list** — the `/recommendations` page is a server component that calls the service directly. The `/api/recommendations/route.ts` exists but may serve a different purpose. If client-side pagination is added, an API endpoint will be needed.
- **`test.echo` queue** is defined in types but has no handler registered — this is intentional (it's for the queue wrapper's own test), but it means `test.echo` can't actually be enqueued without a 500.

---

## Summary

The application is **feature-complete for a single-user local-first tool** — the core loop (upload → parse → extract → embed → search → chat) works end to end. The main product gaps are:

1. **Broken citation deep-linking** (Tier 1, small fix, high impact)
2. **No chat persistence** (Tier 1, medium effort, high impact)
3. **No pagination on the recommendations index** (Tier 1, blocks scale)
4. **No pipeline retry/re-run** (Tier 1, blocks recovery from failures)
5. **Significant collected data is invisible** (Tier 2, easy wins)

The fastest high-impact wins are #1 (page anchor deep-linking) and #11 (open citations in new tab) — both are small, self-contained, and fix the core "trace the evidence" user flow that chat and recommendations both depend on.