# Extraction & Tagging Rebuild — PR 2 (Extraction Pipeline) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `source.extract` handler as a two-pass, section-aware pipeline that populates the new schema PR 1 added — source-level metadata + tags, plus rich per-recommendation tagging — using the existing taxonomy / source-tags / recommendation-tags repos.

**Architecture:** The `source.extract` pg-boss handler makes two LLM calls in sequence. **Pass 1** sees the first 10k chars of canonical markdown and returns source-level metadata: summary, authors, publication date, org_owner, plus multi-axis tag slug lists (themes, source_types, purposes, role_relevances, target_audience_types). **Pass 2** sees either the document's recommendation sections (detected via regex on canonical markdown headings) or the full document if no recommendation section is found, and returns each recommendation with its body, multi-axis tags, priority_timescale, target_organization, notes, confidence, and page anchors. Both passes use the per-axis `resolveOrCreateSlugs` repo functions shipped in PR 1, so unknown LLM-coined slugs get auto-created as `unverified=true`.

**Tech Stack:** TypeScript, Zod, the existing `LlmProvider.generateStructured` interface (openai-compatible adapter + fake-LLM fallback for tests), Drizzle, Testcontainers.

**Spec:** `docs/superpowers/specs/2026-05-12-extraction-and-tagging-rebuild-design.md` (section "Extraction pipeline").

**Depends on:** PR 1 (#21) — schema + repos. PR 1 is on master at `c2d3131`.

---

## File Structure

**Files created:**

- `src/lib/services/extraction-sections.ts` — `detectRecommendationSections(markdown)` helper; pure regex-based string slicing, no I/O.
- `src/lib/services/extraction-sections.test.ts` — paired tests.
- `src/lib/services/extraction-prompts.ts` — three system-prompt builders (Pass 1, Pass 2 strict, Pass 2 looser) parameterised by the taxonomy slug lists.
- `src/lib/services/extraction-prompts.test.ts` — paired tests asserting slug interpolation + key instructions.
- `fixtures/sources/sample-report.metadata.json` — Pass 1 fixture for `sample-report.pdf`.
- `fixtures/sources/sample-policy.metadata.json` — Pass 1 fixture for `sample-policy.pdf`.

**Files modified:**

- `src/lib/services/extraction-schema.ts` — replace `ExtractionSchema` with two new schemas: `SourceMetadataSchema` (Pass 1) and `RecommendationsSchema` (Pass 2). Update exported types accordingly.
- `src/lib/jobs/handlers/extract.ts` — full rewrite. Loads taxonomy slugs per axis, runs Pass 1, persists source metadata + M2M, runs section detection, runs Pass 2, persists recommendations + M2M + priority_timescale FK.
- `src/lib/providers/llm/fake.ts` — recognise the `<stem>:metadata` key convention and look up `<stem>.metadata.json` for Pass 1 calls; fall through to the existing `<stem>.recommendations.json` lookup for Pass 2. Wrap-bare-array compatibility is removed (Pass 2 fixtures now ship in the wrapped shape).
- `src/lib/providers/llm/fake.test.ts` — add coverage for the metadata fixture path.
- `src/lib/jobs/handlers/extract.test.ts` — rewrite against the new schemas + handler. Reorganised around the two passes.
- `fixtures/sources/sample-report.recommendations.json` — new wrapped shape with the new fields (multi-axis tag arrays, confidence, page anchors).
- `fixtures/sources/sample-policy.recommendations.json` — same.
- `tests/pipeline.e2e.test.ts` — extend the e2e assertions to cover the new source columns + every M2M membership.

**Files NOT touched (deliberate — PR 3 territory):**

- Any UI (`src/app/`, `src/components/`).
- `/admin/tags` review queue (PR 3).
- `/sources/[slug]/edit` and `/recommendations/[id]/edit` (PR 3).

---

## Pre-flight

- [ ] **Step 1: Confirm clean tree on master**

Run: `git status && git log --oneline -3`
Expected: clean tree, master at `c2d3131 docs: PR 1 implementation plan` or later (`c2d3131` is the docs commit that landed alongside PR 1; the latest schema commit is `3aa9ad5` from PR 21).

- [ ] **Step 2: Branch off master**

Run:
```bash
git checkout master
git pull --ff-only
git checkout -b feat/extraction-tagging-pipeline
```
Expected: switched to a new branch.

---

## Task 1: New Zod schemas (Pass 1 + Pass 2)

**Files:**
- Modify: `src/lib/services/extraction-schema.ts`

- [ ] **Step 1: Replace `extraction-schema.ts` with the two new schemas**

Replace the entire file content with:

```typescript
import { z } from 'zod';

/**
 * Pass 1 output — source-level metadata extracted from the first ~10k chars
 * of canonical markdown.
 *
 * All multi-select axes are arrays of slug strings; the handler resolves
 * each slug to a taxonomy id via the per-axis `resolveOrCreate*` repo
 * functions, auto-creating unknown slugs with `unverified=true`.
 *
 * Wrapped in an object (not a bare set of fields) because real LLM
 * structured-output APIs require a top-level JSON object.
 */
export const SourceMetadataSchema = z.object({
  summary: z.string().nullable(),
  authors: z.array(z.string()).default([]),
  publication_date: z.string().nullable(),
  org_owner: z.string().nullable(),
  thematic_area_slugs: z.array(z.string()).default([]),
  source_type_slugs: z.array(z.string()).default([]),
  purpose_slugs: z.array(z.string()).default([]),
  role_relevance_slugs: z.array(z.string()).default([]),
  target_audience_type_slugs: z.array(z.string()).default([]),
});

export type SourceMetadataOutput = z.infer<typeof SourceMetadataSchema>;

/**
 * Pass 2 output — recommendations extracted from the document's
 * recommendation sections (or the full document when no sections are
 * detected). `body` is the field name on both LLM output and the
 * `recommendations.body` column — no rename mapping needed in the handler.
 *
 * `confidence` is required so the handler can persist it without nullable
 * checks. `priority_timescale_slug` is single-valued (one priority per rec);
 * all other axes are arrays.
 */
export const RecommendationsSchema = z.object({
  recommendations: z.array(
    z.object({
      title: z.string().min(5),
      body: z.string().min(20),
      thematic_area_slugs: z.array(z.string()).default([]),
      purpose_slugs: z.array(z.string()).default([]),
      target_audience_type_slugs: z.array(z.string()).default([]),
      location_scope_slugs: z.array(z.string()).default([]),
      priority_timescale_slug: z.string().nullable().optional(),
      target_organization: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      confidence: z.enum(['high', 'medium', 'low']),
      page_start: z.number().int().nullable().optional(),
      page_end: z.number().int().nullable().optional(),
    }),
  ),
});

export type RecommendationsOutput = z.infer<typeof RecommendationsSchema>;
export type RecommendationInput = RecommendationsOutput['recommendations'][number];
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: errors — `ExtractionSchema` / `ExtractionOutput` references in `extract.ts` and `extract.test.ts` no longer resolve. We fix those in later tasks; for now, confirm only those files break.

If any other files fail typecheck (e.g. a file imports `ExtractionSchema` that we didn't anticipate), STOP and inventory the additional usage before continuing.

- [ ] **Step 3: Commit (broken-build commit is fine — green by Task 7)**

```bash
git add src/lib/services/extraction-schema.ts
git commit -m "feat(extract): new Zod schemas for Pass 1 metadata + Pass 2 recommendations"
```

This leaves the repo in a broken-typecheck state intentionally. Tasks 4 and 7 restore green.

---

## Task 2: Section-detection helper

**Files:**
- Create: `src/lib/services/extraction-sections.ts`
- Create: `src/lib/services/extraction-sections.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/extraction-sections.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { detectRecommendationSections } from './extraction-sections';

describe('detectRecommendationSections', () => {
  it('returns mode=full-document when no recommendation heading is found', () => {
    const md = '# About\n\nSome text.\n\n# Methodology\n\nMore text.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('full-document');
    expect(result.processText).toBe(md);
  });

  it('detects "# Recommendations" and slices from heading to end of doc', () => {
    const md = '# Intro\n\nIntro text.\n\n# Recommendations\n\n1. Do X.\n2. Do Y.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('sections');
    expect(result.processText).toContain('# Recommendations');
    expect(result.processText).toContain('Do X');
    expect(result.processText).not.toContain('Intro text');
  });

  it('detects "# Next steps" as a recommendation section', () => {
    const md = '# Background\n\nText.\n\n# Next steps\n\nAct now.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('sections');
    expect(result.processText).toContain('# Next steps');
  });

  it('detects "# Conclusions and recommendations"', () => {
    const md = '# Setup\n\nA.\n\n# Conclusions and recommendations\n\nFoo.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('sections');
    expect(result.processText).toContain('Conclusions and recommendations');
  });

  it('detects "# Actions"', () => {
    const md = '# Findings\n\nText.\n\n# Actions\n\nDo this.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('sections');
    expect(result.processText).toContain('# Actions');
  });

  it('detects "# We will" as a commitment-style section', () => {
    const md = '# Context\n\nText.\n\n# We will\n\nCommit to X.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('sections');
    expect(result.processText).toContain('We will');
  });

  it('concatenates multiple matched sections', () => {
    const md = '# Intro\n\nA.\n\n# Recommendations\n\n1. X.\n\n# About\n\nIgnore.\n\n# Next steps\n\nY.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('sections');
    expect(result.processText).toContain('# Recommendations');
    expect(result.processText).toContain('# Next steps');
  });

  it('stops each section at the next non-recommendation major heading', () => {
    const md = '# Recommendations\n\n1. X.\n\n# Appendix\n\nDo not include.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('sections');
    expect(result.processText).toContain('1. X.');
    expect(result.processText).not.toContain('Do not include');
  });

  it('is case-insensitive on the heading text', () => {
    const md = '# RECOMMENDATIONS\n\n1. X.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('sections');
  });

  it('does not match recommendation-like words inside body text', () => {
    const md = '# About\n\nThe recommendations of this report are summarised below.\n\n# Methodology\n\nText.';
    const result = detectRecommendationSections(md);
    expect(result.mode).toBe('full-document');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/services/extraction-sections.test.ts`
Expected: cannot find module `./extraction-sections`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/services/extraction-sections.ts`:

```typescript
/**
 * Section-aware preprocessing for the `source.extract` Pass 2 LLM call.
 * Looks for recommendation-shaped headings (`# Recommendations`, `# Next
 * steps`, `# Conclusions [and recommendations]`, `# Actions`, `# We will`,
 * `# Summary`) and, when found, slices the markdown to just those sections.
 *
 * Each detected section runs from its heading to the start of either:
 *   (a) the next matched recommendation heading, OR
 *   (b) the next "non-recommendation" major heading (Background,
 *       Methodology, Introduction, Appendix, References, etc.), OR
 *   (c) end of document.
 *
 * Returns `mode: 'sections'` when at least one heading matched, else
 * `mode: 'full-document'` (caller uses the looser full-doc Pass 2 prompt).
 *
 * Pure function — no I/O, no Postgres. Unit-tested with synthetic markdown.
 */

const REC_HEADING_PATTERNS: readonly RegExp[] = [
  /^#\s+Recommendations(?:\s+and\s+next\s+steps)?\s*$/im,
  /^#\s+Next\s+steps\s*$/im,
  /^#\s+Conclusions?(?:\s+and\s+recommendations)?\s*$/im,
  /^#\s+Actions?\s*$/im,
  /^#\s+We\s+will\s*$/im,
  /^#\s+Summary\s*$/im,
];

// Headings that end a recommendation section when encountered after it.
const STOP_HEADING_PATTERN =
  /^#\s+(?:About|Introduction|Background|Method|Methodology|Appendix|Bibliography|References|Acknowledgements?|Acknowledgments|Contact|Overview)\s*$/im;

export type SectionDetectionResult = {
  processText: string;
  mode: 'sections' | 'full-document';
};

type Match = { start: number; index: number };

function findAllMatches(markdown: string, pattern: RegExp): Match[] {
  // The flags include `m` for line anchors. We re-create with `g+m+i` so we
  // can sweep the document with `exec`.
  const sweep = new RegExp(pattern.source, 'gim');
  const matches: Match[] = [];
  let m: RegExpExecArray | null;
  while ((m = sweep.exec(markdown)) !== null) {
    matches.push({ start: m.index, index: sweep.lastIndex });
  }
  return matches;
}

export function detectRecommendationSections(markdown: string): SectionDetectionResult {
  const recMatches: number[] = [];
  for (const pattern of REC_HEADING_PATTERNS) {
    for (const m of findAllMatches(markdown, pattern)) {
      recMatches.push(m.start);
    }
  }
  if (recMatches.length === 0) {
    return { processText: markdown, mode: 'full-document' };
  }
  recMatches.sort((a, b) => a - b);

  const stopMatches = findAllMatches(markdown, STOP_HEADING_PATTERN).map((m) => m.start);

  const slices: string[] = [];
  for (let i = 0; i < recMatches.length; i += 1) {
    const start = recMatches[i]!;
    const nextRec = recMatches[i + 1] ?? Infinity;
    const nextStop = stopMatches.find((p) => p > start) ?? Infinity;
    const end = Math.min(nextRec, nextStop, markdown.length);
    slices.push(markdown.slice(start, end).trimEnd());
  }
  return { processText: slices.join('\n\n'), mode: 'sections' };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/services/extraction-sections.test.ts`
Expected: 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/extraction-sections.ts src/lib/services/extraction-sections.test.ts
git commit -m "feat(extract): section detection for Pass 2 (sections-only vs full-document)"
```

---

## Task 3: Prompt builders for Pass 1 + Pass 2

**Files:**
- Create: `src/lib/services/extraction-prompts.ts`
- Create: `src/lib/services/extraction-prompts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/services/extraction-prompts.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildPass1Prompt,
  buildPass2LooserPrompt,
  buildPass2StrictPrompt,
  type TaxonomySlugLists,
} from './extraction-prompts';

const slugs: TaxonomySlugLists = {
  thematic_area: ['governance', 'data'],
  source_type: ['evaluation'],
  purpose: ['strategy'],
  role_relevance: ['policy-maker'],
  target_audience_type: ['funders'],
  location_scope: ['national'],
  priority_timescale: ['urgent'],
};

describe('buildPass1Prompt', () => {
  it('lists every multi-select axis slug in the prompt body', () => {
    const prompt = buildPass1Prompt(slugs);
    expect(prompt).toContain('"governance"');
    expect(prompt).toContain('"evaluation"');
    expect(prompt).toContain('"strategy"');
    expect(prompt).toContain('"policy-maker"');
    expect(prompt).toContain('"funders"');
  });

  it('instructs the model to return a new slug when none in the list fits', () => {
    const prompt = buildPass1Prompt(slugs);
    expect(prompt.toLowerCase()).toContain('new slug');
  });

  it('lists the exact output fields by name', () => {
    const prompt = buildPass1Prompt(slugs);
    for (const field of [
      'summary',
      'authors',
      'publication_date',
      'org_owner',
      'thematic_area_slugs',
      'source_type_slugs',
      'purpose_slugs',
      'role_relevance_slugs',
      'target_audience_type_slugs',
    ]) {
      expect(prompt).toContain(field);
    }
  });
});

describe('buildPass2StrictPrompt', () => {
  it('emphasises "actionable" and warns against needs/wants statements', () => {
    const prompt = buildPass2StrictPrompt(slugs);
    expect(prompt.toLowerCase()).toContain('actionable');
    expect(prompt.toLowerCase()).toContain('needs');
  });

  it('requires a confidence enum value', () => {
    const prompt = buildPass2StrictPrompt(slugs);
    expect(prompt).toContain('confidence');
    expect(prompt).toMatch(/high.*medium.*low/);
  });

  it('lists Pass 2 axis slugs (themes, purposes, audiences, locations, priorities)', () => {
    const prompt = buildPass2StrictPrompt(slugs);
    expect(prompt).toContain('"governance"');
    expect(prompt).toContain('"funders"');
    expect(prompt).toContain('"national"');
    expect(prompt).toContain('"urgent"');
  });
});

describe('buildPass2LooserPrompt', () => {
  it('instructs the model to extract from anywhere in the document', () => {
    const prompt = buildPass2LooserPrompt(slugs);
    expect(prompt.toLowerCase()).toContain('full document');
  });

  it('still requires confidence + lists axis slugs', () => {
    const prompt = buildPass2LooserPrompt(slugs);
    expect(prompt).toContain('confidence');
    expect(prompt).toContain('"governance"');
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm vitest run src/lib/services/extraction-prompts.test.ts`
Expected: cannot find module `./extraction-prompts`.

- [ ] **Step 3: Implement the prompt builders**

Create `src/lib/services/extraction-prompts.ts`:

```typescript
/**
 * System-prompt builders for the two-pass extraction pipeline. Every
 * builder interpolates the relevant taxonomy slug lists into the prompt
 * body so the LLM picks from the project's known vocabulary; the
 * "new slug" escape clause lets the LLM coin a fresh tag when none of the
 * listed slugs fit (the handler then auto-creates it with `unverified=true`).
 *
 * Pure string-building. No I/O. Unit-tested.
 */

export type TaxonomySlugLists = {
  thematic_area: readonly string[];
  source_type: readonly string[];
  purpose: readonly string[];
  role_relevance: readonly string[];
  target_audience_type: readonly string[];
  location_scope: readonly string[];
  priority_timescale: readonly string[];
};

function formatSlugList(slugs: readonly string[]): string {
  if (slugs.length === 0) return '(taxonomy is empty — omit this field)';
  return slugs.map((s) => `"${s}"`).join(', ');
}

const NEW_SLUG_RULE =
  'For each multi-select axis, return slugs from the list when they fit. ' +
  'If none truly fits and the document explicitly references a different concept, ' +
  'return a new slug — we will review it. Do not force a poor match. ' +
  'Use `null` (or an empty array for multi-select fields) when nothing applies.';

export function buildPass1Prompt(slugs: TaxonomySlugLists): string {
  return [
    'You are an assistant extracting source-level metadata from policy / report documents.',
    'Return a JSON object with the fields listed below. Do not return a bare array.',
    '',
    `Thematic areas: ${formatSlugList(slugs.thematic_area)}`,
    `Source types: ${formatSlugList(slugs.source_type)}`,
    `Purposes: ${formatSlugList(slugs.purpose)}`,
    `Role relevances: ${formatSlugList(slugs.role_relevance)}`,
    `Target audience types: ${formatSlugList(slugs.target_audience_type)}`,
    '',
    NEW_SLUG_RULE,
    '',
    'The exact JSON shape is:',
    '{',
    '  "summary": "2-3 sentence abstract of the document, or null",',
    '  "authors": ["author name", "..."],',
    '  "publication_date": "ISO date (YYYY-MM-DD) or null",',
    '  "org_owner": "publishing organisation name, or null",',
    '  "thematic_area_slugs": ["slug", "..."],',
    '  "source_type_slugs": ["slug", "..."],',
    '  "purpose_slugs": ["slug", "..."],',
    '  "role_relevance_slugs": ["slug", "..."],',
    '  "target_audience_type_slugs": ["slug", "..."]',
    '}',
  ].join('\n');
}

const PASS2_AXIS_BLOCK = (slugs: TaxonomySlugLists): string =>
  [
    `Thematic areas: ${formatSlugList(slugs.thematic_area)}`,
    `Purposes: ${formatSlugList(slugs.purpose)}`,
    `Target audience types: ${formatSlugList(slugs.target_audience_type)}`,
    `Location scopes: ${formatSlugList(slugs.location_scope)}`,
    `Priority timescales: ${formatSlugList(slugs.priority_timescale)}`,
  ].join('\n');

const PASS2_OUTPUT_SHAPE = [
  'The exact JSON shape is:',
  '{',
  '  "recommendations": [',
  '    {',
  '      "title": "Short title (5+ chars)",',
  '      "body": "Full recommendation text (20+ chars; include header + main explanation, stop at subsections)",',
  '      "thematic_area_slugs": ["slug", "..."],',
  '      "purpose_slugs": ["slug", "..."],',
  '      "target_audience_type_slugs": ["slug", "..."],',
  '      "location_scope_slugs": ["slug", "..."],',
  '      "priority_timescale_slug": "slug or null",',
  '      "target_organization": "specific org named in the rec, or null",',
  '      "notes": "context about which section / null",',
  '      "confidence": "high | medium | low",',
  '      "page_start": null,',
  '      "page_end": null',
  '    }',
  '  ]',
  '}',
].join('\n');

export function buildPass2StrictPrompt(slugs: TaxonomySlugLists): string {
  return [
    'You are a recommendation extraction assistant. The text below is from a document\'s dedicated recommendation sections.',
    'EXTRACT ONLY ACTIONABLE RECOMMENDATIONS that prescribe specific actions.',
    'DO NOT extract statements about what groups "need" or "want" — those are requirements, not recommendations.',
    '',
    'For each recommendation, extract:',
    '- title: short imperative title',
    '- body: COMPLETE text including header AND detailed explanation, stop at subsections',
    '- multi-axis tags from the slug lists below',
    '- priority_timescale_slug + target_organization + notes (if apparent)',
    '- confidence: "high" for clear action items, "medium" for somewhat vague, "low" for context-dependent',
    '- page_start / page_end if you can infer them; otherwise null',
    '',
    PASS2_AXIS_BLOCK(slugs),
    '',
    NEW_SLUG_RULE,
    '',
    'Skip needs assessments, requirements statements, background context. Extract only directives.',
    '',
    PASS2_OUTPUT_SHAPE,
  ].join('\n');
}

export function buildPass2LooserPrompt(slugs: TaxonomySlugLists): string {
  return [
    'You are a recommendation extraction assistant. The text below is a full document — recommendations are scattered throughout, often as section headers with explanations.',
    'EXTRACT RECOMMENDATIONS that are actionable, prescriptive, and concise.',
    '',
    'Look for:',
    '- ## section headers that are themselves actionable',
    '- Numbered lists (1., 2., 3.)',
    '- Imperative statements ("Develop...", "Create...", "Establish...", "Recommend...")',
    '',
    'For each: title + body (header + 1-2 explanatory paragraphs, stop at subsections), multi-axis tags from the slug lists, priority_timescale_slug, target_organization, notes, confidence (high/medium/low), and page anchors if inferable.',
    '',
    PASS2_AXIS_BLOCK(slugs),
    '',
    NEW_SLUG_RULE,
    '',
    'Skip background, descriptions, questions, and supporting rationale. Focus on prescriptive action items.',
    '',
    PASS2_OUTPUT_SHAPE,
  ].join('\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/services/extraction-prompts.test.ts`
Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/extraction-prompts.ts src/lib/services/extraction-prompts.test.ts
git commit -m "feat(extract): Pass 1 + Pass 2 system-prompt builders parameterised by taxonomy slugs"
```

---

## Task 4: Extend the fake LLM provider for the metadata fixture path

**Files:**
- Modify: `src/lib/providers/llm/fake.ts`
- Modify: `src/lib/providers/llm/fake.test.ts`

The handler uses `key = '<stem>:metadata'` for Pass 1 calls and plain `key = '<stem>'` for Pass 2 calls. The fake provider needs to recognise the suffix and load the correct fixture file. Existing wrapping behaviour (for the legacy bare-array Pass 2 fixture format) is removed — Pass 2 fixtures ship in the wrapped shape from Task 6.

- [ ] **Step 1: Inspect the existing test file**

Run: `cat src/lib/providers/llm/fake.test.ts`
Expected: confirms the current tests cover `structuredResponses` map + the `<stem>.recommendations.json` fallback. Note any existing test names so we can extend without duplicating.

- [ ] **Step 2: Update the test file to cover the metadata path**

Read `src/lib/providers/llm/fake.test.ts` and append (before the final closing of the `describe` block, OR as a new `describe` block) these two tests:

```typescript
describe('Pass 1 metadata fixture lookup', () => {
  it('loads <stem>.metadata.json when key is "<stem>:metadata"', async () => {
    const fake = createFakeLlm({ fixturesDir: path.resolve(process.cwd(), 'fixtures/sources') });
    const schema = z.object({ summary: z.string().nullable(), authors: z.array(z.string()) });
    // Will exist once Task 5 lands; until then this test fails — that's fine
    // because Task 5 runs before Task 7's final verify.
    const out = await fake.generateStructured({ prompt: 'p', schema, key: 'sample-report:metadata' });
    expect(out.value.summary).toBeTypeOf('string');
    expect(Array.isArray(out.value.authors)).toBe(true);
  });

  it('still loads <stem>.recommendations.json for plain "<stem>" keys', async () => {
    const fake = createFakeLlm({ fixturesDir: path.resolve(process.cwd(), 'fixtures/sources') });
    const schema = z.object({
      recommendations: z.array(z.object({ title: z.string(), body: z.string() }).passthrough()),
    });
    // Note: requires the Task 6 wrapped-shape fixture. Until then this test
    // fails; it goes green by Task 6.
    const out = await fake.generateStructured({ prompt: 'p', schema, key: 'sample-report' });
    expect(out.value.recommendations.length).toBeGreaterThan(0);
  });
});
```

Add the imports at the top of the file if not already present:

```typescript
import path from 'node:path';
import { z } from 'zod';
```

- [ ] **Step 3: Run the new tests and watch them fail**

Run: `pnpm vitest run src/lib/providers/llm/fake.test.ts -t "metadata fixture lookup"`
Expected: both tests fail — first because the metadata file doesn't exist yet, second either because the file isn't wrapped yet (Task 6) or because the lookup logic doesn't differentiate. That's expected; we fix the loader in Step 4 and they'll go green after Task 5/Task 6 land the fixtures.

- [ ] **Step 4: Update the fake-LLM loader**

Replace the body of `src/lib/providers/llm/fake.ts` with:

```typescript
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { LlmProvider, LlmStructuredInput, LlmStructuredOutput, LlmTextInput, LlmTextOutput } from './types';

export type FakeLlmConfig = {
  /** Map of key → object, used by generateStructured. Wins over fixture files. */
  structuredResponses?: Record<string, unknown>;
  /**
   * Directory holding fixture JSON files. Two filename conventions:
   *   - `<stem>.metadata.json`        — Pass 1 source-metadata fixture
   *   - `<stem>.recommendations.json` — Pass 2 recommendations fixture
   * Resolution order: explicit config → `FIXTURES_DIR` env → `<cwd>/fixtures/sources`.
   */
  fixturesDir?: string;
};

function resolveFixturesDir(config: FakeLlmConfig): string {
  if (config.fixturesDir) return config.fixturesDir;
  const fromEnv = process.env.FIXTURES_DIR;
  if (fromEnv && fromEnv.length > 0) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), 'fixtures/sources');
}

/**
 * Map a structured-call key onto a fixture file path. Keys ending in
 * `:metadata` route to `<stem>.metadata.json`; all other keys route to
 * `<stem>.recommendations.json`. The suffix is the only signal: the
 * handler controls it explicitly per pass.
 */
function fixturePathFor(fixturesDir: string, key: string): string {
  if (key.endsWith(':metadata')) {
    const stem = key.slice(0, -':metadata'.length);
    return path.join(fixturesDir, `${stem}.metadata.json`);
  }
  return path.join(fixturesDir, `${key}.recommendations.json`);
}

async function loadFixtureResponse(fixturesDir: string, key: string): Promise<unknown | undefined> {
  const fixturePath = fixturePathFor(fixturesDir, key);
  let raw: string;
  try {
    raw = await readFile(fixturePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`fake LLM: fixture at ${fixturePath} is not valid JSON: ${(err as Error).message}`);
  }
}

export function createFakeLlm(config: FakeLlmConfig = {}): LlmProvider {
  const responses = config.structuredResponses ?? {};
  return {
    name: 'fake',
    async generateText(input: LlmTextInput): Promise<LlmTextOutput> {
      return { text: `[fake-llm] ${input.prompt}` };
    },
    async generateStructured<T>(input: LlmStructuredInput<T>): Promise<LlmStructuredOutput<T>> {
      const key = input.key ?? 'default';
      let raw: unknown = responses[key];
      if (raw === undefined) {
        // Fallback: derive a fixture path from the key.
        raw = await loadFixtureResponse(resolveFixturesDir(config), key);
      }
      if (raw === undefined) {
        throw new Error(`fake LLM: no structured response registered for key="${key}"`);
      }
      const parsed = input.schema.safeParse(raw);
      if (parsed.success) return { value: parsed.data };
      throw parsed.error;
    },
  };
}
```

The legacy bare-array wrapping is gone — Task 6 will ship Pass 2 fixtures in the wrapped shape.

- [ ] **Step 5: Run the existing fake.test.ts suite**

Run: `pnpm vitest run src/lib/providers/llm/fake.test.ts`
Expected: the structured-response map tests still pass; the legacy bare-array wrap test (if it exists) now fails. We address the legacy test by either deleting it (if it was the only consumer) or updating Pass 2 fixtures in Task 6 to the wrapped shape. If a test fails with a name like "wraps bare array" — delete it; that behaviour is gone.

- [ ] **Step 6: Commit (still partial — metadata test from Step 2 stays red until Task 5)**

```bash
git add src/lib/providers/llm/fake.ts src/lib/providers/llm/fake.test.ts
git commit -m "feat(llm-fake): route '<stem>:metadata' keys to <stem>.metadata.json fixtures; drop bare-array wrapping"
```

---

## Task 5: Pass 1 metadata fixtures

**Files:**
- Create: `fixtures/sources/sample-report.metadata.json`
- Create: `fixtures/sources/sample-policy.metadata.json`

Both fixtures should satisfy `SourceMetadataSchema` (from Task 1) and use slug values that exist in the seeded taxonomy plus, optionally, one unknown slug so we can exercise the auto-create path in Task 8.

- [ ] **Step 1: Create the sample-report metadata fixture**

Create `fixtures/sources/sample-report.metadata.json`:

```json
{
  "summary": "Annual governance and risk review for the sample organisation, covering board-level risk oversight, safeguarding reporting, and auditor rotation.",
  "authors": ["Sample Risk Committee"],
  "publication_date": "2025-03-01",
  "org_owner": "Sample Charity Limited",
  "thematic_area_slugs": ["governance", "data"],
  "source_type_slugs": ["annual-review"],
  "purpose_slugs": ["strategy", "policy-development"],
  "role_relevance_slugs": ["senior-leader", "policy-maker"],
  "target_audience_type_slugs": ["funders", "commissioning-bodies"]
}
```

- [ ] **Step 2: Create the sample-policy metadata fixture**

Create `fixtures/sources/sample-policy.metadata.json`:

```json
{
  "summary": "Policy paper outlining recommended changes to the funding regime for small charities.",
  "authors": ["Policy Working Group"],
  "publication_date": "2024-11-15",
  "org_owner": "Example Policy Institute",
  "thematic_area_slugs": ["governance", "philanthropy"],
  "source_type_slugs": ["policy-paper"],
  "purpose_slugs": ["policy-development", "advocacy"],
  "role_relevance_slugs": ["policy-maker"],
  "target_audience_type_slugs": ["government-national", "funders"]
}
```

- [ ] **Step 3: Re-run the fake-LLM test from Task 4**

Run: `pnpm vitest run src/lib/providers/llm/fake.test.ts -t "metadata fixture lookup"`
Expected: the first of the two metadata-fixture tests now passes; the second still fails because Task 6's Pass 2 wrapped fixture hasn't landed yet.

- [ ] **Step 4: Commit**

```bash
git add fixtures/sources/sample-report.metadata.json fixtures/sources/sample-policy.metadata.json
git commit -m "test(fixtures): Pass 1 source-metadata fixtures for sample-report + sample-policy"
```

---

## Task 6: Update Pass 2 recommendation fixtures to the new shape

**Files:**
- Modify: `fixtures/sources/sample-report.recommendations.json`
- Modify: `fixtures/sources/sample-policy.recommendations.json`

Both fixtures move from the legacy flat-array `[{ title, full_text, thematic_area_slug }]` shape to the new wrapped `{ recommendations: [{ title, body, thematic_area_slugs, ... }] }` shape required by `RecommendationsSchema`.

- [ ] **Step 1: Replace sample-report.recommendations.json**

Replace the entire file content with:

```json
{
  "recommendations": [
    {
      "title": "Establish a board-level risk committee",
      "body": "Establish a board-level risk committee to meet quarterly. The committee should report to the trustees and own the organisational risk register.",
      "thematic_area_slugs": ["governance"],
      "purpose_slugs": ["policy-development"],
      "target_audience_type_slugs": ["funders"],
      "location_scope_slugs": ["national"],
      "priority_timescale_slug": "medium-term",
      "target_organization": "Sample Charity Limited",
      "notes": "Recommendation 1 of the annual review.",
      "confidence": "high",
      "page_start": 1,
      "page_end": 1
    },
    {
      "title": "Publish an annual safeguarding report",
      "body": "Publish an annual safeguarding report within three months of year-end. The report should cover incidents, training completion rates, and remedial actions.",
      "thematic_area_slugs": ["governance"],
      "purpose_slugs": ["practice-service-improvement"],
      "target_audience_type_slugs": ["communities", "funders"],
      "location_scope_slugs": ["national"],
      "priority_timescale_slug": "short-term",
      "target_organization": null,
      "notes": "Recommendation 2 of the annual review.",
      "confidence": "high",
      "page_start": 1,
      "page_end": 2
    },
    {
      "title": "Rotate external auditors regularly",
      "body": "Rotate external auditors at least every seven financial years. Document the rotation policy in the audit-committee terms of reference.",
      "thematic_area_slugs": ["governance"],
      "purpose_slugs": ["policy-development"],
      "target_audience_type_slugs": ["funders"],
      "location_scope_slugs": ["national"],
      "priority_timescale_slug": "long-term",
      "target_organization": null,
      "notes": "Recommendation 3 of the annual review.",
      "confidence": "medium",
      "page_start": 2,
      "page_end": 2
    }
  ]
}
```

Note: the legacy fixture used `safeguarding` and `finance` themes; we collapse all three recs onto `governance` because `safeguarding` and `finance` are not in the v1 default taxonomy seeded in PR 1. (The handler test in Task 8 separately exercises the unknown-slug auto-create path.)

- [ ] **Step 2: Replace sample-policy.recommendations.json**

Read the existing file first:

Run: `cat fixtures/sources/sample-policy.recommendations.json`
Expected: legacy flat-array shape with N recs.

Then replace the entire file content with:

```json
{
  "recommendations": [
    {
      "title": "Index small-charity grants to inflation",
      "body": "Index small-charity grants to inflation so funding values do not erode in real terms. Apply the index annually using the published CPI rate.",
      "thematic_area_slugs": ["philanthropy", "economic-development"],
      "purpose_slugs": ["policy-development", "advocacy"],
      "target_audience_type_slugs": ["funders", "government-national"],
      "location_scope_slugs": ["national"],
      "priority_timescale_slug": "medium-term",
      "target_organization": "HM Treasury",
      "notes": "Headline policy recommendation.",
      "confidence": "high",
      "page_start": 1,
      "page_end": 1
    },
    {
      "title": "Simplify the reporting burden for grants under £50k",
      "body": "Simplify the reporting burden for grants under fifty thousand pounds. A short outcomes summary should suffice; replace line-by-line financial reporting with attestation.",
      "thematic_area_slugs": ["governance", "philanthropy"],
      "purpose_slugs": ["practice-service-improvement"],
      "target_audience_type_slugs": ["funders"],
      "location_scope_slugs": ["national"],
      "priority_timescale_slug": "short-term",
      "target_organization": null,
      "notes": "Supporting recommendation.",
      "confidence": "medium",
      "page_start": 2,
      "page_end": 2
    }
  ]
}
```

- [ ] **Step 3: Re-run the fake-LLM test from Task 4**

Run: `pnpm vitest run src/lib/providers/llm/fake.test.ts -t "metadata fixture lookup"`
Expected: both tests pass.

- [ ] **Step 4: Commit**

```bash
git add fixtures/sources/sample-report.recommendations.json fixtures/sources/sample-policy.recommendations.json
git commit -m "test(fixtures): Pass 2 recommendations fixtures rewritten for the new wrapped schema (multi-axis tags, confidence, page anchors)"
```

---

## Task 7: Rewrite the `source.extract` handler

**Files:**
- Modify: `src/lib/jobs/handlers/extract.ts`

This is the biggest task. The handler:
1. Loads taxonomy slug lists for every multi-axis (themes / source_types / purposes / role_relevances / target_audience_types / location_scopes / priority_timescales).
2. Pass 1: calls the LLM with `SourceMetadataSchema` and key `<stem>:metadata`; updates the `sources` row with summary, authors, publication_date, org_owner; replaces M2M memberships for the five source-side axes via the PR-1 repo helpers.
3. Section detection: `detectRecommendationSections(canonicalMarkdown)`.
4. Pass 2: chooses strict or looser prompt based on detection result; calls the LLM with `RecommendationsSchema` and key `<stem>`; for each rec, resolves the four multi-axis tag slug lists + the priority_timescale_slug to ids; inserts the rec row (with target_organization, notes, confidence, priorityTimescaleId), seeds the initial `'open'` status, replaces M2M memberships via the PR-1 repo helpers.
5. Idempotency: clear existing recs (and M2M cascades) for the source before inserting Pass 2 output; for Pass 1, M2M `replaceSource*` calls are themselves idempotent (diff).

- [ ] **Step 1: Replace `extract.ts` with the new implementation**

Replace the entire file content with:

```typescript
import { and, asc, eq } from 'drizzle-orm';
import type { JobContext } from '../context';
import type { QueuePayloads } from '../types';
import {
  recommendations,
  recommendationStatuses,
  sourceFiles,
  sources,
} from '@/lib/db/schema';
import {
  RecommendationsSchema,
  SourceMetadataSchema,
  type RecommendationInput,
  type SourceMetadataOutput,
} from '@/lib/services/extraction-schema';
import { detectRecommendationSections } from '@/lib/services/extraction-sections';
import {
  buildPass1Prompt,
  buildPass2LooserPrompt,
  buildPass2StrictPrompt,
  type TaxonomySlugLists,
} from '@/lib/services/extraction-prompts';
import {
  listLocationScopes,
  listPriorityTimescales,
  listPurposes,
  listRoleRelevances,
  listSourceTypes,
  listTargetAudienceTypes,
  listThematicAreas,
  resolveOrCreateLocationScopes,
  resolveOrCreatePriorityTimescales,
  resolveOrCreatePurposes,
  resolveOrCreateRoleRelevances,
  resolveOrCreateSourceTypes,
  resolveOrCreateTargetAudienceTypes,
  resolveOrCreateThematicAreas,
} from '@/lib/repositories/taxonomy';
import {
  replaceSourcePurposes,
  replaceSourceRoleRelevances,
  replaceSourceSourceTypes,
  replaceSourceTargetAudienceTypes,
  replaceSourceThematicAreas,
} from '@/lib/repositories/source-tags';
import {
  replaceRecommendationLocationScopes,
  replaceRecommendationPurposes,
  replaceRecommendationTargetAudienceTypes,
  replaceRecommendationThematicAreas,
} from '@/lib/repositories/recommendation-tags';
import type { RepoContext } from '@/lib/repositories/types';

const MAX_PASS1_MARKDOWN = 10_000;
const MAX_PASS2_MARKDOWN = 100_000;

function fixtureKeyFromStorageKey(storageKey: string): string {
  const filename = storageKey.split('/').pop() ?? storageKey;
  return filename.replace(/\.[^.]+$/, '');
}

function truncate(markdown: string, max: number): string {
  if (markdown.length <= max) return markdown;
  const cut = markdown.slice(0, max);
  return `${cut}\n\n<!-- truncated: ${markdown.length - max} chars omitted -->`;
}

function parsePublicationDate(input: string | null): Date | null {
  if (!input) return null;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

/**
 * `source.extract` handler — two-pass, section-aware.
 *
 * Pass 1: source metadata (summary, authors, dates, taxonomies for the
 * source itself). Reads the first ~10k chars of canonical markdown so the
 * LLM sees front matter + executive summary without the whole document.
 *
 * Pass 2: recommendations. Detects recommendation-shaped headings; if
 * found, sends just those sections with a strict prompt; otherwise sends
 * the (truncated) full document with a looser prompt. Persists every rec
 * with its multi-axis tags + priority_timescale FK + confidence.
 *
 * Idempotency: pg-boss retries trigger a full re-run. Both passes are
 * idempotent — Pass 1 UPDATEs source columns and calls `replaceSource*`
 * (set membership, not append); Pass 2 deletes existing recs for the
 * source before inserting, and `replaceRecommendation*` is set membership.
 *
 * Unknown slugs: the LLM is asked to coin a new slug when no listed slug
 * fits. `resolveOrCreate*` auto-creates those with `unverified=true` so
 * an admin can promote / rename / merge / delete via /admin/tags (PR 3).
 */
export async function extractHandler(
  ctx: JobContext,
  payload: QueuePayloads['source.extract'],
): Promise<void> {
  const { sourceId } = payload;
  try {
    await ctx.emit(sourceId, { type: 'phase', phase: 'extracting' });

    const [sourceRow] = await ctx.db
      .select({ slug: sources.slug, canonical: sources.canonicalMarkdown })
      .from(sources)
      .where(eq(sources.id, sourceId));
    if (!sourceRow) {
      throw new Error(`source.extract: source ${sourceId} not found`);
    }
    const canonicalMarkdown = sourceRow.canonical ?? '';

    // Locate the original upload so the fake LLM provider can find the
    // matching fixture file. Real LLM adapters ignore `key`.
    const fileRows = await ctx.db
      .select({ storageKey: sourceFiles.storageKey })
      .from(sourceFiles)
      .where(and(eq(sourceFiles.sourceId, sourceId), eq(sourceFiles.role, 'original')))
      .orderBy(asc(sourceFiles.createdAt))
      .limit(1);
    const fixtureKey = fileRows[0] ? fixtureKeyFromStorageKey(fileRows[0].storageKey) : sourceRow.slug;

    // RepoContext for the taxonomy + tag-membership repo functions. Uses
    // the same db handle as the rest of the handler; auth is system context
    // because extraction runs under the worker, not a user request.
    const repoCtx: RepoContext = {
      db: ctx.db,
      auth: { user: { id: 'system', name: 'system' }, roles: ['admin'], isSystem: true },
    };

    // Load every taxonomy axis up front. The slugs are interpolated into
    // both prompts so the LLM picks from known vocabulary.
    const [
      themeRows,
      sourceTypeRows,
      purposeRows,
      roleRelevanceRows,
      targetAudienceTypeRows,
      locationScopeRows,
      priorityTimescaleRows,
    ] = await Promise.all([
      listThematicAreas(repoCtx),
      listSourceTypes(repoCtx),
      listPurposes(repoCtx),
      listRoleRelevances(repoCtx),
      listTargetAudienceTypes(repoCtx),
      listLocationScopes(repoCtx),
      listPriorityTimescales(repoCtx),
    ]);
    const taxonomySlugs: TaxonomySlugLists = {
      thematic_area: themeRows.map((r) => r.slug),
      source_type: sourceTypeRows.map((r) => r.slug),
      purpose: purposeRows.map((r) => r.slug),
      role_relevance: roleRelevanceRows.map((r) => r.slug),
      target_audience_type: targetAudienceTypeRows.map((r) => r.slug),
      location_scope: locationScopeRows.map((r) => r.slug),
      priority_timescale: priorityTimescaleRows.map((r) => r.slug),
    };

    // ----- Pass 1: source metadata -----------------------------------------
    const pass1Input = truncate(canonicalMarkdown, MAX_PASS1_MARKDOWN);
    const pass1 = await ctx.providers.llm.generateStructured({
      prompt: `Extract the source-level metadata for the following document.\n\n---\n${pass1Input}`,
      system: buildPass1Prompt(taxonomySlugs),
      schema: SourceMetadataSchema,
      key: `${fixtureKey}:metadata`,
    });
    const metadata: SourceMetadataOutput = pass1.value;

    await ctx.db
      .update(sources)
      .set({
        summary: metadata.summary,
        authors: metadata.authors,
        publicationDate: parsePublicationDate(metadata.publication_date),
        orgOwner: metadata.org_owner,
        updatedAt: new Date(),
      })
      .where(eq(sources.id, sourceId));

    const themeIdsForSource = await resolveOrCreateThematicAreas(
      repoCtx,
      metadata.thematic_area_slugs,
    );
    await replaceSourceThematicAreas(repoCtx, sourceId, themeIdsForSource);
    const sourceTypeIds = await resolveOrCreateSourceTypes(repoCtx, metadata.source_type_slugs);
    await replaceSourceSourceTypes(repoCtx, sourceId, sourceTypeIds);
    const sourcePurposeIds = await resolveOrCreatePurposes(repoCtx, metadata.purpose_slugs);
    await replaceSourcePurposes(repoCtx, sourceId, sourcePurposeIds);
    const roleIds = await resolveOrCreateRoleRelevances(repoCtx, metadata.role_relevance_slugs);
    await replaceSourceRoleRelevances(repoCtx, sourceId, roleIds);
    const audienceIdsForSource = await resolveOrCreateTargetAudienceTypes(
      repoCtx,
      metadata.target_audience_type_slugs,
    );
    await replaceSourceTargetAudienceTypes(repoCtx, sourceId, audienceIdsForSource);

    // ----- Section detection + Pass 2 ------------------------------------
    const section = detectRecommendationSections(canonicalMarkdown);
    const pass2Input = truncate(section.processText, MAX_PASS2_MARKDOWN);
    const pass2System =
      section.mode === 'sections'
        ? buildPass2StrictPrompt(taxonomySlugs)
        : buildPass2LooserPrompt(taxonomySlugs);

    const pass2 = await ctx.providers.llm.generateStructured({
      prompt: `Extract every actionable recommendation from the text below.\n\n---\n${pass2Input}`,
      system: pass2System,
      schema: RecommendationsSchema,
      key: fixtureKey,
    });
    const recs: RecommendationInput[] = pass2.value.recommendations;

    await ctx.db.transaction(async (tx) => {
      // Idempotency: delete existing recs for this source. Cascades clear
      // recommendation_statuses + every rec-side M2M row automatically.
      await tx.delete(recommendations).where(eq(recommendations.sourceId, sourceId));
    });

    for (let i = 0; i < recs.length; i += 1) {
      const rec = recs[i]!;
      const slugBase = rec.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
      const slug = `${slugBase || 'rec'}-${sourceId.slice(0, 8)}-${i}`;

      const priorityIds = rec.priority_timescale_slug
        ? await resolveOrCreatePriorityTimescales(repoCtx, [rec.priority_timescale_slug])
        : [];
      const priorityTimescaleId = priorityIds[0] ?? null;

      const [insertedRec] = await ctx.db
        .insert(recommendations)
        .values({
          sourceId,
          slug,
          title: rec.title,
          body: rec.body,
          pageAnchor: rec.page_start ?? null,
          targetOrganization: rec.target_organization ?? null,
          priorityTimescaleId,
          notes: rec.notes ?? null,
          confidence: rec.confidence,
        })
        .returning({ id: recommendations.id });
      if (!insertedRec) throw new Error('source.extract: recommendation insert returned no row');

      await ctx.db.insert(recommendationStatuses).values({
        recommendationId: insertedRec.id,
        status: 'open',
        note: 'initial',
      });

      const themeIds = await resolveOrCreateThematicAreas(repoCtx, rec.thematic_area_slugs);
      await replaceRecommendationThematicAreas(repoCtx, insertedRec.id, themeIds);
      const purposeIds = await resolveOrCreatePurposes(repoCtx, rec.purpose_slugs);
      await replaceRecommendationPurposes(repoCtx, insertedRec.id, purposeIds);
      const audienceIds = await resolveOrCreateTargetAudienceTypes(
        repoCtx,
        rec.target_audience_type_slugs,
      );
      await replaceRecommendationTargetAudienceTypes(repoCtx, insertedRec.id, audienceIds);
      const locationIds = await resolveOrCreateLocationScopes(repoCtx, rec.location_scope_slugs);
      await replaceRecommendationLocationScopes(repoCtx, insertedRec.id, locationIds);
    }

    // Final phase update — source advances to `embedding` (the next pipeline
    // stage). The actual `source.embed` enqueue lives in the queue wiring.
    await ctx.db
      .update(sources)
      .set({ status: 'embedding', updatedAt: new Date() })
      .where(eq(sources.id, sourceId));
    await ctx.queue.enqueue('source.embed', { sourceId });

    await ctx.emit(sourceId, {
      type: 'progress',
      percent: 80,
      message: `extracted ${recs.length} recommendation(s); ${section.mode === 'sections' ? 'from sections' : 'from full document'}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await ctx.emit(sourceId, { type: 'error', message });
    } catch {
      // emit failure shouldn't mask the real error
    }
    try {
      await ctx.db
        .update(sources)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(sources.id, sourceId));
    } catch {
      // bookkeeping failures shouldn't mask the real error
    }
    throw err;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors. If there are import resolution failures, double-check that all the new imports point at files PR 1 created.

- [ ] **Step 3: Commit (extract.test.ts is still red — fixed in Task 8)**

```bash
git add src/lib/jobs/handlers/extract.ts
git commit -m "feat(extract): two-pass section-aware handler populating new schema (source metadata + multi-axis tags + confidence + priority FK)"
```

---

## Task 8: Rewrite the `extract.test.ts` against the new schema

**Files:**
- Modify: `src/lib/jobs/handlers/extract.test.ts`

The old test covers: happy-path extract, unknown-slug skipping (now: unknown-slug auto-create), retry idempotency, failure path. We extend each plus add tests for: Pass 1 metadata persistence, multi-axis tag persistence, confidence persistence, priority_timescale FK, section-detection branches.

- [ ] **Step 1: Read the existing test file to anchor the rewrite**

Run: `cat src/lib/jobs/handlers/extract.test.ts | head -200`
Expected: confirms the existing structure — `beforeAll` boots Postgres + queue + providers; per-test seeds a source row with canonical markdown; the test file uses `createFakeLlm` to stub structured responses.

- [ ] **Step 2: Replace the test file with the new version**

Replace the entire content of `src/lib/jobs/handlers/extract.test.ts` with:

```typescript
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPostgres, type StartedPg } from '../../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../../tests/helpers/migrate';
import { createDb, type DbClient } from '@/lib/db/client';
import { loadEnv, type Env } from '@/lib/env';
import { createQueue, type Queue } from '@/lib/jobs/queue';
import { emitJobEvent } from '@/lib/jobs/events';
import { createProviders, type Providers } from '@/lib/providers';
import type { JobContext } from '@/lib/jobs/context';
import {
  recommendations,
  recommendationStatuses,
  recommendationsLocationScopes,
  recommendationsPurposes,
  recommendationsTargetAudienceTypes,
  recommendationsThematicAreas,
  sourceFiles,
  sources,
  sourcesPurposes,
  sourcesRoleRelevances,
  sourcesSourceTypes,
  sourcesTargetAudienceTypes,
  sourcesThematicAreas,
  thematicAreas,
} from '@/lib/db/schema';
import type { LlmProvider, LlmStructuredInput, LlmStructuredOutput } from '@/lib/providers/llm/types';
import { createFakeLlm } from '@/lib/providers/llm/fake';
import { seedTaxonomy } from '@/lib/db/seed-taxonomy';
import { extractHandler } from './extract';

let pg: StartedPg;
let queue: Queue;
let dbClient: DbClient;
let env: Env;
let baseProviders: Providers;

const fixtureDir = path.resolve(process.cwd(), 'fixtures/sources');
const fixtureStem = 'sample-report';

async function loadFixtureMetadata(): Promise<{ thematic_area_slugs: string[]; target_audience_type_slugs: string[] }> {
  const raw = await readFile(path.join(fixtureDir, `${fixtureStem}.metadata.json`), 'utf8');
  return JSON.parse(raw);
}

async function loadFixtureRecs(): Promise<Array<{ title: string; body: string; thematic_area_slugs: string[] }>> {
  const raw = await readFile(path.join(fixtureDir, `${fixtureStem}.recommendations.json`), 'utf8');
  return JSON.parse(raw).recommendations;
}

async function seedSource(opts: { filename: string; canonical?: string }): Promise<{ sourceId: string }> {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const [srow] = await dbClient.db
    .insert(sources)
    .values({ slug, title: opts.filename, canonicalMarkdown: opts.canonical ?? null })
    .returning({ id: sources.id });
  if (!srow) throw new Error('seed: source returned no row');
  await dbClient.db.insert(sourceFiles).values({
    sourceId: srow.id,
    role: 'original',
    storageKey: `sources/${srow.id}/${opts.filename}`,
    mimeType: 'application/pdf',
  });
  return { sourceId: srow.id };
}

function ctxWithProviders(providers: Providers): JobContext {
  return {
    queue,
    db: dbClient.db,
    providers,
    env,
    emit: (channelId, event) => emitJobEvent(dbClient.sql, channelId, event),
  };
}

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
  dbClient = createDb(pg.url);
  await seedTaxonomy(dbClient.db);
  queue = await createQueue({ connectionString: pg.url });
  env = loadEnv({
    APP_MODE: 'local',
    DATABASE_URL: pg.url,
    LLM_PROVIDER: 'fake',
    EMBEDDING_PROVIDER: 'fake',
    OCR_PROVIDER: 'fake',
    STORAGE_PROVIDER: 'fake',
  });
  baseProviders = createProviders(env);
}, 180_000);

afterAll(async () => {
  await queue?.stop();
  await dbClient?.sql.end({ timeout: 5 });
  await pg?.container.stop();
});

describe('extractHandler — Pass 1 (source metadata)', () => {
  it('persists summary, authors, publication_date, org_owner from the metadata fixture', async () => {
    const { sourceId } = await seedSource({ filename: `${fixtureStem}.pdf`, canonical: '# Page One\n\nText.' });
    await extractHandler(ctxWithProviders(baseProviders), { sourceId });
    const [row] = await dbClient.db
      .select({
        summary: sources.summary,
        authors: sources.authors,
        publicationDate: sources.publicationDate,
        orgOwner: sources.orgOwner,
      })
      .from(sources)
      .where(eq(sources.id, sourceId));
    expect(row?.summary).toMatch(/Annual governance/i);
    expect(row?.authors).toEqual(['Sample Risk Committee']);
    expect(row?.orgOwner).toBe('Sample Charity Limited');
    expect(row?.publicationDate).toBeInstanceOf(Date);
  });

  it('persists source-side multi-axis M2M memberships from the metadata fixture', async () => {
    const { sourceId } = await seedSource({ filename: `${fixtureStem}.pdf`, canonical: '# Page One' });
    await extractHandler(ctxWithProviders(baseProviders), { sourceId });
    const meta = await loadFixtureMetadata();

    const themes = await dbClient.db
      .select()
      .from(sourcesThematicAreas)
      .where(eq(sourcesThematicAreas.sourceId, sourceId));
    expect(themes).toHaveLength(meta.thematic_area_slugs.length);

    const types = await dbClient.db
      .select()
      .from(sourcesSourceTypes)
      .where(eq(sourcesSourceTypes.sourceId, sourceId));
    expect(types).toHaveLength(1);

    const purposes = await dbClient.db
      .select()
      .from(sourcesPurposes)
      .where(eq(sourcesPurposes.sourceId, sourceId));
    expect(purposes).toHaveLength(2);

    const roles = await dbClient.db
      .select()
      .from(sourcesRoleRelevances)
      .where(eq(sourcesRoleRelevances.sourceId, sourceId));
    expect(roles).toHaveLength(2);

    const audiences = await dbClient.db
      .select()
      .from(sourcesTargetAudienceTypes)
      .where(eq(sourcesTargetAudienceTypes.sourceId, sourceId));
    expect(audiences).toHaveLength(meta.target_audience_type_slugs.length);
  });
});

describe('extractHandler — Pass 2 (recommendations)', () => {
  it('inserts every recommendation from the fixture with the expected columns', async () => {
    const { sourceId } = await seedSource({ filename: `${fixtureStem}.pdf`, canonical: '# Page One' });
    await extractHandler(ctxWithProviders(baseProviders), { sourceId });
    const fixtureRecs = await loadFixtureRecs();

    const recRows = await dbClient.db
      .select({
        title: recommendations.title,
        body: recommendations.body,
        confidence: recommendations.confidence,
        priorityTimescaleId: recommendations.priorityTimescaleId,
        targetOrganization: recommendations.targetOrganization,
      })
      .from(recommendations)
      .where(eq(recommendations.sourceId, sourceId));
    expect(recRows).toHaveLength(fixtureRecs.length);
    expect(recRows.map((r) => r.title).sort()).toEqual(fixtureRecs.map((f) => f.title).sort());

    for (const row of recRows) {
      expect(row.confidence).toMatch(/^(high|medium|low)$/);
      expect(row.priorityTimescaleId).toBeTruthy();
    }
  });

  it('seeds an initial open status per recommendation', async () => {
    const { sourceId } = await seedSource({ filename: `${fixtureStem}.pdf`, canonical: '# Page One' });
    await extractHandler(ctxWithProviders(baseProviders), { sourceId });
    const fixtureRecs = await loadFixtureRecs();

    const recIds = await dbClient.db
      .select({ id: recommendations.id })
      .from(recommendations)
      .where(eq(recommendations.sourceId, sourceId));

    for (const { id } of recIds) {
      const statusRows = await dbClient.db
        .select({ status: recommendationStatuses.status })
        .from(recommendationStatuses)
        .where(eq(recommendationStatuses.recommendationId, id));
      expect(statusRows.map((s) => s.status)).toEqual(['open']);
    }
    expect(recIds).toHaveLength(fixtureRecs.length);
  });

  it('persists rec-side multi-axis M2M memberships', async () => {
    const { sourceId } = await seedSource({ filename: `${fixtureStem}.pdf`, canonical: '# Page One' });
    await extractHandler(ctxWithProviders(baseProviders), { sourceId });

    const recIds = (await dbClient.db
      .select({ id: recommendations.id })
      .from(recommendations)
      .where(eq(recommendations.sourceId, sourceId))).map((r) => r.id);

    // Every fixture rec has at least one theme, one purpose, one audience,
    // one location. Spot-check that at least one rec has memberships in
    // each of the four M2M tables.
    for (const id of recIds) {
      const themes = await dbClient.db
        .select()
        .from(recommendationsThematicAreas)
        .where(eq(recommendationsThematicAreas.recommendationId, id));
      expect(themes.length).toBeGreaterThan(0);
      const purposes = await dbClient.db
        .select()
        .from(recommendationsPurposes)
        .where(eq(recommendationsPurposes.recommendationId, id));
      expect(purposes.length).toBeGreaterThan(0);
      const audiences = await dbClient.db
        .select()
        .from(recommendationsTargetAudienceTypes)
        .where(eq(recommendationsTargetAudienceTypes.recommendationId, id));
      expect(audiences.length).toBeGreaterThan(0);
      const locations = await dbClient.db
        .select()
        .from(recommendationsLocationScopes)
        .where(eq(recommendationsLocationScopes.recommendationId, id));
      expect(locations.length).toBeGreaterThan(0);
    }
  });
});

describe('extractHandler — unknown slugs', () => {
  it('auto-creates unknown taxonomy slugs as unverified=true', async () => {
    // Override fake LLM with a custom response that includes an unknown slug
    // on both Pass 1 and Pass 2.
    const customLlm: LlmProvider = {
      name: 'fake-with-unknown',
      async generateText() {
        return { text: '' };
      },
      async generateStructured<T>(input: LlmStructuredInput<T>): Promise<LlmStructuredOutput<T>> {
        if (input.key?.endsWith(':metadata')) {
          return {
            value: input.schema.parse({
              summary: 'Test',
              authors: ['Author'],
              publication_date: null,
              org_owner: null,
              thematic_area_slugs: ['quantum-ethics'],
              source_type_slugs: [],
              purpose_slugs: [],
              role_relevance_slugs: [],
              target_audience_type_slugs: [],
            }),
          } as LlmStructuredOutput<T>;
        }
        return {
          value: input.schema.parse({
            recommendations: [
              {
                title: 'Made-up rec for unknown slug test',
                body: 'This rec uses both a known slug (governance) and an unknown one.',
                thematic_area_slugs: ['governance', 'newly-coined-area'],
                purpose_slugs: [],
                target_audience_type_slugs: [],
                location_scope_slugs: [],
                priority_timescale_slug: null,
                target_organization: null,
                notes: null,
                confidence: 'medium',
                page_start: null,
                page_end: null,
              },
            ],
          }),
        } as LlmStructuredOutput<T>;
      },
    };
    const providers: Providers = { ...baseProviders, llm: customLlm };
    const { sourceId } = await seedSource({ filename: 'unknown-slug-test.pdf', canonical: '# X' });
    await extractHandler(ctxWithProviders(providers), { sourceId });

    const [quantum] = await dbClient.db
      .select({ unverified: thematicAreas.unverified })
      .from(thematicAreas)
      .where(eq(thematicAreas.slug, 'quantum-ethics'));
    expect(quantum?.unverified).toBe(true);

    const [coined] = await dbClient.db
      .select({ unverified: thematicAreas.unverified })
      .from(thematicAreas)
      .where(eq(thematicAreas.slug, 'newly-coined-area'));
    expect(coined?.unverified).toBe(true);
  });
});

describe('extractHandler — idempotency', () => {
  it('re-runs are safe: delete-then-insert means rec count stays stable across retries', async () => {
    const { sourceId } = await seedSource({ filename: `${fixtureStem}.pdf`, canonical: '# Page One' });
    await extractHandler(ctxWithProviders(baseProviders), { sourceId });
    const firstCount = await dbClient.db
      .select({ id: recommendations.id })
      .from(recommendations)
      .where(eq(recommendations.sourceId, sourceId));

    await extractHandler(ctxWithProviders(baseProviders), { sourceId });
    const secondCount = await dbClient.db
      .select({ id: recommendations.id })
      .from(recommendations)
      .where(eq(recommendations.sourceId, sourceId));
    expect(secondCount.length).toBe(firstCount.length);
  });
});

describe('extractHandler — failure path', () => {
  it('flips sources.status to failed when the LLM call throws', async () => {
    const brokenLlm: LlmProvider = {
      name: 'broken',
      async generateText() {
        return { text: '' };
      },
      async generateStructured(): Promise<LlmStructuredOutput<unknown>> {
        throw new Error('synthetic LLM failure');
      },
    };
    const providers: Providers = { ...baseProviders, llm: brokenLlm };
    const { sourceId } = await seedSource({ filename: 'fail.pdf', canonical: '# X' });
    await expect(extractHandler(ctxWithProviders(providers), { sourceId })).rejects.toThrow(
      /synthetic LLM failure/,
    );
    const [row] = await dbClient.db
      .select({ status: sources.status })
      .from(sources)
      .where(eq(sources.id, sourceId));
    expect(row?.status).toBe('failed');
  });
});
```

- [ ] **Step 3: Run the test**

Run: `pnpm vitest run src/lib/jobs/handlers/extract.test.ts`
Expected: all tests pass. The first run will take a while (Testcontainers cold start ~15-30s).

- [ ] **Step 4: Commit**

```bash
git add src/lib/jobs/handlers/extract.test.ts
git commit -m "test(extract): rewrite tests against the two-pass section-aware handler"
```

---

## Task 9: Update `pipeline.e2e.test.ts` for the new schema

**Files:**
- Modify: `tests/pipeline.e2e.test.ts`

The end-to-end pipeline test currently asserts `recommendations` count + per-rec embedding shape. After PR 2, the same fixture flow also populates source-side and rec-side M2M memberships plus metadata columns. We add assertions for those without disturbing the existing structure.

- [ ] **Step 1: Locate the assertion block in the e2e test**

Run: `grep -n "expect(recRows)\|expect(pages)\|expect(vecRows)" tests/pipeline.e2e.test.ts`
Expected: line numbers for the final-state assertions inside the happy-path `it`.

- [ ] **Step 2: Read the surrounding context**

Run: `sed -n '150,220p' tests/pipeline.e2e.test.ts`
Expected: see the structure of the post-`status='ready'` assertions block. Identify the imports we'll need to add.

- [ ] **Step 3: Add imports**

At the top of `tests/pipeline.e2e.test.ts`, find the existing `@/lib/db/schema` import. Add to its named imports the M2M tables we'll reference:

```typescript
import {
  recommendations,
  recommendationsThematicAreas,
  recommendationsPurposes,
  recommendationsTargetAudienceTypes,
  recommendationsLocationScopes,
  sourcePages,
  sources,
  sourcesPurposes,
  sourcesSourceTypes,
  sourcesTargetAudienceTypes,
  sourcesThematicAreas,
} from '@/lib/db/schema';
```

(Adjust if the existing import doesn't yet list all of these.)

- [ ] **Step 4: Append assertions after the existing rec-count assertion**

Find the line that asserts `expect(recRows).toHaveLength(fixtureRecs.length)` (or similar). Immediately after that block — and after the embedding-dim assertions — add:

```typescript
      // After PR 2: assert source metadata + M2M memberships are populated.
      const [updatedSource] = await dbClient.db
        .select({
          summary: sources.summary,
          authors: sources.authors,
          orgOwner: sources.orgOwner,
        })
        .from(sources)
        .where(eq(sources.id, sourceId));
      expect(updatedSource?.summary).toBeTruthy();
      expect(updatedSource?.authors.length).toBeGreaterThan(0);

      const sourceThemeMemberships = await dbClient.db
        .select()
        .from(sourcesThematicAreas)
        .where(eq(sourcesThematicAreas.sourceId, sourceId));
      expect(sourceThemeMemberships.length).toBeGreaterThan(0);

      const sourceTypeMemberships = await dbClient.db
        .select()
        .from(sourcesSourceTypes)
        .where(eq(sourcesSourceTypes.sourceId, sourceId));
      expect(sourceTypeMemberships.length).toBeGreaterThan(0);

      const sourcePurposeMemberships = await dbClient.db
        .select()
        .from(sourcesPurposes)
        .where(eq(sourcesPurposes.sourceId, sourceId));
      expect(sourcePurposeMemberships.length).toBeGreaterThan(0);

      const sourceAudienceMemberships = await dbClient.db
        .select()
        .from(sourcesTargetAudienceTypes)
        .where(eq(sourcesTargetAudienceTypes.sourceId, sourceId));
      expect(sourceAudienceMemberships.length).toBeGreaterThan(0);

      // After PR 2: assert rec-side M2M memberships are populated.
      const recIds = recRows.map((r) => r.id);
      let totalRecThemeMemberships = 0;
      let totalRecPurposeMemberships = 0;
      let totalRecAudienceMemberships = 0;
      let totalRecLocationMemberships = 0;
      for (const recId of recIds) {
        totalRecThemeMemberships += (
          await dbClient.db
            .select()
            .from(recommendationsThematicAreas)
            .where(eq(recommendationsThematicAreas.recommendationId, recId))
        ).length;
        totalRecPurposeMemberships += (
          await dbClient.db
            .select()
            .from(recommendationsPurposes)
            .where(eq(recommendationsPurposes.recommendationId, recId))
        ).length;
        totalRecAudienceMemberships += (
          await dbClient.db
            .select()
            .from(recommendationsTargetAudienceTypes)
            .where(eq(recommendationsTargetAudienceTypes.recommendationId, recId))
        ).length;
        totalRecLocationMemberships += (
          await dbClient.db
            .select()
            .from(recommendationsLocationScopes)
            .where(eq(recommendationsLocationScopes.recommendationId, recId))
        ).length;
      }
      expect(totalRecThemeMemberships).toBeGreaterThan(0);
      expect(totalRecPurposeMemberships).toBeGreaterThan(0);
      expect(totalRecAudienceMemberships).toBeGreaterThan(0);
      expect(totalRecLocationMemberships).toBeGreaterThan(0);
```

Note: this assumes `recRows` already has shape `Array<{ id: string }>` — the existing assertion uses it. If the existing select doesn't include `id`, add `id: recommendations.id` to the projection above the new block.

- [ ] **Step 5: Run the e2e test**

Run: `pnpm vitest run tests/pipeline.e2e.test.ts`
Expected: all tests pass. This is one of the slower test files (~60-90s with cold container).

- [ ] **Step 6: Commit**

```bash
git add tests/pipeline.e2e.test.ts
git commit -m "test(e2e): assert source metadata + every M2M membership after the full pipeline runs"
```

---

## Task 10: Final verify + push + open PR

- [ ] **Step 1: Run full verify**

Run: `pnpm verify`
Expected: typecheck, lint, every test file, build — all green. The total test count grows by roughly 35 (10 section-detection + 8 prompt + 2 fake-LLM + ~12 new extract tests + 3 e2e additions).

- [ ] **Step 2: Confirm a clean docker-compose round-trip locally**

Run:
```bash
docker compose down -v
docker compose up -d postgres
for i in $(seq 1 30); do docker exec open-recs-local-postgres-1 pg_isready -U postgres -d openrecs 2>/dev/null && break; sleep 0.5; done
set -a; source .env; set +a
pnpm db:migrate
pnpm db:seed
```
Expected: migrations applied, taxonomy seeded.

- [ ] **Step 3: Push the branch**

Run: `git push -u origin feat/extraction-tagging-pipeline`
Expected: branch pushed; gh prints the PR creation URL.

- [ ] **Step 4: Open the PR**

Run:
```bash
gh pr create --base master --title "feat: extraction-tagging-rebuild — two-pass pipeline (PR 2)" --body "$(cat <<'EOF'
## Summary

PR 2 of 3 implementing the extraction-and-tagging rebuild. See [`docs/superpowers/specs/2026-05-12-extraction-and-tagging-rebuild-design.md`](docs/superpowers/specs/2026-05-12-extraction-and-tagging-rebuild-design.md) for the full design and [`docs/superpowers/plans/2026-05-12-extraction-tagging-pr2-pipeline.md`](docs/superpowers/plans/2026-05-12-extraction-tagging-pr2-pipeline.md) for the implementation plan.

This PR rebuilds the \`source.extract\` pg-boss handler as a two-pass section-aware pipeline that populates every column + M2M shipped in PR 1. No UI changes.

### Pass 1 — source metadata

Reads the first ~10k chars of canonical markdown. LLM returns summary, authors, publication_date, org_owner, plus multi-axis tag slug lists (themes, source_types, purposes, role_relevances, target_audience_types). Persisted to the \`sources\` row + the five source-side M2M tables.

### Pass 2 — recommendations

Detects \`# Recommendations\` / \`# Next steps\` / \`# Conclusions [and recommendations]\` / \`# Actions\` / \`# We will\` / \`# Summary\` headings. If found, slices to those sections and uses a strict prompt. If not, sends the (truncated) full document with a looser prompt. LLM returns each recommendation with body + four multi-axis tag slug lists + priority_timescale_slug + target_organization + notes + confidence + page anchors. Persisted to \`recommendations\` + the four rec-side M2M tables; \`priority_timescale_id\` resolved to the FK on \`recommendations\`.

### Unknown slugs

Both passes use the PR-1 \`resolveOrCreate*\` repo functions, which auto-create unknown slugs with \`unverified=true\` and a humanised default name. Admin review queue (\`/admin/tags\`) lands in PR 3.

### Other changes

- New \`src/lib/services/extraction-sections.ts\` + tests — pure regex section detection.
- New \`src/lib/services/extraction-prompts.ts\` + tests — Pass 1, Pass 2 strict, Pass 2 looser prompt builders.
- \`src/lib/services/extraction-schema.ts\` — replaced \`ExtractionSchema\` with \`SourceMetadataSchema\` (Pass 1) and \`RecommendationsSchema\` (Pass 2).
- \`src/lib/providers/llm/fake.ts\` — \`<stem>:metadata\` key suffix routes to \`<stem>.metadata.json\`; legacy bare-array wrap behaviour removed.
- New \`fixtures/sources/sample-{report,policy}.metadata.json\`; \`recommendations.json\` fixtures rewritten in the new wrapped shape.

### Test plan

- [x] \`pnpm verify\` — typecheck, lint, all tests, build — all green.
- [x] \`docker compose down -v\` + migrate + seed completes clean.
- [ ] Manual: upload a real PDF in local mode against \`llama3.1:8b\` and confirm Pass 1 fields + Pass 2 multi-axis tags populate. The new prompts list every valid slug per axis, so the model should pick from known vocabulary; any new slugs land as \`unverified=true\`.

## Out of scope (PR 3)

- \`/sources/[slug]/edit\` + \`/recommendations/[id]/edit\` pages.
- \`/admin/tags\` review queue UI.
- Tag chips on existing catalogue / detail pages.
EOF
)"
```

- [ ] **Step 5: Confirm CI starts**

Run: `gh pr view --json url,statusCheckRollup | head -30`
Expected: PR URL; \`verify\` + \`e2e\` jobs starting.

---

## Notes for the executor

- **The fake LLM bridges via the `key` parameter.** Real LLMs ignore the `key`. The handler always passes a `key` so the same code works in both modes.
- **Pass 1 always reads first 10k chars; Pass 2 reads up to 100k or the section slice.** Real documents can be much larger; truncation is a deliberate cap to keep token costs predictable. Sub-page chunking is documented as 1.x in the design.
- **Section detection runs before Pass 2.** If you change the regex set, mirror it in the unit test file and re-check both test branches.
- **`priority_timescale_id` uses `ON DELETE SET NULL`** so deleting a taxonomy entry doesn't cascade-delete recommendations.
- **`resolveOrCreate*` results are ordered to match the input slugs.** The handler doesn't rely on order, but `replaceXyz*` is set membership so ordering is irrelevant.
- **`replaceSource*` and `replaceRecommendation*` are diff-based.** Re-running a handler with the same output won't churn M2M rows unnecessarily.
- **Test data persists across `it` blocks** in `extract.test.ts` because `beforeAll` seeds taxonomy once and the per-test `seedSource` makes fresh source rows. If a test needs to assert "no rows of type X", scope it to a fresh `sourceId`.
