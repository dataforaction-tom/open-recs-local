# Pipeline & UI Improvements Plan

**Date:** 2025-05-25  
**Status:** Draft  
**Parent:** PLAN.md — Phase 10 polish

## Objective

Address data pipeline performance bottlenecks and improve user-facing source/recommendation display. This is Phase 10 polish work that improves quality (fewer DB calls, better data) and speed (parallel execution, batch updates) while making sources more useful and discoverable.

## Priority Matrix

| Priority | Category | Impact | Effort |
|----------|----------|--------|--------|
| P0 | Extract N+1 fix | High | Medium |
| P0 | Parallel LLM calls | High | Low |
| P1 | Source list metadata | High | Low |
| P1 | Embed batch updates | Medium | Medium |
| P2 | Recommendation filters | Medium | Medium |
| P2 | Tag category labels | Low | Low |
| P3 | tsvector column | Low | Medium |

---

## Tasks

### P0: Pipeline Performance — Extract Handler

#### Task 1: Batch Taxonomy Resolution

**Problem:** For each recommendation, 4-5 sequential DB calls resolve tags. A source with 50 recs = 400+ calls.

**Solution:** Resolve all slugs upfront in single batch, then bulk-insert M2M rows.

**Current code** (`extract.ts` lines 263-273):
```typescript
for (let i = 0; i < recs.length; i++) {
  const themeIds = await resolveOrCreateThematicAreas(repoCtx, rec.thematic_area_slugs);
  await replaceRecommendationThematicAreas(repoCtx, insertedRec.id, themeIds);
  // ... repeats for purpose, audience, location
}
```

**Target:**
```typescript
// 1. Collect all unique slugs from all recs
const allThemeSlugs = recs.flatMap(r => r.thematic_area_slugs);
const uniqueThemeSlugs = [...new Set(allThemeSlugs)];

// 2. Single batch resolve
const themeSlugToId = await resolveOrCreateThematicAreasBulk(repoCtx, uniqueThemeSlugs);

// 3. Bulk insert M2M (single INSERT with multiple VALUES)
await replaceRecommendationThematicAreasBulk(repoCtx, recIds, themeSlugToId);
```

**Steps:**
- [ ] 1.1 Create `resolveOrCreateThematicAreasBatch` (accepts array of slugs, returns map)
- [ ] 1.2 Repeat for: `purposes`, `target_audience_types`, `location_scopes`
- [ ] 1.3 Create bulk M2M replacers: `replaceRecommendation*Bulk`
- [ ] 1.4 Refactor extract handler to use batch approach
- [ ] 1.5 Add integration test with 50+ recs, assert DB calls < 20

#### Task 2: Parallel LLM Calls — Pass 1 + Pass 2

**Problem:** Pass 1 (source metadata) and Pass 2 (recs) run sequentially but are independent.

**Solution:** Run both in parallel, combine results.

**Current** (`extract.ts` lines 169-218):
```typescript
const pass1 = await ctx.providers.llm.generateStructured({...});  // waits
const pass2 = await ctx.providers.llm.generateStructured({...});  // then this
```

**Target:**
```typescript
const [pass1, pass2] = await Promise.all([
  ctx.providers.llm.generateStructured({ key: `${fixtureKey}:metadata`, ... }),
  ctx.providers.llm.generateStructured({ key: fixtureKey, ... }),
]);
```

**Steps:**
- [ ] 2.1 Refactor extract handler to use `Promise.all`
- [ ] 2.2 Handle partial failure (if Pass 1 fails, should Pass 2 run?)
- [ ] 2.3 Update progress messaging to reflect parallel execution
- [ ] 2.4 Test with fixture files

---

### P1: Pipeline Performance — Embed Handler

#### Task 3: Batch Embedding Updates

**Problem:** Each embedding row updated individually (lines 98-108 in `embed.ts`). 100 pages = 100 UPDATEs.

**Solution:** Single bulk UPDATE with multiple SET clauses or use `upsert`.

**Current:**
```typescript
for (let i = 0; i < batch.length; i++) {
  await ctx.db.update(recommendations).set({...}).where(eq(recommendations.id, row.id));
}
```

**Target:** One UPDATE statement with array of rows.

**Steps:**
- [ ] 3.1 Research Drizzle batch update pattern for pgvector
- [ ] 3.2 Implement bulk update for recommendations
- [ ] 3.3 Implement bulk update for source_pages
- [ ] 3.4 Benchmark before/after (should see 5-10x speedup on large docs)

---

### P1: UI — Source List Enhancements

#### Task 4: Add Metadata to Source List

**Problem:** `/sources` shows title + date + status only. Users can't assess relevance without clicking.

**Solution:** Add recommendation count, summary excerpt, primary theme.

**Current list item:**
```typescript
<Link href={`/sources/${source.slug}`}>{source.title}</Link>
<div className="ref">{source.slug}</div>
```

**Target:** Per list item:
- Title (link)
- Summary excerpt (first 120 chars of `summary` column)
- Rec count badge: "12 recommendations"
- Primary theme chip
- Date + Status

**Steps:**
- [ ] 4.1 Update `listRecentSources` to JOIN recommendation count
- [ ] 4.2 Add primary theme lookup (first theme by name)
- [ ] 4.3 Update source list UI component
- [ ] 4.4 Add rec count to source list query in jobs-list.ts

---

### P2: UI — Recommendation Filters

#### Task 5: Expand Filter Options

**Problem:** Only thematic area + source + date filters exist. Source type, purpose, role relevance, audience not filterable.

**Solution:** Add filter UI for missing dimensions.

**Current filters:**
- ✅ Thematic area
- ✅ Source  
- ✅ Date range

**Add:**
- [ ] Source type (e.g., "Audit report", "Strategy document", "Guidance")
- [ ] Purpose (e.g., "Accountability", "Improvement")
- [ ] Role relevance (e.g., "Elected members", "Officers")
- [ ] Target audience (e.g., "Social workers", "Headteachers")

**Steps:**
- [ ] 5.1 Add columns to search-sql.ts `SearchFilters` type
- [ ] 5.2 Update RRF + keyword SQL builders to join + filter
- [ ] 5.3 Add filter dropdowns to recommendations page UI
- [ ] 5.4 Sync URL params with filter state

---

### P2: UI — Tag Display

#### Task 6: Category Labels for Tag Chips

**Problem:** Tags shown as flat lists without category context.

**Current:**
```typescript
<TagChips tags={themes} />
<TagChips tags={types} />
```

**Target:**
```typescript
<div>
  <span className="tag-category-label">Themes</span>
  <TagChips tags={themes} />
</div>
<div>
  <span className="tag-category-label">Types</span>
  <TagChips tags={types} />
```

**Steps:**
- [ ] 6.1 Add category label prop to TagChips component
- [ ] 6.2 Update source detail page to pass labels
- [ ] 6.3 Update recommendation detail to show tags with labels

#### Task 7: Source Detail — Prominent Metadata Display

**Problem:** Source metadata (authors, org owner, publication date) not prominently shown on detail page.

**Solution:** Add header section with metadata.

**Target:** Below title, above tags:
```markdown
## [Source Title]

**Published:** 15 January 2024  
**Organisation:** Care Quality Commission  
**Authors:** Dr J. Smith, M. Jones
```

**Steps:**
- [ ] 7.1 Add metadata row component
- [ ] 7.2 Wire to source detail page
- [ ] 7.3 Style to match design system

---

### P3: Search Performance

#### Task 8: Generated tsvector Column

**Problem:** Inline `to_tsvector` computed per query (STATE.md carry-over).

**Solution:** Add generated column + GIN index.

**Steps:**
- [ ] 8.1 Create migration for `source_pages.tsv` generated column
- [ ] 8.2 Add GIN index on column
- [ ] 8.3 Update search-sql to use column instead of inline function

---

## Verification

Each task follows TDD:
1. write_file failing test
2. Minimum implementation to pass
3. Commit (conventional: `perf:`, `feat:`, `fix:`)

Run `pnpm verify` before claiming complete.

## Dependencies

- All tasks within Phase 10 — no new external deps
- Some tasks need Drizzle batch update research
- Filter expansion needs UI component work

## Timeline Estimate

| Task | Estimate | Notes |
|------|----------|-------|
| 1. Batch taxonomy | 2 days | DB pattern work |
| 2. Parallel LLM | 0.5 day | Simple refactor |
| 3. Embed batch | 1 day | Drizzle research |
| 4. Source list | 0.5 day | Quick UI win |
| 5. Filters | 2 days | UI + SQL |
| 6. Tag labels | 0.5 day | Component tweak |
| 7. Metadata display | 0.5 day | UI addition |
| 8. tsvector | 1 day | Migration |

**Total:** ~7.5 days

---

## Decisions To Make

1. **Bulk taxonomy resolver naming:** `resolveOrCreate*Batch` vs `bulkResolve*`
2. **Filter UI:** Dropdowns vs chips vs combobox (existing filter chips for themes?)
3. **Tag category labels:** Where to show — source detail, rec detail, both?