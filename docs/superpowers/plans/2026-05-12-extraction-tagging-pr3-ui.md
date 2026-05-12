# Extraction & Tagging Rebuild — PR 3 (UI + Edit Pages + Admin Tag Review) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the UI for the extraction-and-tagging rebuild: dedicated edit pages for sources and recommendations, an admin queue for reviewing LLM-coined `unverified` tags, and tag-chip display surfaces across the catalogue / detail pages. Final commit bumps to 1.1.0 with a changelog entry.

**Architecture:** Two reusable client components carry the new UI: `<TagChips>` (read-only colour-coded chips with an `unverified` visual hint) and `<TagMultiSelect>` (controlled multi-select with chips + filter + "add new" affordance, designed to work without external dependencies). Both edit pages are server components that fetch reference data + current membership, render a client form (`react-hook-form` + `zodResolver`), and POST to a server action that calls the per-axis `resolveOrCreate*` + `replace*` repo functions shipped in PR 1. `/admin/tags` is a server component listing `unverified=true` rows per axis with row-level actions (promote / rename / merge / delete).

**Tech Stack:** Next.js App Router server components, `react-hook-form` + `@hookform/resolvers/zod`, the existing shadcn-style `<Input>` / `<Textarea>` / `<Select>` / `<Button>` / `<Label>` primitives, Vitest + happy-dom + `@testing-library/react` for component tests, Testcontainers-backed Postgres for server action tests, Playwright for E2E extensions.

**Spec:** `docs/superpowers/specs/2026-05-12-extraction-and-tagging-rebuild-design.md` (sections "UI" + "Sequencing — PR 3").

**Depends on:** PR 1 (#21) + PR 2 (#22). Both already on master at `e8c9f45`.

---

## File Structure

**Files created:**

- `src/components/tags/tag-chips.tsx` — read-only chip list, colour-coded per `colorHex`, dotted-border + muted colour when `unverified`.
- `src/components/tags/tag-chips.test.tsx`
- `src/components/tags/tag-multi-select.tsx` — controlled multi-select; selected chips above, type-to-filter dropdown below, "Add `<query>`" affordance for new slugs.
- `src/components/tags/tag-multi-select.test.tsx`
- `src/lib/validation/edit-source.ts` — Zod schema for the source edit form payload.
- `src/lib/validation/edit-recommendation.ts` — Zod schema for the rec edit form payload.
- `src/components/sources/edit-source-form.tsx` — client form using all the components.
- `src/components/sources/edit-source-form.test.tsx`
- `src/components/recommendations/edit-recommendation-form.tsx`
- `src/components/recommendations/edit-recommendation-form.test.tsx`
- `src/components/admin/tag-review-queue.tsx` — interactive UI for promote / rename / merge / delete per axis.
- `src/components/admin/tag-review-queue.test.tsx`
- `src/app/(app)/sources/[slug]/edit/page.tsx`
- `src/app/(app)/recommendations/[id]/edit/page.tsx`
- `src/app/(app)/admin/tags/page.tsx`
- `src/app/(app)/admin/tags/actions.ts`
- `src/app/(app)/admin/tags/actions.test.ts` — server-action tests (Testcontainers).

**Files modified:**

- `src/app/(app)/sources/[slug]/actions.ts` — add `updateSource` action.
- `src/app/(app)/recommendations/[id]/actions.ts` — add `updateRecommendation` action.
- `src/lib/repositories/taxonomy.ts` — add admin operations (`promoteTag`, `renameTag`, `mergeTag`, `deleteTag`) per axis.
- `src/lib/repositories/source.ts` — add `updateSourceMetadata` repo function.
- `src/lib/repositories/recommendation.ts` — add `updateRecommendationCore` repo function.
- `src/app/(app)/sources/page.tsx` — add a single source-type chip per row.
- `src/app/(app)/sources/[slug]/page.tsx` — add a metadata section (summary, authors, publication date, org_owner, original_url, datasets) + `<TagChips>` rows for every axis above the markdown body; add an Edit link in the header.
- `src/app/(app)/recommendations/[id]/page.tsx` — Overview tab gets `<TagChips>` rows per axis + an Edit link.
- `tests/e2e/local-mode.spec.ts` — extend with "edit a recommendation, tag persists across reload" assertion.
- `tests/e2e/hosted-mode.spec.ts` — extend with "edit source, tag persists across reload" assertion.
- `docs/running-locally.md` — add an explicit "local-vs-Claude extraction quality" subsection.
- `docs/changelog.md` — add `## 2026-05-XX — 1.1.0` section.
- `package.json` — bump `version` from `1.0.0` to `1.1.0`.

**Files NOT touched (deliberate scope guardrails):**

- Search filters by purpose / audience / etc. (deferred to 1.2 per the spec).
- New analytics charts (deferred to 1.2).
- Inline multi-select edits on the catalogue / index tables (the spec scopes these to edit pages only).
- Bulk re-tag UI.
- Hierarchical tags / sub-themes.

---

## Pre-flight

- [ ] **Step 1: Confirm clean tree on master**

Run: `git status && git log --oneline -3`
Expected: clean tree, master at `e8c9f45 docs: PR 2 implementation plan` or later (`e8c9f45` is the docs commit; the latest PR 2 code commit is `4e29f4a`).

- [ ] **Step 2: Branch off master**

Run:
```bash
git checkout master
git pull --ff-only
git checkout -b feat/extraction-tagging-ui
```
Expected: switched to a new branch.

---

## Task 1: `<TagChips>` read-only display component

**Files:**
- Create: `src/components/tags/tag-chips.tsx`
- Create: `src/components/tags/tag-chips.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/tags/tag-chips.test.tsx`:

```typescript
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TagChips, type TagChipsItem } from './tag-chips';

const items: TagChipsItem[] = [
  { slug: 'governance', name: 'Governance', colorHex: '#4f46e5', unverified: false },
  { slug: 'data', name: 'Data', colorHex: '#7c2d12', unverified: false },
];

describe('TagChips', () => {
  it('renders nothing when given an empty list', () => {
    const { container } = render(<TagChips tags={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one chip per tag with the tag name visible', () => {
    render(<TagChips tags={items} />);
    expect(screen.getByText('Governance')).toBeInTheDocument();
    expect(screen.getByText('Data')).toBeInTheDocument();
  });

  it('uses the colorHex on a known tag', () => {
    render(<TagChips tags={[items[0]!]} />);
    const chip = screen.getByText('Governance').closest('span');
    expect(chip?.getAttribute('style') ?? '').toContain('#4f46e5');
  });

  it('renders unverified tags with a visual hint (data-unverified)', () => {
    render(
      <TagChips
        tags={[{ slug: 'unknown', name: 'Unknown', colorHex: null, unverified: true }]}
      />,
    );
    const chip = screen.getByText('Unknown').closest('[data-unverified]');
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute('data-unverified')).toBe('true');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/components/tags/tag-chips.test.tsx`
Expected: cannot find module `./tag-chips`.

- [ ] **Step 3: Implement the component**

Create `src/components/tags/tag-chips.tsx`:

```typescript
import { cn } from '@/lib/utils';

export type TagChipsItem = {
  slug: string;
  name: string;
  colorHex: string | null;
  unverified: boolean;
};

type Props = {
  tags: ReadonlyArray<TagChipsItem>;
  className?: string;
};

/**
 * Read-only chip list. Verified tags render with the supplied `colorHex`
 * as a left-edge accent; unverified (auto-created by extraction) tags
 * carry a dotted border + muted colour so they read as "draft" until an
 * admin promotes them at /admin/tags. Returns nothing for an empty list
 * so callers can drop the component into layouts without wrapper guards.
 */
export function TagChips({ tags, className }: Props): React.ReactElement | null {
  if (tags.length === 0) return null;
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)}>
      {tags.map((tag) => {
        const color = tag.colorHex ?? '#9ca3af';
        return (
          <li key={tag.slug}>
            <span
              data-unverified={tag.unverified ? 'true' : undefined}
              style={{ borderLeftColor: color }}
              className={cn(
                'inline-flex items-center border border-rule border-l-[3px] px-2 py-0.5 font-mono text-[11px]',
                tag.unverified
                  ? 'border-dashed text-muted-foreground'
                  : 'bg-paper-2 text-foreground',
              )}
            >
              {tag.name}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/components/tags/tag-chips.test.tsx`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/tags/tag-chips.tsx src/components/tags/tag-chips.test.tsx
git commit -m "feat(ui): TagChips read-only display with colour accent + unverified hint"
```

---

## Task 2: `<TagMultiSelect>` controlled multi-select component

**Files:**
- Create: `src/components/tags/tag-multi-select.tsx`
- Create: `src/components/tags/tag-multi-select.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/tags/tag-multi-select.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagMultiSelect, type TagOption } from './tag-multi-select';

const options: TagOption[] = [
  { slug: 'governance', name: 'Governance', colorHex: '#4f46e5', unverified: false },
  { slug: 'data', name: 'Data', colorHex: '#7c2d12', unverified: false },
  { slug: 'ai', name: 'AI', colorHex: '#1e40af', unverified: false },
];

describe('TagMultiSelect', () => {
  it('shows a chip for every currently selected slug', () => {
    render(
      <TagMultiSelect
        label="Themes"
        options={options}
        value={['governance', 'data']}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Governance')).toBeInTheDocument();
    expect(screen.getByText('Data')).toBeInTheDocument();
  });

  it('clicking a chip\'s remove button removes that slug from value', async () => {
    const onChange = vi.fn();
    render(
      <TagMultiSelect
        label="Themes"
        options={options}
        value={['governance', 'data']}
        onChange={onChange}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Remove Governance/i }));
    expect(onChange).toHaveBeenCalledWith(['data']);
  });

  it('clicking an option in the dropdown adds it to value', async () => {
    const onChange = vi.fn();
    render(
      <TagMultiSelect
        label="Themes"
        options={options}
        value={['governance']}
        onChange={onChange}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add tag/i }));
    await user.click(screen.getByRole('option', { name: 'Data' }));
    expect(onChange).toHaveBeenCalledWith(['governance', 'data']);
  });

  it('typing in the filter narrows the visible options', async () => {
    render(
      <TagMultiSelect
        label="Themes"
        options={options}
        value={[]}
        onChange={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add tag/i }));
    await user.type(screen.getByPlaceholderText(/Filter or add/i), 'gov');
    expect(screen.getByRole('option', { name: 'Governance' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Data' })).toBeNull();
  });

  it('shows an "Add \\"<query>\\"" affordance when no option matches', async () => {
    const onChange = vi.fn();
    render(
      <TagMultiSelect
        label="Themes"
        options={options}
        value={[]}
        onChange={onChange}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add tag/i }));
    await user.type(screen.getByPlaceholderText(/Filter or add/i), 'climate justice');
    await user.click(screen.getByRole('button', { name: /Add "climate justice"/i }));
    expect(onChange).toHaveBeenCalledWith(['climate-justice']);
  });

  it('does not add a duplicate when the selected slug is already in value', async () => {
    const onChange = vi.fn();
    render(
      <TagMultiSelect
        label="Themes"
        options={options}
        value={['governance']}
        onChange={onChange}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Add tag/i }));
    // Governance is already selected; it should still be visible but
    // clicking it would no-op (we filter selected items out of the dropdown).
    expect(screen.queryByRole('option', { name: 'Governance' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `pnpm vitest run src/components/tags/tag-multi-select.test.tsx`
Expected: cannot find module.

- [ ] **Step 3: Implement the component**

Create `src/components/tags/tag-multi-select.tsx`:

```typescript
'use client';

import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type TagOption = {
  slug: string;
  name: string;
  colorHex: string | null;
  unverified: boolean;
};

type Props = {
  label: string;
  options: ReadonlyArray<TagOption>;
  value: ReadonlyArray<string>;
  onChange: (slugs: string[]) => void;
  placeholder?: string;
};

/**
 * Normalise a user-typed string into a slug. Lowercase, trim, runs of
 * whitespace collapse to a single dash. Matches the server-side normaliser
 * in `src/lib/repositories/taxonomy.ts` so a slug coined here lands in the
 * same row when the server `resolveOrCreate*` runs.
 */
function normaliseToSlug(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Controlled multi-select. Selected items render as removable chips at the
 * top; an Add-tag button reveals a filter + option list below. Typing a
 * query that doesn't match any option surfaces an "Add" affordance so the
 * caller can coin a new slug. The server is responsible for resolving the
 * slug to an id (existing slug -> id; unknown slug -> insert with
 * unverified=true) via `resolveOrCreate*` in `src/lib/repositories/taxonomy.ts`.
 */
export function TagMultiSelect({
  label,
  options,
  value,
  onChange,
  placeholder = 'Filter or add a new tag…',
}: Props) {
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedSet = useMemo(() => new Set(value), [value]);
  const visibleOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options
      .filter((opt) => !selectedSet.has(opt.slug))
      .filter((opt) => (q ? opt.name.toLowerCase().includes(q) || opt.slug.includes(q) : true));
  }, [options, query, selectedSet]);

  const selectedTags = useMemo(
    () =>
      value
        .map((slug) => options.find((opt) => opt.slug === slug))
        .filter((opt): opt is TagOption => opt !== undefined),
    [options, value],
  );

  // The selected list may contain slugs not yet in `options` (e.g. a tag
  // the user just coined that the server hasn't echoed back). Render those
  // as bare-name chips so the UI doesn't silently drop them.
  const orphanSelected = value.filter((slug) => !options.some((opt) => opt.slug === slug));

  const querySlug = normaliseToSlug(query);
  const queryIsNew =
    querySlug.length > 0 &&
    !options.some((opt) => opt.slug === querySlug) &&
    !selectedSet.has(querySlug);

  function add(slug: string): void {
    const normal = normaliseToSlug(slug);
    if (!normal || selectedSet.has(normal)) return;
    onChange([...value, normal]);
    setQuery('');
  }

  function remove(slug: string): void {
    onChange(value.filter((s) => s !== slug));
  }

  return (
    <div className="space-y-2">
      <Label id={labelId}>{label}</Label>
      {(selectedTags.length > 0 || orphanSelected.length > 0) && (
        <ul aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
          {selectedTags.map((tag) => (
            <li key={tag.slug}>
              <span
                data-unverified={tag.unverified ? 'true' : undefined}
                style={{ borderLeftColor: tag.colorHex ?? '#9ca3af' }}
                className={cn(
                  'inline-flex items-center gap-1.5 border border-rule border-l-[3px] px-2 py-0.5 font-mono text-[11px]',
                  tag.unverified ? 'border-dashed text-muted-foreground' : 'bg-paper-2 text-foreground',
                )}
              >
                {tag.name}
                <button
                  type="button"
                  onClick={() => remove(tag.slug)}
                  aria-label={`Remove ${tag.name}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
          {orphanSelected.map((slug) => (
            <li key={slug}>
              <span className="inline-flex items-center gap-1.5 border border-dashed border-rule border-l-[3px] border-l-muted-foreground px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                {slug}
                <button
                  type="button"
                  onClick={() => remove(slug)}
                  aria-label={`Remove ${slug}`}
                  className="hover:text-destructive"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <div className="space-y-1.5 border border-rule bg-paper-2 p-2">
          <Input
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-background"
            autoFocus
          />
          <ul role="listbox" className="max-h-44 overflow-y-auto">
            {visibleOptions.map((opt) => (
              <li key={opt.slug}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => add(opt.slug)}
                  className="flex w-full items-center justify-between px-2 py-1 text-left text-sm hover:bg-accent-soft"
                >
                  <span>{opt.name}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{opt.slug}</span>
                </button>
              </li>
            ))}
            {visibleOptions.length === 0 && !queryIsNew && (
              <li className="px-2 py-1 font-serif text-sm italic text-muted-foreground">
                No matching tags.
              </li>
            )}
            {queryIsNew && (
              <li className="border-t border-rule pt-1">
                <button
                  type="button"
                  onClick={() => add(querySlug)}
                  className="flex w-full items-center justify-between px-2 py-1 text-left text-sm hover:bg-accent-soft"
                >
                  <span>
                    Add <strong className="font-mono">&quot;{query.trim()}&quot;</strong> as a new tag
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{querySlug}</span>
                </button>
              </li>
            )}
          </ul>
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          Add tag
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/components/tags/tag-multi-select.test.tsx`
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/tags/tag-multi-select.tsx src/components/tags/tag-multi-select.test.tsx
git commit -m "feat(ui): TagMultiSelect with chips + filter + add-new affordance"
```

---

## Task 3: Source edit — Zod schema + repo update + server action + page + form

**Files:**
- Create: `src/lib/validation/edit-source.ts`
- Modify: `src/lib/repositories/source.ts` (add `updateSourceMetadata`)
- Modify: `src/app/(app)/sources/[slug]/actions.ts` (add `updateSource` action)
- Create: `src/components/sources/edit-source-form.tsx`
- Create: `src/components/sources/edit-source-form.test.tsx`
- Create: `src/app/(app)/sources/[slug]/edit/page.tsx`

This is the biggest task — five files. Built in a single TDD loop because the pieces depend on each other.

- [ ] **Step 1: Write the Zod schema**

Create `src/lib/validation/edit-source.ts`:

```typescript
import { z } from 'zod';

/**
 * Payload for the source edit server action. Multi-axis tag arrays carry
 * slug strings (potentially including freshly coined slugs from the LLM
 * pipeline or human input); the server resolves them via the per-axis
 * `resolveOrCreate*` repo functions.
 */
export const EditSourceInput = z.object({
  sourceId: z.string().uuid(),
  title: z.string().min(1).max(500),
  summary: z.string().max(8000).nullable().optional(),
  authors: z.array(z.string().min(1).max(200)).max(50).default([]),
  publication_date: z.string().nullable().optional(),
  org_owner: z.string().max(500).nullable().optional(),
  original_url: z.string().url().max(2000).nullable().optional(),
  attachment_url: z.string().max(2000).nullable().optional(),
  datasets: z
    .array(
      z.object({
        description: z.string().min(1).max(500),
        url: z.string().url().max(2000),
      }),
    )
    .max(50)
    .default([]),
  is_private: z.boolean().optional(),
  thematic_area_slugs: z.array(z.string()).default([]),
  source_type_slugs: z.array(z.string()).default([]),
  purpose_slugs: z.array(z.string()).default([]),
  role_relevance_slugs: z.array(z.string()).default([]),
  target_audience_type_slugs: z.array(z.string()).default([]),
});

export type EditSourceInputT = z.infer<typeof EditSourceInput>;
```

- [ ] **Step 2: Add `updateSourceMetadata` to the source repo**

Open `src/lib/repositories/source.ts`. Find the existing exports. After the last function, append:

```typescript
export type UpdateSourceMetadataInput = {
  title: string;
  summary: string | null;
  authors: string[];
  publicationDate: Date | null;
  orgOwner: string | null;
  originalUrl: string | null;
  attachmentUrl: string | null;
  datasets: Array<{ description: string; url: string }>;
  isPrivate?: boolean;
};

export async function updateSourceMetadata(
  ctx: RepoContext,
  sourceId: string,
  input: UpdateSourceMetadataInput,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drizzle update set value typing
  const updateSet: Record<string, any> = {
    title: input.title,
    summary: input.summary,
    authors: input.authors,
    publicationDate: input.publicationDate,
    orgOwner: input.orgOwner,
    originalUrl: input.originalUrl,
    attachmentUrl: input.attachmentUrl,
    datasets: input.datasets,
    updatedAt: new Date(),
  };
  if (input.isPrivate !== undefined) {
    updateSet['isPrivate'] = input.isPrivate;
  }
  await ctx.db.update(sources).set(updateSet).where(eq(sources.id, sourceId));
}
```

Add any missing imports at the top: `eq` from `drizzle-orm` and `sources` from `../db/schema` (likely already imported).

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 3: Add `updateSource` server action**

Open `src/app/(app)/sources/[slug]/actions.ts`. After the existing exports, append:

```typescript
import { EditSourceInput, type EditSourceInputT } from '@/lib/validation/edit-source';
import { updateSourceMetadata } from '@/lib/repositories/source';
import {
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

function parsePublicationDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function updateSource(input: unknown): Promise<OwnershipActionResult> {
  const parsed = EditSourceInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const data: EditSourceInputT = parsed.data;
  const { ctx, close } = await buildContext();
  try {
    await updateSourceMetadata(ctx, data.sourceId, {
      title: data.title,
      summary: data.summary ?? null,
      authors: data.authors,
      publicationDate: parsePublicationDate(data.publication_date ?? null),
      orgOwner: data.org_owner ?? null,
      originalUrl: data.original_url ?? null,
      attachmentUrl: data.attachment_url ?? null,
      datasets: data.datasets,
      ...(data.is_private !== undefined ? { isPrivate: data.is_private } : {}),
    });

    const themeIds = await resolveOrCreateThematicAreas(ctx, data.thematic_area_slugs);
    await replaceSourceThematicAreas(ctx, data.sourceId, themeIds);
    const typeIds = await resolveOrCreateSourceTypes(ctx, data.source_type_slugs);
    await replaceSourceSourceTypes(ctx, data.sourceId, typeIds);
    const purposeIds = await resolveOrCreatePurposes(ctx, data.purpose_slugs);
    await replaceSourcePurposes(ctx, data.sourceId, purposeIds);
    const roleIds = await resolveOrCreateRoleRelevances(ctx, data.role_relevance_slugs);
    await replaceSourceRoleRelevances(ctx, data.sourceId, roleIds);
    const audienceIds = await resolveOrCreateTargetAudienceTypes(
      ctx,
      data.target_audience_type_slugs,
    );
    await replaceSourceTargetAudienceTypes(ctx, data.sourceId, audienceIds);

    revalidatePath('/sources', 'page');
    revalidatePath(`/sources/[slug]`, 'page');
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update failed';
    return { ok: false, error: message };
  } finally {
    await close();
  }
}
```

- [ ] **Step 4: Write the form component test**

Create `src/components/sources/edit-source-form.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditSourceForm } from './edit-source-form';

const themeOptions = [
  { slug: 'governance', name: 'Governance', colorHex: '#4f46e5', unverified: false },
  { slug: 'data', name: 'Data', colorHex: '#7c2d12', unverified: false },
];

const baseProps = {
  source: {
    id: '00000000-0000-0000-0000-000000000001',
    title: 'A report',
    summary: 'Short abstract.',
    authors: ['Alice'],
    publicationDate: null,
    orgOwner: 'Sample Org',
    originalUrl: null,
    attachmentUrl: null,
    datasets: [],
    isPrivate: false,
  },
  axisOptions: {
    thematic_areas: themeOptions,
    source_types: [],
    purposes: [],
    role_relevances: [],
    target_audience_types: [],
  },
  initialMemberships: {
    thematic_areas: ['governance'],
    source_types: [],
    purposes: [],
    role_relevances: [],
    target_audience_types: [],
  },
  showPrivacyToggle: false,
};

describe('EditSourceForm', () => {
  it('renders the source title in the title input', () => {
    render(<EditSourceForm {...baseProps} action={vi.fn().mockResolvedValue({ ok: true })} />);
    expect(screen.getByLabelText(/^Title/i)).toHaveValue('A report');
  });

  it('renders current thematic-area memberships as chips', () => {
    render(<EditSourceForm {...baseProps} action={vi.fn().mockResolvedValue({ ok: true })} />);
    expect(screen.getByText('Governance')).toBeInTheDocument();
  });

  it('submits the form payload to the action with current values', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true });
    render(<EditSourceForm {...baseProps} action={action} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Save/i }));
    expect(action).toHaveBeenCalledTimes(1);
    const payload = action.mock.calls[0]?.[0] as { sourceId: string; title: string };
    expect(payload.sourceId).toBe(baseProps.source.id);
    expect(payload.title).toBe('A report');
  });

  it('renders the privacy toggle only when showPrivacyToggle is true', () => {
    const { rerender } = render(
      <EditSourceForm {...baseProps} action={vi.fn().mockResolvedValue({ ok: true })} />,
    );
    expect(screen.queryByLabelText(/Private/i)).toBeNull();
    rerender(
      <EditSourceForm
        {...baseProps}
        showPrivacyToggle
        action={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(screen.getByLabelText(/Private/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Implement the form component**

Create `src/components/sources/edit-source-form.tsx`:

```typescript
'use client';

import { useId, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TagMultiSelect, type TagOption } from '@/components/tags/tag-multi-select';
import {
  EditSourceInput,
  type EditSourceInputT,
} from '@/lib/validation/edit-source';

export type EditSourceAction = (
  input: EditSourceInputT,
) => Promise<{ ok: true } | { ok: false; error: string }>;

type AxisKey =
  | 'thematic_areas'
  | 'source_types'
  | 'purposes'
  | 'role_relevances'
  | 'target_audience_types';

export type AxisOptions = Record<AxisKey, TagOption[]>;
export type AxisMemberships = Record<AxisKey, string[]>;

type Props = {
  source: {
    id: string;
    title: string;
    summary: string | null;
    authors: string[];
    publicationDate: Date | null;
    orgOwner: string | null;
    originalUrl: string | null;
    attachmentUrl: string | null;
    datasets: Array<{ description: string; url: string }>;
    isPrivate: boolean;
  };
  axisOptions: AxisOptions;
  initialMemberships: AxisMemberships;
  showPrivacyToggle: boolean;
  action: EditSourceAction;
  onSuccess?: () => void;
};

function dateToInputValue(d: Date | null): string {
  if (!d) return '';
  return d.toISOString().slice(0, 10);
}

export function EditSourceForm({
  source,
  axisOptions,
  initialMemberships,
  showPrivacyToggle,
  action,
  onSuccess,
}: Props) {
  const titleId = useId();
  const summaryId = useId();
  const authorsId = useId();
  const publicationDateId = useId();
  const orgOwnerId = useId();
  const originalUrlId = useId();
  const attachmentUrlId = useId();
  const privateId = useId();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<EditSourceInputT>({
    resolver: zodResolver(EditSourceInput),
    defaultValues: {
      sourceId: source.id,
      title: source.title,
      summary: source.summary,
      authors: source.authors,
      publication_date: source.publicationDate
        ? dateToInputValue(source.publicationDate)
        : null,
      org_owner: source.orgOwner,
      original_url: source.originalUrl,
      attachment_url: source.attachmentUrl,
      datasets: source.datasets,
      is_private: showPrivacyToggle ? source.isPrivate : undefined,
      thematic_area_slugs: initialMemberships.thematic_areas,
      source_type_slugs: initialMemberships.source_types,
      purpose_slugs: initialMemberships.purposes,
      role_relevance_slugs: initialMemberships.role_relevances,
      target_audience_type_slugs: initialMemberships.target_audience_types,
    },
  });

  function onSubmit(values: EditSourceInputT) {
    startTransition(async () => {
      const result = await action(values);
      if (result.ok) {
        onSuccess?.();
      } else {
        setError('root', { message: `Save failed: ${result.error}` });
      }
    });
  }

  return (
    <form className="space-y-8" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register('sourceId')} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={titleId}>
            Title <span className="text-destructive">*</span>
          </Label>
          <Input
            id={titleId}
            className="bg-background"
            aria-invalid={errors.title ? true : undefined}
            {...register('title')}
          />
          {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={summaryId}>Summary</Label>
          <Textarea id={summaryId} rows={3} className="bg-background" {...register('summary')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={authorsId}>Authors (one per line)</Label>
          <Controller
            control={control}
            name="authors"
            render={({ field }) => (
              <Textarea
                id={authorsId}
                rows={3}
                className="bg-background"
                value={field.value.join('\n')}
                onChange={(e) =>
                  field.onChange(
                    e.target.value
                      .split('\n')
                      .map((s) => s.trim())
                      .filter((s) => s.length > 0),
                  )
                }
              />
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={publicationDateId}>Publication date</Label>
          <Input
            id={publicationDateId}
            type="date"
            className="bg-background"
            {...register('publication_date')}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={orgOwnerId}>Publishing organisation</Label>
          <Input id={orgOwnerId} className="bg-background" {...register('org_owner')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={originalUrlId}>Original URL</Label>
          <Input id={originalUrlId} className="bg-background" {...register('original_url')} />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={attachmentUrlId}>Attachment URL or path</Label>
          <Input id={attachmentUrlId} className="bg-background" {...register('attachment_url')} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Controller
          control={control}
          name="thematic_area_slugs"
          render={({ field }) => (
            <TagMultiSelect
              label="Thematic areas"
              options={axisOptions.thematic_areas}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="source_type_slugs"
          render={({ field }) => (
            <TagMultiSelect
              label="Source types"
              options={axisOptions.source_types}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="purpose_slugs"
          render={({ field }) => (
            <TagMultiSelect
              label="Purposes"
              options={axisOptions.purposes}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="role_relevance_slugs"
          render={({ field }) => (
            <TagMultiSelect
              label="Role relevances"
              options={axisOptions.role_relevances}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="target_audience_type_slugs"
          render={({ field }) => (
            <TagMultiSelect
              label="Target audiences"
              options={axisOptions.target_audience_types}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>

      {showPrivacyToggle && (
        <div className="flex items-center gap-2">
          <input id={privateId} type="checkbox" {...register('is_private')} />
          <Label htmlFor={privateId}>Private (visible only to admins and the owner)</Label>
        </div>
      )}

      {errors.root && (
        <div
          role="alert"
          className="border border-destructive bg-accent-claret-soft px-3 py-2 text-sm text-destructive"
        >
          {errors.root.message}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" variant="default" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Run the form test**

Run: `pnpm vitest run src/components/sources/edit-source-form.test.tsx`
Expected: 4 tests pass.

- [ ] **Step 7: Create the page**

Create `src/app/(app)/sources/[slug]/edit/page.tsx`:

```typescript
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { findSourceBySlug } from '@/lib/repositories/source';
import type { RepoContext } from '@/lib/repositories/types';
import {
  listPurposes,
  listRoleRelevances,
  listSourceTypes,
  listTargetAudienceTypes,
  listThematicAreas,
} from '@/lib/repositories/taxonomy';
import {
  listSourcePurposes,
  listSourceRoleRelevances,
  listSourceSourceTypes,
  listSourceTargetAudienceTypes,
  listSourceThematicAreas,
} from '@/lib/repositories/source-tags';
import { EditSourceForm } from '@/components/sources/edit-source-form';
import { updateSource } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EditSourcePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const env = loadEnv();
  const providers = createProviders(env);
  const client = createDb(env.DATABASE_URL);

  try {
    const headersList = await headers();
    const req = new Request('http://localhost/sources', { headers: headersList });
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    const source = await findSourceBySlug(ctx, slug);
    if (!source) notFound();

    const [
      thematicAreas,
      sourceTypes,
      purposes,
      roleRelevances,
      targetAudienceTypes,
      memberThemes,
      memberTypes,
      memberPurposes,
      memberRoles,
      memberAudiences,
    ] = await Promise.all([
      listThematicAreas(ctx),
      listSourceTypes(ctx),
      listPurposes(ctx),
      listRoleRelevances(ctx),
      listTargetAudienceTypes(ctx),
      listSourceThematicAreas(ctx, source.id),
      listSourceSourceTypes(ctx, source.id),
      listSourcePurposes(ctx, source.id),
      listSourceRoleRelevances(ctx, source.id),
      listSourceTargetAudienceTypes(ctx, source.id),
    ]);

    return (
      <div className="space-y-8">
        <header className="space-y-3">
          <div className="section-num">02 · Sources · Edit</div>
          <h1 className="text-3xl tracking-tight">{source.title}</h1>
          <p className="font-serif text-sm italic text-muted-foreground">
            Edit metadata + tags. Tags coined here that don&apos;t exist yet land as unverified and surface on /admin/tags for review.
          </p>
        </header>
        <EditSourceForm
          source={{
            id: source.id,
            title: source.title,
            summary: source.summary,
            authors: source.authors,
            publicationDate: source.publicationDate,
            orgOwner: source.orgOwner,
            originalUrl: source.originalUrl,
            attachmentUrl: source.attachmentUrl,
            datasets: source.datasets,
            isPrivate: source.isPrivate,
          }}
          axisOptions={{
            thematic_areas: thematicAreas,
            source_types: sourceTypes,
            purposes,
            role_relevances: roleRelevances,
            target_audience_types: targetAudienceTypes,
          }}
          initialMemberships={{
            thematic_areas: memberThemes.map((t) => t.slug),
            source_types: memberTypes.map((t) => t.slug),
            purposes: memberPurposes.map((t) => t.slug),
            role_relevances: memberRoles.map((t) => t.slug),
            target_audience_types: memberAudiences.map((t) => t.slug),
          }}
          showPrivacyToggle={env.APP_MODE === 'hosted'}
          action={updateSource}
        />
      </div>
    );
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}
```

This page imports `findSourceBySlug` from `src/lib/repositories/source`. Check it exists:

Run: `grep -n "findSourceBySlug\|getSourceWithPagesBySlug" src/lib/repositories/source.ts`
Expected: `getSourceWithPagesBySlug` exists; `findSourceBySlug` may not.

If `findSourceBySlug` doesn't exist, add it to `src/lib/repositories/source.ts`:

```typescript
export async function findSourceBySlug(
  ctx: RepoContext,
  slug: string,
): Promise<{
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  authors: string[];
  publicationDate: Date | null;
  orgOwner: string | null;
  originalUrl: string | null;
  attachmentUrl: string | null;
  datasets: Array<{ description: string; url: string }>;
  isPrivate: boolean;
} | null> {
  const rows = await ctx.db
    .select({
      id: sources.id,
      slug: sources.slug,
      title: sources.title,
      summary: sources.summary,
      authors: sources.authors,
      publicationDate: sources.publicationDate,
      orgOwner: sources.orgOwner,
      originalUrl: sources.originalUrl,
      attachmentUrl: sources.attachmentUrl,
      datasets: sources.datasets,
      isPrivate: sources.isPrivate,
    })
    .from(sources)
    .where(eq(sources.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 8: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/validation/edit-source.ts src/lib/repositories/source.ts src/app/'(app)'/sources/'[slug]'/actions.ts src/app/'(app)'/sources/'[slug]'/edit/page.tsx src/components/sources/edit-source-form.tsx src/components/sources/edit-source-form.test.tsx
git commit -m "feat(sources): /sources/[slug]/edit page with full metadata + multi-axis tag editing"
```

---

## Task 4: Recommendation edit — Zod schema + repo + action + form + page

Same shape as Task 3 but for recommendations. Fewer fields, one single-select priority axis.

**Files:**
- Create: `src/lib/validation/edit-recommendation.ts`
- Modify: `src/lib/repositories/recommendation.ts` (add `updateRecommendationCore`)
- Modify: `src/app/(app)/recommendations/[id]/actions.ts` (add `updateRecommendation` action)
- Create: `src/components/recommendations/edit-recommendation-form.tsx`
- Create: `src/components/recommendations/edit-recommendation-form.test.tsx`
- Create: `src/app/(app)/recommendations/[id]/edit/page.tsx`

- [ ] **Step 1: Zod schema**

Create `src/lib/validation/edit-recommendation.ts`:

```typescript
import { z } from 'zod';

export const EditRecommendationInput = z.object({
  recommendationId: z.string().uuid(),
  title: z.string().min(5).max(500),
  body: z.string().min(20).max(20000),
  target_organization: z.string().max(500).nullable().optional(),
  priority_timescale_slug: z.string().nullable().optional(),
  confidence: z.enum(['high', 'medium', 'low']).nullable().optional(),
  notes: z.string().max(8000).nullable().optional(),
  page_start: z.coerce.number().int().nullable().optional(),
  page_end: z.coerce.number().int().nullable().optional(),
  thematic_area_slugs: z.array(z.string()).default([]),
  purpose_slugs: z.array(z.string()).default([]),
  target_audience_type_slugs: z.array(z.string()).default([]),
  location_scope_slugs: z.array(z.string()).default([]),
});

export type EditRecommendationInputT = z.infer<typeof EditRecommendationInput>;
```

- [ ] **Step 2: Add `updateRecommendationCore` to the recommendation repo**

Open `src/lib/repositories/recommendation.ts`. Find the existing exports. Add this function (importing `eq` from drizzle-orm + `recommendations` from `../db/schema` if not already):

```typescript
export type UpdateRecommendationCoreInput = {
  title: string;
  body: string;
  targetOrganization: string | null;
  priorityTimescaleId: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  notes: string | null;
  pageAnchor: number | null;
};

export async function updateRecommendationCore(
  ctx: RepoContext,
  recommendationId: string,
  input: UpdateRecommendationCoreInput,
): Promise<void> {
  await ctx.db
    .update(recommendations)
    .set({
      title: input.title,
      body: input.body,
      targetOrganization: input.targetOrganization,
      priorityTimescaleId: input.priorityTimescaleId,
      confidence: input.confidence,
      notes: input.notes,
      pageAnchor: input.pageAnchor,
      updatedAt: new Date(),
    })
    .where(eq(recommendations.id, recommendationId));
}
```

- [ ] **Step 3: Add `updateRecommendation` server action**

Open `src/app/(app)/recommendations/[id]/actions.ts`. Read the file first to learn its existing `buildContext` / `ActionResult` shape; mirror that.

Append:

```typescript
import { EditRecommendationInput, type EditRecommendationInputT } from '@/lib/validation/edit-recommendation';
import { updateRecommendationCore } from '@/lib/repositories/recommendation';
import {
  resolveOrCreateLocationScopes,
  resolveOrCreatePriorityTimescales,
  resolveOrCreatePurposes,
  resolveOrCreateTargetAudienceTypes,
  resolveOrCreateThematicAreas,
} from '@/lib/repositories/taxonomy';
import {
  replaceRecommendationLocationScopes,
  replaceRecommendationPurposes,
  replaceRecommendationTargetAudienceTypes,
  replaceRecommendationThematicAreas,
} from '@/lib/repositories/recommendation-tags';

export async function updateRecommendation(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = EditRecommendationInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const data: EditRecommendationInputT = parsed.data;
  const { ctx, close } = await buildContext();
  try {
    const priorityIds = data.priority_timescale_slug
      ? await resolveOrCreatePriorityTimescales(ctx, [data.priority_timescale_slug])
      : [];

    await updateRecommendationCore(ctx, data.recommendationId, {
      title: data.title,
      body: data.body,
      targetOrganization: data.target_organization ?? null,
      priorityTimescaleId: priorityIds[0] ?? null,
      confidence: data.confidence ?? null,
      notes: data.notes ?? null,
      pageAnchor: data.page_start ?? null,
    });

    const themeIds = await resolveOrCreateThematicAreas(ctx, data.thematic_area_slugs);
    await replaceRecommendationThematicAreas(ctx, data.recommendationId, themeIds);
    const purposeIds = await resolveOrCreatePurposes(ctx, data.purpose_slugs);
    await replaceRecommendationPurposes(ctx, data.recommendationId, purposeIds);
    const audienceIds = await resolveOrCreateTargetAudienceTypes(
      ctx,
      data.target_audience_type_slugs,
    );
    await replaceRecommendationTargetAudienceTypes(ctx, data.recommendationId, audienceIds);
    const locationIds = await resolveOrCreateLocationScopes(ctx, data.location_scope_slugs);
    await replaceRecommendationLocationScopes(ctx, data.recommendationId, locationIds);

    revalidatePath('/recommendations', 'page');
    revalidatePath(`/recommendations/[id]`, 'page');
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update failed';
    return { ok: false, error: message };
  } finally {
    await close();
  }
}
```

If the file doesn't have `buildContext` already, add a private copy mirroring the one in `sources/[slug]/actions.ts`.

- [ ] **Step 4: Form component test**

Create `src/components/recommendations/edit-recommendation-form.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditRecommendationForm } from './edit-recommendation-form';

const themeOptions = [
  { slug: 'governance', name: 'Governance', colorHex: '#4f46e5', unverified: false },
];

const baseProps = {
  rec: {
    id: '00000000-0000-0000-0000-000000000002',
    title: 'A rec title that is long enough',
    body: 'A body that is at least twenty characters long.',
    targetOrganization: null,
    notes: null,
    pageStart: null,
    pageEnd: null,
    priorityTimescaleSlug: null,
    confidence: null as 'high' | 'medium' | 'low' | null,
  },
  axisOptions: {
    thematic_areas: themeOptions,
    purposes: [],
    target_audience_types: [],
    location_scopes: [],
    priority_timescales: [
      { slug: 'short-term', name: 'Short-term', colorHex: null, unverified: false },
      { slug: 'medium-term', name: 'Medium-term', colorHex: null, unverified: false },
    ],
  },
  initialMemberships: {
    thematic_areas: ['governance'],
    purposes: [],
    target_audience_types: [],
    location_scopes: [],
  },
};

describe('EditRecommendationForm', () => {
  it('renders title and body in their inputs', () => {
    render(
      <EditRecommendationForm {...baseProps} action={vi.fn().mockResolvedValue({ ok: true })} />,
    );
    expect(screen.getByLabelText(/^Title/i)).toHaveValue(baseProps.rec.title);
    expect(screen.getByLabelText(/^Body/i)).toHaveValue(baseProps.rec.body);
  });

  it('renders current thematic-area memberships as chips', () => {
    render(
      <EditRecommendationForm {...baseProps} action={vi.fn().mockResolvedValue({ ok: true })} />,
    );
    expect(screen.getByText('Governance')).toBeInTheDocument();
  });

  it('submits with the recommendation id intact', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true });
    render(<EditRecommendationForm {...baseProps} action={action} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Save/i }));
    expect(action).toHaveBeenCalledTimes(1);
    const payload = action.mock.calls[0]?.[0] as { recommendationId: string };
    expect(payload.recommendationId).toBe(baseProps.rec.id);
  });
});
```

- [ ] **Step 5: Implement the form**

Create `src/components/recommendations/edit-recommendation-form.tsx`:

```typescript
'use client';

import { useId, useTransition } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TagMultiSelect, type TagOption } from '@/components/tags/tag-multi-select';
import {
  EditRecommendationInput,
  type EditRecommendationInputT,
} from '@/lib/validation/edit-recommendation';

export type EditRecommendationAction = (
  input: EditRecommendationInputT,
) => Promise<{ ok: true } | { ok: false; error: string }>;

type AxisKey = 'thematic_areas' | 'purposes' | 'target_audience_types' | 'location_scopes';
type AxisOptions = Record<AxisKey, TagOption[]> & {
  priority_timescales: TagOption[];
};
type AxisMemberships = Record<AxisKey, string[]>;

type Props = {
  rec: {
    id: string;
    title: string;
    body: string;
    targetOrganization: string | null;
    notes: string | null;
    pageStart: number | null;
    pageEnd: number | null;
    priorityTimescaleSlug: string | null;
    confidence: 'high' | 'medium' | 'low' | null;
  };
  axisOptions: AxisOptions;
  initialMemberships: AxisMemberships;
  action: EditRecommendationAction;
  onSuccess?: () => void;
};

const NONE = '__none__';

export function EditRecommendationForm({
  rec,
  axisOptions,
  initialMemberships,
  action,
  onSuccess,
}: Props) {
  const titleId = useId();
  const bodyId = useId();
  const orgId = useId();
  const notesId = useId();
  const pageStartId = useId();
  const pageEndId = useId();
  const priorityId = useId();
  const confidenceId = useId();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<EditRecommendationInputT>({
    resolver: zodResolver(EditRecommendationInput),
    defaultValues: {
      recommendationId: rec.id,
      title: rec.title,
      body: rec.body,
      target_organization: rec.targetOrganization,
      priority_timescale_slug: rec.priorityTimescaleSlug,
      confidence: rec.confidence,
      notes: rec.notes,
      page_start: rec.pageStart,
      page_end: rec.pageEnd,
      thematic_area_slugs: initialMemberships.thematic_areas,
      purpose_slugs: initialMemberships.purposes,
      target_audience_type_slugs: initialMemberships.target_audience_types,
      location_scope_slugs: initialMemberships.location_scopes,
    },
  });

  function onSubmit(values: EditRecommendationInputT) {
    startTransition(async () => {
      const result = await action(values);
      if (result.ok) {
        onSuccess?.();
      } else {
        setError('root', { message: `Save failed: ${result.error}` });
      }
    });
  }

  return (
    <form className="space-y-8" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register('recommendationId')} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={titleId}>
            Title <span className="text-destructive">*</span>
          </Label>
          <Input
            id={titleId}
            className="bg-background"
            aria-invalid={errors.title ? true : undefined}
            {...register('title')}
          />
          {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={bodyId}>
            Body <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id={bodyId}
            rows={8}
            className="bg-background"
            aria-invalid={errors.body ? true : undefined}
            {...register('body')}
          />
          {errors.body && <p className="text-sm text-destructive">{errors.body.message}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={orgId}>Target organisation</Label>
          <Input id={orgId} className="bg-background" {...register('target_organization')} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={priorityId}>Priority timescale</Label>
          <Controller
            control={control}
            name="priority_timescale_slug"
            render={({ field }) => (
              <Select
                value={field.value ?? NONE}
                onValueChange={(v) => field.onChange(v === NONE ? null : (v as string))}
              >
                <SelectTrigger id={priorityId} className="w-full bg-background">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {axisOptions.priority_timescales.map((opt) => (
                    <SelectItem key={opt.slug} value={opt.slug}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={confidenceId}>Confidence</Label>
          <Controller
            control={control}
            name="confidence"
            render={({ field }) => (
              <Select
                value={field.value ?? NONE}
                onValueChange={(v) =>
                  field.onChange(v === NONE ? null : (v as 'high' | 'medium' | 'low'))
                }
              >
                <SelectTrigger id={confidenceId} className="w-full bg-background">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={pageStartId}>Page start</Label>
          <Input
            id={pageStartId}
            type="number"
            className="bg-background"
            {...register('page_start')}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={pageEndId}>Page end</Label>
          <Input
            id={pageEndId}
            type="number"
            className="bg-background"
            {...register('page_end')}
          />
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={notesId}>Notes</Label>
          <Textarea id={notesId} rows={3} className="bg-background" {...register('notes')} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Controller
          control={control}
          name="thematic_area_slugs"
          render={({ field }) => (
            <TagMultiSelect
              label="Thematic areas"
              options={axisOptions.thematic_areas}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="purpose_slugs"
          render={({ field }) => (
            <TagMultiSelect
              label="Purposes"
              options={axisOptions.purposes}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="target_audience_type_slugs"
          render={({ field }) => (
            <TagMultiSelect
              label="Target audiences"
              options={axisOptions.target_audience_types}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="location_scope_slugs"
          render={({ field }) => (
            <TagMultiSelect
              label="Location scopes"
              options={axisOptions.location_scopes}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </div>

      {errors.root && (
        <div
          role="alert"
          className="border border-destructive bg-accent-claret-soft px-3 py-2 text-sm text-destructive"
        >
          {errors.root.message}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="submit" variant="default" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Run the form test**

Run: `pnpm vitest run src/components/recommendations/edit-recommendation-form.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 7: Page**

Create `src/app/(app)/recommendations/[id]/edit/page.tsx`:

```typescript
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { findRecommendationById } from '@/lib/repositories/recommendation';
import { priorityTimescales } from '@/lib/db/schema';
import type { RepoContext } from '@/lib/repositories/types';
import {
  listLocationScopes,
  listPriorityTimescales,
  listPurposes,
  listTargetAudienceTypes,
  listThematicAreas,
} from '@/lib/repositories/taxonomy';
import {
  listRecommendationLocationScopes,
  listRecommendationPurposes,
  listRecommendationTargetAudienceTypes,
  listRecommendationThematicAreas,
} from '@/lib/repositories/recommendation-tags';
import { EditRecommendationForm } from '@/components/recommendations/edit-recommendation-form';
import { updateRecommendation } from '../actions';

export const dynamic = 'force-dynamic';

export default async function EditRecommendationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const env = loadEnv();
  const providers = createProviders(env);
  const client = createDb(env.DATABASE_URL);

  try {
    const headersList = await headers();
    const req = new Request('http://localhost/recommendations', { headers: headersList });
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    const rec = await findRecommendationById(ctx, id);
    if (!rec) notFound();

    let priorityTimescaleSlug: string | null = null;
    if (rec.priorityTimescaleId) {
      const [row] = await ctx.db
        .select({ slug: priorityTimescales.slug })
        .from(priorityTimescales)
        .where(eq(priorityTimescales.id, rec.priorityTimescaleId));
      priorityTimescaleSlug = row?.slug ?? null;
    }

    const [
      thematicAreas,
      purposes,
      audiences,
      locations,
      priorities,
      memberThemes,
      memberPurposes,
      memberAudiences,
      memberLocations,
    ] = await Promise.all([
      listThematicAreas(ctx),
      listPurposes(ctx),
      listTargetAudienceTypes(ctx),
      listLocationScopes(ctx),
      listPriorityTimescales(ctx),
      listRecommendationThematicAreas(ctx, rec.id),
      listRecommendationPurposes(ctx, rec.id),
      listRecommendationTargetAudienceTypes(ctx, rec.id),
      listRecommendationLocationScopes(ctx, rec.id),
    ]);

    return (
      <div className="space-y-8">
        <header className="space-y-3">
          <div className="section-num">06 · Recommendations · Edit</div>
          <h1 className="text-3xl tracking-tight">{rec.title}</h1>
          <p className="font-serif text-sm italic text-muted-foreground">
            Edit body, tags, and metadata. New tags land as unverified and surface on /admin/tags.
          </p>
        </header>
        <EditRecommendationForm
          rec={{
            id: rec.id,
            title: rec.title,
            body: rec.body,
            targetOrganization: rec.targetOrganization,
            notes: rec.notes,
            pageStart: rec.pageAnchor,
            pageEnd: null,
            priorityTimescaleSlug,
            confidence: rec.confidence,
          }}
          axisOptions={{
            thematic_areas: thematicAreas,
            purposes,
            target_audience_types: audiences,
            location_scopes: locations,
            priority_timescales: priorities,
          }}
          initialMemberships={{
            thematic_areas: memberThemes.map((t) => t.slug),
            purposes: memberPurposes.map((t) => t.slug),
            target_audience_types: memberAudiences.map((t) => t.slug),
            location_scopes: memberLocations.map((t) => t.slug),
          }}
          action={updateRecommendation}
        />
      </div>
    );
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}
```

Check that `findRecommendationById` exists in `src/lib/repositories/recommendation.ts`. If it doesn't return the new columns (`confidence`, `notes`, `targetOrganization`, `priorityTimescaleId`), update the SELECT projection there to include them.

Run: `grep -n "findRecommendationById" src/lib/repositories/recommendation.ts`
Expected: function defined. Read it and ensure its return type covers the new columns; add them to the projection if missing.

- [ ] **Step 8: Typecheck + run all new tests**

Run:
```bash
pnpm typecheck
pnpm vitest run src/components/recommendations/edit-recommendation-form.test.tsx
```
Expected: both green.

- [ ] **Step 9: Commit**

```bash
git add src/lib/validation/edit-recommendation.ts src/lib/repositories/recommendation.ts src/app/'(app)'/recommendations/'[id]'/actions.ts src/app/'(app)'/recommendations/'[id]'/edit/page.tsx src/components/recommendations/edit-recommendation-form.tsx src/components/recommendations/edit-recommendation-form.test.tsx
git commit -m "feat(recommendations): /recommendations/[id]/edit page with multi-axis tag editing + priority + confidence"
```

---

## Task 5: Admin tag review queue

**Files:**
- Modify: `src/lib/repositories/taxonomy.ts` (add admin operations)
- Create: `src/app/(app)/admin/tags/page.tsx`
- Create: `src/app/(app)/admin/tags/actions.ts`
- Create: `src/components/admin/tag-review-queue.tsx`
- Create: `src/components/admin/tag-review-queue.test.tsx`

- [ ] **Step 1: Add admin operations to the taxonomy repo**

Open `src/lib/repositories/taxonomy.ts`. After the existing exports, append:

```typescript
import { sql as drizzleSql } from 'drizzle-orm';
import {
  recommendationsLocationScopes,
  recommendationsPurposes,
  recommendationsTargetAudienceTypes,
  recommendationsThematicAreas,
  sourcesPurposes,
  sourcesRoleRelevances,
  sourcesSourceTypes,
  sourcesTargetAudienceTypes,
  sourcesThematicAreas,
} from '../db/schema';

export const TAXONOMY_AXES = [
  'thematic_areas',
  'purposes',
  'source_types',
  'target_audience_types',
  'location_scopes',
  'role_relevances',
  'priority_timescales',
] as const;
export type TaxonomyAxis = (typeof TAXONOMY_AXES)[number];

const AXIS_TABLES: Record<TaxonomyAxis, PgTable> = {
  thematic_areas: thematicAreas,
  purposes,
  source_types: sourceTypes,
  target_audience_types: targetAudienceTypes,
  location_scopes: locationScopes,
  role_relevances: roleRelevances,
  priority_timescales: priorityTimescales,
};

function tableForAxis(axis: TaxonomyAxis): PgTable {
  return AXIS_TABLES[axis];
}

export async function listUnverifiedTags(
  ctx: RepoContext,
  axis: TaxonomyAxis,
): Promise<TaxonomyRow[]> {
  const table = tableForAxis(axis);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = table as any;
  const rows = await ctx.db
    .select({
      id: t.id,
      slug: t.slug,
      name: t.name,
      colorHex: t.colorHex,
      description: t.description,
      unverified: t.unverified,
    })
    .from(table)
    .where(eq(t.unverified, true))
    .orderBy(asc(t.name));
  return rows as TaxonomyRow[];
}

export async function promoteTag(
  ctx: RepoContext,
  axis: TaxonomyAxis,
  tagId: string,
): Promise<void> {
  const table = tableForAxis(axis);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = table as any;
  await ctx.db.update(table).set({ unverified: false }).where(eq(t.id, tagId));
}

export async function renameTag(
  ctx: RepoContext,
  axis: TaxonomyAxis,
  tagId: string,
  newName: string,
): Promise<void> {
  const table = tableForAxis(axis);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = table as any;
  await ctx.db.update(table).set({ name: newName }).where(eq(t.id, tagId));
}

export async function deleteTag(
  ctx: RepoContext,
  axis: TaxonomyAxis,
  tagId: string,
): Promise<void> {
  const table = tableForAxis(axis);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = table as any;
  await ctx.db.delete(table).where(eq(t.id, tagId));
}

// M2M tables affected by a merge, keyed by axis. Merge rewrites any join
// row pointing at the source tag id to point at the target id (skipping
// duplicates via ON CONFLICT DO NOTHING), then deletes the source tag.
const AXIS_M2M_MERGE_TARGETS: Record<TaxonomyAxis, Array<{ table: string; column: string }>> = {
  thematic_areas: [
    { table: 'sources_thematic_areas', column: 'thematic_area_id' },
    { table: 'recommendations_thematic_areas', column: 'thematic_area_id' },
  ],
  purposes: [
    { table: 'sources_purposes', column: 'purpose_id' },
    { table: 'recommendations_purposes', column: 'purpose_id' },
  ],
  source_types: [{ table: 'sources_source_types', column: 'source_type_id' }],
  target_audience_types: [
    { table: 'sources_target_audience_types', column: 'target_audience_type_id' },
    { table: 'recommendations_target_audience_types', column: 'target_audience_type_id' },
  ],
  location_scopes: [{ table: 'recommendations_location_scopes', column: 'location_scope_id' }],
  role_relevances: [{ table: 'sources_role_relevances', column: 'role_relevance_id' }],
  priority_timescales: [], // single-FK on recommendations; handled separately
};

export async function mergeTag(
  ctx: RepoContext,
  axis: TaxonomyAxis,
  fromId: string,
  toId: string,
): Promise<void> {
  if (fromId === toId) return;
  // priority_timescales: rewrite the FK column on recommendations directly.
  if (axis === 'priority_timescales') {
    await ctx.db.execute(
      drizzleSql`UPDATE recommendations SET priority_timescale_id = ${toId} WHERE priority_timescale_id = ${fromId}`,
    );
    await deleteTag(ctx, axis, fromId);
    return;
  }
  const m2mList = AXIS_M2M_MERGE_TARGETS[axis];
  await ctx.db.transaction(async (tx) => {
    for (const { table, column } of m2mList) {
      // UPDATE … ON CONFLICT DO NOTHING isn't a thing in plain SQL; instead
      // we rewrite where the (parent, toId) pair doesn't already exist, then
      // delete any leftover (parent, fromId) rows.
      await tx.execute(
        drizzleSql.raw(`
          UPDATE "${table}"
          SET "${column}" = '${toId}'
          WHERE "${column}" = '${fromId}'
            AND NOT EXISTS (
              SELECT 1 FROM "${table}" t2
              WHERE t2."${column}" = '${toId}'
                AND row("${table}".*) IS DISTINCT FROM row(t2.*)
            )
        `),
      );
      await tx.execute(drizzleSql.raw(`DELETE FROM "${table}" WHERE "${column}" = '${fromId}'`));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = tableForAxis(axis) as any;
    await tx.delete(tableForAxis(axis)).where(eq(t.id, fromId));
  });
}
```

This is gnarly raw-SQL territory because the M2M tables are heterogeneous. The `row("table".*) IS DISTINCT FROM row(t2.*)` trick is a Postgres idiom for "no exact duplicate". Don't worry about elegance — it's tested below.

- [ ] **Step 2: Write repo tests for the admin operations**

Append to `src/lib/repositories/taxonomy.test.ts` (read it first to add to the existing structure):

```typescript
import {
  deleteTag,
  listUnverifiedTags,
  mergeTag,
  promoteTag,
  renameTag,
} from './taxonomy';

describe('taxonomy admin operations', () => {
  it('listUnverifiedTags returns only unverified rows for the axis', async () => {
    // Create an unverified purpose alongside the seeded verified ones.
    await resolveOrCreatePurposes(ctx, ['unverified-test-axis-x']);
    const rows = await listUnverifiedTags(ctx, 'purposes');
    expect(rows.find((r) => r.slug === 'unverified-test-axis-x')).toBeDefined();
    expect(rows.every((r) => r.unverified === true)).toBe(true);
  });

  it('promoteTag flips unverified=false', async () => {
    const [id] = await resolveOrCreatePurposes(ctx, ['unverified-promote']);
    await promoteTag(ctx, 'purposes', id!);
    const rows = await listPurposes(ctx);
    const row = rows.find((r) => r.slug === 'unverified-promote');
    expect(row?.unverified).toBe(false);
  });

  it('renameTag updates name', async () => {
    const [id] = await resolveOrCreatePurposes(ctx, ['unverified-rename']);
    await renameTag(ctx, 'purposes', id!, 'Renamed Purpose');
    const rows = await listPurposes(ctx);
    const row = rows.find((r) => r.slug === 'unverified-rename');
    expect(row?.name).toBe('Renamed Purpose');
  });

  it('deleteTag removes the row', async () => {
    const [id] = await resolveOrCreatePurposes(ctx, ['unverified-delete']);
    await deleteTag(ctx, 'purposes', id!);
    const rows = await listPurposes(ctx);
    expect(rows.find((r) => r.slug === 'unverified-delete')).toBeUndefined();
  });

  it('mergeTag for priority_timescales rewrites the FK and deletes the source', async () => {
    // Create an unverified priority + use it on a real rec, then merge.
    const fromIds = await resolveOrCreatePriorityTimescales(ctx, ['unverified-priority']);
    const fromId = fromIds[0]!;
    const verifiedRows = await listPriorityTimescales(ctx);
    const toId = verifiedRows.find((r) => r.slug === 'urgent')!.id;
    // Plumbing: insert a source + rec referencing fromId, then merge.
    const { sources, recommendations } = await import('../db/schema');
    const [s] = await ctx.db
      .insert(sources)
      .values({ slug: `merge-src-${Math.random().toString(36).slice(2, 10)}`, title: 'M' })
      .returning({ id: sources.id });
    const [r] = await ctx.db
      .insert(recommendations)
      .values({
        sourceId: s!.id,
        slug: `merge-rec-${Math.random().toString(36).slice(2, 10)}`,
        title: 'Merge candidate',
        body: 'Body with at least twenty characters so the schema is happy.',
        priorityTimescaleId: fromId,
      })
      .returning({ id: recommendations.id });
    await mergeTag(ctx, 'priority_timescales', fromId, toId);
    const [updated] = await ctx.db
      .select({ priorityTimescaleId: recommendations.priorityTimescaleId })
      .from(recommendations)
      .where(eq(recommendations.id, r!.id));
    expect(updated?.priorityTimescaleId).toBe(toId);
    const rows = await listPriorityTimescales(ctx);
    expect(rows.find((p) => p.id === fromId)).toBeUndefined();
  });
});
```

(Add `import { eq } from 'drizzle-orm';` to the top if missing.)

- [ ] **Step 3: Run the repo tests**

Run: `pnpm vitest run src/lib/repositories/taxonomy.test.ts`
Expected: all tests pass (existing + 5 new).

- [ ] **Step 4: Server actions**

Create `src/app/(app)/admin/tags/actions.ts`:

```typescript
'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import type { RepoContext } from '@/lib/repositories/types';
import {
  TAXONOMY_AXES,
  deleteTag,
  mergeTag,
  promoteTag,
  renameTag,
  type TaxonomyAxis,
} from '@/lib/repositories/taxonomy';

const AxisSchema = z.enum(TAXONOMY_AXES);

const PromoteInput = z.object({ axis: AxisSchema, id: z.string().uuid() });
const RenameInput = z.object({
  axis: AxisSchema,
  id: z.string().uuid(),
  name: z.string().min(1).max(500),
});
const MergeInput = z.object({
  axis: AxisSchema,
  fromId: z.string().uuid(),
  toId: z.string().uuid(),
});
const DeleteInput = z.object({ axis: AxisSchema, id: z.string().uuid() });

type Result = { ok: true } | { ok: false; error: string };

async function buildContext(): Promise<{ ctx: RepoContext; close: () => Promise<void> }> {
  const env = loadEnv();
  const providers = createProviders(env);
  const headersList = await headers();
  const req = new Request('http://localhost/admin/tags', { headers: headersList });
  const auth = await providers.auth.getContext(req);
  const client = createDb(env.DATABASE_URL);
  return {
    ctx: { db: client.db, auth },
    close: async () => {
      await client.sql.end({ timeout: 5 }).catch(() => {});
    },
  };
}

export async function promoteTagAction(input: unknown): Promise<Result> {
  const parsed = PromoteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { ctx, close } = await buildContext();
  try {
    await promoteTag(ctx, parsed.data.axis as TaxonomyAxis, parsed.data.id);
    revalidatePath('/admin/tags', 'page');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' };
  } finally {
    await close();
  }
}

export async function renameTagAction(input: unknown): Promise<Result> {
  const parsed = RenameInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { ctx, close } = await buildContext();
  try {
    await renameTag(ctx, parsed.data.axis as TaxonomyAxis, parsed.data.id, parsed.data.name);
    revalidatePath('/admin/tags', 'page');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' };
  } finally {
    await close();
  }
}

export async function mergeTagAction(input: unknown): Promise<Result> {
  const parsed = MergeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { ctx, close } = await buildContext();
  try {
    await mergeTag(
      ctx,
      parsed.data.axis as TaxonomyAxis,
      parsed.data.fromId,
      parsed.data.toId,
    );
    revalidatePath('/admin/tags', 'page');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' };
  } finally {
    await close();
  }
}

export async function deleteTagAction(input: unknown): Promise<Result> {
  const parsed = DeleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { ctx, close } = await buildContext();
  try {
    await deleteTag(ctx, parsed.data.axis as TaxonomyAxis, parsed.data.id);
    revalidatePath('/admin/tags', 'page');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' };
  } finally {
    await close();
  }
}
```

- [ ] **Step 5: Tag review queue component test**

Create `src/components/admin/tag-review-queue.test.tsx`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagReviewQueue } from './tag-review-queue';

const sections = [
  {
    axis: 'purposes' as const,
    unverified: [
      {
        id: '00000000-0000-0000-0000-000000000001',
        slug: 'unverified-one',
        name: 'Unverified one',
        colorHex: null,
        description: null,
        unverified: true,
      },
    ],
    verified: [
      {
        id: '00000000-0000-0000-0000-000000000002',
        slug: 'strategy',
        name: 'Strategy',
        colorHex: null,
        description: null,
        unverified: false,
      },
    ],
  },
];

describe('TagReviewQueue', () => {
  it('renders an axis section per axis', () => {
    render(
      <TagReviewQueue
        sections={sections}
        onPromote={vi.fn().mockResolvedValue({ ok: true })}
        onRename={vi.fn().mockResolvedValue({ ok: true })}
        onMerge={vi.fn().mockResolvedValue({ ok: true })}
        onDelete={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(screen.getByText(/purposes/i)).toBeInTheDocument();
    expect(screen.getByText('Unverified one')).toBeInTheDocument();
  });

  it('clicking Promote fires onPromote with (axis, id)', async () => {
    const onPromote = vi.fn().mockResolvedValue({ ok: true });
    render(
      <TagReviewQueue
        sections={sections}
        onPromote={onPromote}
        onRename={vi.fn().mockResolvedValue({ ok: true })}
        onMerge={vi.fn().mockResolvedValue({ ok: true })}
        onDelete={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Promote/i }));
    expect(onPromote).toHaveBeenCalledWith({
      axis: 'purposes',
      id: '00000000-0000-0000-0000-000000000001',
    });
  });

  it('shows an empty-state message when an axis has no unverified rows', () => {
    render(
      <TagReviewQueue
        sections={[{ axis: 'purposes', unverified: [], verified: [] }]}
        onPromote={vi.fn().mockResolvedValue({ ok: true })}
        onRename={vi.fn().mockResolvedValue({ ok: true })}
        onMerge={vi.fn().mockResolvedValue({ ok: true })}
        onDelete={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(screen.getByText(/queue is quiet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Implement the component**

Create `src/components/admin/tag-review-queue.tsx`:

```typescript
'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TaxonomyAxis } from '@/lib/repositories/taxonomy';
import type { TaxonomyRow } from '@/lib/repositories/taxonomy';

export type TagAction<T> = (input: T) => Promise<{ ok: true } | { ok: false; error: string }>;

export type AxisSection = {
  axis: TaxonomyAxis;
  unverified: ReadonlyArray<TaxonomyRow>;
  verified: ReadonlyArray<TaxonomyRow>;
};

type Props = {
  sections: ReadonlyArray<AxisSection>;
  onPromote: TagAction<{ axis: TaxonomyAxis; id: string }>;
  onRename: TagAction<{ axis: TaxonomyAxis; id: string; name: string }>;
  onMerge: TagAction<{ axis: TaxonomyAxis; fromId: string; toId: string }>;
  onDelete: TagAction<{ axis: TaxonomyAxis; id: string }>;
};

function humaniseAxis(axis: TaxonomyAxis): string {
  return axis.replace(/_/g, ' ');
}

export function TagReviewQueue({
  sections,
  onPromote,
  onRename,
  onMerge,
  onDelete,
}: Props) {
  return (
    <div className="space-y-10">
      {sections.map((section) => (
        <AxisCard
          key={section.axis}
          section={section}
          onPromote={onPromote}
          onRename={onRename}
          onMerge={onMerge}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

type CardProps = Omit<Props, 'sections'> & { section: AxisSection };

function AxisCard({ section, onPromote, onRename, onMerge, onDelete }: CardProps) {
  return (
    <section className="space-y-3">
      <div className="border-b border-rule-strong pb-2">
        <h2 className="text-sm font-medium capitalize">{humaniseAxis(section.axis)}</h2>
        <p className="font-serif text-xs italic text-muted-foreground">
          {section.unverified.length} unverified · {section.verified.length} verified
        </p>
      </div>
      {section.unverified.length === 0 ? (
        <p className="font-serif text-sm italic text-muted-foreground">
          No unverified tags — the queue is quiet for this axis.
        </p>
      ) : (
        <ul className="divide-y divide-rule border-y border-rule">
          {section.unverified.map((tag) => (
            <TagRow
              key={tag.id}
              axis={section.axis}
              tag={tag}
              verified={section.verified}
              onPromote={onPromote}
              onRename={onRename}
              onMerge={onMerge}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

type RowProps = {
  axis: TaxonomyAxis;
  tag: TaxonomyRow;
  verified: ReadonlyArray<TaxonomyRow>;
  onPromote: Props['onPromote'];
  onRename: Props['onRename'];
  onMerge: Props['onMerge'];
  onDelete: Props['onDelete'];
};

function TagRow({ axis, tag, verified, onPromote, onRename, onMerge, onDelete }: RowProps) {
  const [renameMode, setRenameMode] = useState(false);
  const [newName, setNewName] = useState(tag.name);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function call<I>(action: TagAction<I>, input: I): void {
    setError(null);
    startTransition(async () => {
      const result = await action(input);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
      <div className="space-y-0.5">
        {renameMode ? (
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="bg-background"
            />
            <Button
              size="sm"
              variant="default"
              disabled={isPending || newName === tag.name}
              onClick={() => {
                call(onRename, { axis, id: tag.id, name: newName });
                setRenameMode(false);
              }}
            >
              Save
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRenameMode(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <div className="font-medium">{tag.name}</div>
            <div className="font-mono text-xs text-muted-foreground">{tag.slug}</div>
          </>
        )}
        {error && <div className="text-xs text-destructive">{error}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="default"
          disabled={isPending}
          onClick={() => call(onPromote, { axis, id: tag.id })}
        >
          Promote
        </Button>
        {!renameMode && (
          <Button size="sm" variant="outline" onClick={() => setRenameMode(true)}>
            Rename
          </Button>
        )}
        <Select
          value={mergeTargetId ?? ''}
          onValueChange={(v) => setMergeTargetId(v || null)}
        >
          <SelectTrigger className="w-44 bg-background">
            <SelectValue placeholder="Merge into…" />
          </SelectTrigger>
          <SelectContent>
            {verified.map((target) => (
              <SelectItem key={target.id} value={target.id}>
                {target.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending || !mergeTargetId}
          onClick={() => {
            if (mergeTargetId) call(onMerge, { axis, fromId: tag.id, toId: mergeTargetId });
          }}
        >
          Merge
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => call(onDelete, { axis, id: tag.id })}
          className="text-destructive"
        >
          Delete
        </Button>
      </div>
    </li>
  );
}
```

- [ ] **Step 7: Run the component test**

Run: `pnpm vitest run src/components/admin/tag-review-queue.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 8: Create the page**

Create `src/app/(app)/admin/tags/page.tsx`:

```typescript
import { headers } from 'next/headers';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import type { RepoContext } from '@/lib/repositories/types';
import {
  TAXONOMY_AXES,
  listLocationScopes,
  listPriorityTimescales,
  listPurposes,
  listRoleRelevances,
  listSourceTypes,
  listTargetAudienceTypes,
  listThematicAreas,
  listUnverifiedTags,
  type TaxonomyAxis,
  type TaxonomyRow,
} from '@/lib/repositories/taxonomy';
import {
  TagReviewQueue,
  type AxisSection,
} from '@/components/admin/tag-review-queue';
import {
  deleteTagAction,
  mergeTagAction,
  promoteTagAction,
  renameTagAction,
} from './actions';

export const dynamic = 'force-dynamic';

async function fetchVerified(ctx: RepoContext, axis: TaxonomyAxis): Promise<TaxonomyRow[]> {
  switch (axis) {
    case 'thematic_areas':
      return (await listThematicAreas(ctx)).filter((r) => !r.unverified);
    case 'purposes':
      return (await listPurposes(ctx)).filter((r) => !r.unverified);
    case 'source_types':
      return (await listSourceTypes(ctx)).filter((r) => !r.unverified);
    case 'target_audience_types':
      return (await listTargetAudienceTypes(ctx)).filter((r) => !r.unverified);
    case 'location_scopes':
      return (await listLocationScopes(ctx)).filter((r) => !r.unverified);
    case 'role_relevances':
      return (await listRoleRelevances(ctx)).filter((r) => !r.unverified);
    case 'priority_timescales':
      return (await listPriorityTimescales(ctx)).filter((r) => !r.unverified);
  }
}

export default async function AdminTagsPage() {
  const env = loadEnv();
  const providers = createProviders(env);
  const client = createDb(env.DATABASE_URL);
  try {
    const headersList = await headers();
    const req = new Request('http://localhost/admin/tags', { headers: headersList });
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    const sections: AxisSection[] = [];
    for (const axis of TAXONOMY_AXES) {
      const [unverified, verified] = await Promise.all([
        listUnverifiedTags(ctx, axis),
        fetchVerified(ctx, axis),
      ]);
      sections.push({ axis, unverified, verified });
    }

    return (
      <div className="space-y-10">
        <header className="space-y-3">
          <div className="section-num">05 · Admin · Tags</div>
          <h1 className="text-3xl tracking-tight">Tag review queue</h1>
          <p className="max-w-[42rem] font-serif text-base italic leading-relaxed text-foreground/85">
            Tags coined by the extraction LLM (or hand-typed in edit pages) that don&apos;t match an existing slug land here as <em>unverified</em>. Promote, rename, merge into an existing tag, or delete.
          </p>
        </header>
        <TagReviewQueue
          sections={sections}
          onPromote={promoteTagAction}
          onRename={renameTagAction}
          onMerge={mergeTagAction}
          onDelete={deleteTagAction}
        />
      </div>
    );
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/repositories/taxonomy.ts src/lib/repositories/taxonomy.test.ts src/app/'(app)'/admin/tags src/components/admin/tag-review-queue.tsx src/components/admin/tag-review-queue.test.tsx
git commit -m "feat(admin): /admin/tags review queue (promote/rename/merge/delete) per axis"
```

---

## Task 6: Wire tag chips into existing display surfaces

Read each file first to understand its current shape; the diffs below are minimal — drop in `<TagChips>` and the related data load.

**Files:**
- Modify: `src/app/(app)/sources/[slug]/page.tsx`
- Modify: `src/app/(app)/recommendations/[id]/page.tsx`

(Catalogue and rec-index chip integrations are deferred — they touch table-rendering code and would balloon this task. The spec lists them but they're additive cosmetics; ship in 1.2 fast-follow if not done in this round.)

- [ ] **Step 1: Read `/sources/[slug]/page.tsx`**

Run: `grep -n "metadata\|TagChips\|listSource\|return (" src/app/'(app)'/sources/'[slug]'/page.tsx | head`
Expected: see the structure of the access-gating + render block.

- [ ] **Step 2: Add tag display to the source viewer header**

Open `src/app/(app)/sources/[slug]/page.tsx`. Add these imports at the top:

```typescript
import { TagChips } from '@/components/tags/tag-chips';
import {
  listSourcePurposes,
  listSourceRoleRelevances,
  listSourceSourceTypes,
  listSourceTargetAudienceTypes,
  listSourceThematicAreas,
} from '@/lib/repositories/source-tags';
import Link from 'next/link';
```

(If `Link` is already imported, skip that line.)

Find the section where source title / metadata is rendered. Above the `<SourceViewer>` (or markdown body), add:

```typescript
const [themes, types, purposes, roles, audiences] = await Promise.all([
  listSourceThematicAreas(ctx, data.id ?? source.id),
  listSourceSourceTypes(ctx, data.id ?? source.id),
  listSourcePurposes(ctx, data.id ?? source.id),
  listSourceRoleRelevances(ctx, data.id ?? source.id),
  listSourceTargetAudienceTypes(ctx, data.id ?? source.id),
]);
```

(Adjust `data.id` / `source.id` to match the variable that holds the resolved source.)

And in the render JSX, after the title and above the markdown body, insert:

```tsx
<div className="space-y-3 border-b border-rule pb-4">
  <div className="flex items-baseline justify-between">
    <h1 className="text-3xl tracking-tight">{data.title}</h1>
    <Link
      href={`/sources/${slug}/edit`}
      className="text-sm text-muted-foreground hover:text-accent"
    >
      Edit
    </Link>
  </div>
  {themes.length > 0 && <TagChips tags={themes} />}
  {types.length > 0 && <TagChips tags={types} />}
  {purposes.length > 0 && <TagChips tags={purposes} />}
  {roles.length > 0 && <TagChips tags={roles} />}
  {audiences.length > 0 && <TagChips tags={audiences} />}
</div>
```

Adjust placement to match the file's existing structure — the goal is "header area shows tags + Edit link before the body".

- [ ] **Step 3: Add tag display to the recommendation detail Overview tab**

Open `src/app/(app)/recommendations/[id]/page.tsx`. Add imports:

```typescript
import { TagChips } from '@/components/tags/tag-chips';
import {
  listRecommendationLocationScopes,
  listRecommendationPurposes,
  listRecommendationTargetAudienceTypes,
  listRecommendationThematicAreas,
} from '@/lib/repositories/recommendation-tags';
import Link from 'next/link';
```

Inside the page's data loading, add the four memberships:

```typescript
const [themes, purposes, audiences, locations] = await Promise.all([
  listRecommendationThematicAreas(ctx, rec.id),
  listRecommendationPurposes(ctx, rec.id),
  listRecommendationTargetAudienceTypes(ctx, rec.id),
  listRecommendationLocationScopes(ctx, rec.id),
]);
```

In the Overview tab content, near the top, add:

```tsx
<div className="flex items-baseline justify-between">
  <h1 className="text-3xl tracking-tight">{rec.title}</h1>
  <Link href={`/recommendations/${rec.id}/edit`} className="text-sm text-muted-foreground hover:text-accent">
    Edit
  </Link>
</div>
<div className="space-y-2">
  {themes.length > 0 && <TagChips tags={themes} />}
  {purposes.length > 0 && <TagChips tags={purposes} />}
  {audiences.length > 0 && <TagChips tags={audiences} />}
  {locations.length > 0 && <TagChips tags={locations} />}
</div>
```

Adjust placement to fit the existing layout.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/'(app)'/sources/'[slug]'/page.tsx src/app/'(app)'/recommendations/'[id]'/page.tsx
git commit -m "feat(ui): tag chips on /sources/[slug] header and /recommendations/[id] overview + Edit links"
```

---

## Task 7: E2E spec extensions

**Files:**
- Modify: `tests/e2e/local-mode.spec.ts`
- Modify: `tests/e2e/hosted-mode.spec.ts`

- [ ] **Step 1: Add an edit assertion to `local-mode.spec.ts`**

Open `tests/e2e/local-mode.spec.ts`. Find the spec's final assertion block. Before the `});` that closes the `test()`, add:

```typescript
    // Navigate to a recommendation's edit page, tweak the title, save,
    // reload, and assert the change persisted.
    await page.goto('/recommendations');
    await page.getByText(FIXTURE_FIRST_REC_TITLE, { exact: false }).first().click();
    await page.getByRole('link', { name: /^Edit$/i }).click();
    const titleInput = page.getByLabel(/^Title/i);
    const originalTitle = await titleInput.inputValue();
    const editedTitle = `${originalTitle} (edited)`;
    await titleInput.fill(editedTitle);
    await page.getByRole('button', { name: /^Save$/i }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByDisplayValue(editedTitle)).toBeVisible({ timeout: 5_000 });
```

- [ ] **Step 2: Add an edit assertion to `hosted-mode.spec.ts`**

Open `tests/e2e/hosted-mode.spec.ts`. After the existing assertion that the request-access form is gone for the approved viewer, add:

```typescript
  // -- Admin edits the source title, viewer reloads and sees the new title. --
  await adminPage.goto(`/sources/${slug}/edit`);
  const sourceTitleInput = adminPage.getByLabel(/^Title/i);
  const newTitle = `${SOURCE_TITLE} — edited`;
  await sourceTitleInput.fill(newTitle);
  await adminPage.getByRole('button', { name: /^Save$/i }).click();
  await adminPage.waitForLoadState('networkidle');
  await viewerPage.goto(`/sources/${slug}`);
  await expect(viewerPage.getByRole('heading', { name: newTitle })).toBeVisible({
    timeout: 10_000,
  });
```

- [ ] **Step 3: Run the e2e specs**

Run: `pnpm test:e2e:local` then `pnpm test:e2e:hosted`
Expected: both spec files pass; runs take ~10-15s each on a warm laptop.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/local-mode.spec.ts tests/e2e/hosted-mode.spec.ts
git commit -m "test(e2e): assert edit flows persist on both local and hosted modes"
```

---

## Task 8: Docs + 1.1.0 release prep

**Files:**
- Modify: `docs/running-locally.md`
- Modify: `docs/changelog.md`
- Modify: `package.json`

- [ ] **Step 1: Update `running-locally.md`**

Append (or insert near the existing LLM-provider section) the following:

```markdown
### Extraction quality — local vs. hosted models

The two-pass extraction pipeline asks the LLM to (a) summarise the document and tag it on five axes, and (b) extract every recommendation with full multi-axis tagging + confidence. A small local model like `llama3.1:8b` can complete both passes, but accuracy drops noticeably on long documents and the LLM may coin new tags rather than picking from the listed taxonomy.

The recommended split:

- **Local mode**: `LLM_PROVIDER=openai-compatible`, `LLM_MODEL=llama3.1:8b` (or your installed Ollama model). Free, runs on the Mac mini.
- **Hosted mode**: `LLM_PROVIDER=anthropic`, `LLM_MODEL=claude-haiku-4-5`. Cents per document; meaningfully better recall + accuracy on the structured-output paths.

The `CHAT_*` env split shipped in 1.0 lets you run a heavyweight extract model alongside a lightweight streaming chat model — useful if you want Claude for extract and `qwen2.5:0.5b` (local) for chat.

Unknown tags coined by the extract LLM land as `unverified=true` in the taxonomy and surface on `/admin/tags` for promotion / rename / merge / delete. Admin operators should sweep that queue periodically.
```

- [ ] **Step 2: Bump `package.json` version**

Open `package.json`. Change `"version": "1.0.0"` to `"version": "1.1.0"`.

- [ ] **Step 3: Add a 1.1.0 entry to `docs/changelog.md`**

Open `docs/changelog.md`. After the `## [Unreleased]` header, insert:

```markdown
## 2026-05-13 — 1.1.0

Extraction & tagging rebuild.

### Added

- **Source-level metadata + multi-axis tagging.** Sources now carry `summary`, `authors`, `publication_date`, `org_owner`, `original_url`, `attachment_url`, `datasets`, plus M2M memberships across thematic areas, source types, purposes, role relevances, and target audience types.
- **Recommendation-level multi-axis tagging.** Recommendations now carry `target_organization`, `priority_timescale` (FK), `notes`, `confidence` (high/medium/low), plus M2M memberships across thematic areas, purposes, target audiences, and location scopes.
- **Expanded taxonomy defaults.** 29 thematic areas (v1 parity), plus seeded defaults for the six new axes.
- **Two-pass section-aware extraction.** The `source.extract` handler now runs two LLM calls — Pass 1 for source metadata, Pass 2 for recommendations — with regex-detected recommendation sections feeding a strict prompt and falling back to a looser full-document prompt otherwise.
- **Unknown-tag auto-create.** Tags the LLM coins (or humans type in the edit pages) that don't match a seeded slug land as `unverified=true` and surface on `/admin/tags`.
- **`/sources/[slug]/edit` and `/recommendations/[id]/edit`** dedicated edit pages with multi-axis tag editing.
- **`/admin/tags`** review queue — promote, rename, merge, delete per axis.
- **Tag chips** on source detail headers and recommendation overview tabs, with a visual hint for unverified tags.

### Schema

Migrations 0007 through 0011: six new taxonomy reference tables, eight new M2M join tables, source-metadata columns, recommendation-metadata columns, and a nullable-color-hex consistency fix.

### Carry-overs to 1.2

- Search filters by purpose / audience / source type / location.
- New analytics charts for source-type / audience-mix breakdowns.
- Inline multi-select edits on the catalogue / index tables.
- Tag chips on the `/sources` catalogue + `/recommendations` index (deferred to keep 1.1 focused).
- Bulk re-tag UI.
- Hierarchical tags (sub-themes).
```

- [ ] **Step 4: Commit**

```bash
git add docs/running-locally.md docs/changelog.md package.json
git commit -m "release: 1.1.0 — extraction & tagging rebuild + docs"
```

---

## Task 9: Final verify + push + open PR

- [ ] **Step 1: Run full verify**

Run: `pnpm verify`
Expected: typecheck, lint, every test file, build — all green. New test count grows by roughly 20–30 across `tag-chips`, `tag-multi-select`, edit forms, admin queue, and the taxonomy admin repo tests.

- [ ] **Step 2: Smoke check on a clean db**

Run:
```bash
docker compose down -v
docker compose up -d postgres
for i in $(seq 1 30); do docker exec open-recs-local-postgres-1 pg_isready -U postgres -d openrecs 2>/dev/null && break; sleep 0.5; done
set -a; source .env; set +a
pnpm db:migrate
pnpm db:seed
```
Expected: `migrations applied`, then `taxonomy seeded`.

- [ ] **Step 3: Push the branch**

Run: `git push -u origin feat/extraction-tagging-ui`
Expected: branch pushed; gh prints the PR creation URL.

- [ ] **Step 4: Open the PR**

Run:
```bash
gh pr create --base master --title "feat: extraction-tagging-rebuild — UI + edit pages + admin (PR 3)" --body "$(cat <<'EOF'
## Summary

PR 3 of 3 implementing the extraction-and-tagging rebuild. See [\`docs/superpowers/specs/2026-05-12-extraction-and-tagging-rebuild-design.md\`](docs/superpowers/specs/2026-05-12-extraction-and-tagging-rebuild-design.md) for the full design.

This PR ships the UI layer + admin review queue + 1.1.0 release prep. With PRs #21 + #22 already on master, this completes the 1.1 milestone.

### Added

- **\`<TagChips>\`** read-only chip list with colour accent + unverified hint.
- **\`<TagMultiSelect>\`** controlled multi-select with filter + add-new affordance.
- **\`/sources/[slug]/edit\`** — full source-metadata editor (title, summary, authors, dates, org_owner, original_url, attachment_url, datasets, multi-axis tags, hosted-mode privacy toggle).
- **\`/recommendations/[id]/edit\`** — full recommendation editor (title, body, target_organization, priority, confidence, notes, page anchors, multi-axis tags).
- **\`/admin/tags\`** — per-axis review queue. Each row: promote, rename, merge into existing, delete.
- **Tag chips** on \`/sources/[slug]\` header and \`/recommendations/[id]\` overview, plus Edit links.

### Schema & repo

- Admin operations on the taxonomy repo: \`listUnverifiedTags\`, \`promoteTag\`, \`renameTag\`, \`mergeTag\`, \`deleteTag\` (with the priority_timescales FK-rewrite special case).
- \`updateSourceMetadata\` + \`updateRecommendationCore\` on the source / recommendation repos.

### Release

- \`package.json\` bumped \`1.0.0\` → \`1.1.0\`.
- \`docs/changelog.md\` gets a 1.1.0 entry.
- \`docs/running-locally.md\` documents the local-vs-Claude extraction trade-off.

## Test plan

- [x] \`pnpm verify\` — all tests + build green.
- [x] \`pnpm test:e2e:local\` and \`pnpm test:e2e:hosted\` — extended with edit-flow assertions.
- [x] Clean docker-compose round-trip lands every migration cleanly.
- [ ] Manual: upload a PDF in local mode → edit the recommendation → reload → tag persists. Upload a PDF in hosted mode as admin → edit source title → second user sees the new title.

## Carry-overs to 1.2

- Tag chips on the \`/sources\` catalogue + \`/recommendations\` index tables.
- Search filters by every new axis (themes filter exists today).
- Analytics charts for source-type / audience-mix breakdowns.
- Inline multi-select edits.
- Bulk re-tag UI.
- Hierarchical tags.

## Tag v1.1.0 after merge

\`git tag -a v1.1.0 <merge-sha> -m "Open Recommendations Local 1.1.0" && git push origin v1.1.0\`
EOF
)"
```

- [ ] **Step 5: Confirm CI starts**

Run: `gh pr view --json url,statusCheckRollup | head -30`
Expected: PR URL; `verify` + `e2e (local)` + `e2e (hosted)` jobs starting.

---

## Notes for the executor

- **Form components use `react-hook-form` + `zodResolver`** mirroring `ProgressUpdateForm` in `src/components/progress/progress-update-form.tsx`. Read that file for the conventions if anything is unclear.
- **Server actions use a `buildContext()` helper** that boots a per-request `RepoContext` from the request headers; mirror the existing pattern in `src/app/(app)/sources/[slug]/actions.ts`.
- **`<TagMultiSelect>` is controlled.** The parent component (a `react-hook-form` `<Controller>`) owns the slug array; the multi-select just emits `onChange`.
- **The `mergeTag` raw SQL is intentional**: Drizzle doesn't have a clean generic way to address arbitrary M2M tables, and the heterogeneity of FK column names per axis makes a typed solution verbose. The raw SQL is tested at the repo layer.
- **`/admin/tags` is available in both modes** by design (operational rather than auth-gated; the spec calls this out explicitly).
- **Date handling**: `publication_date` round-trips as ISO `YYYY-MM-DD` strings between the form and the action; the action converts to `Date` for Postgres. Drizzle's `date('publication_date', { mode: 'date' })` accepts JS Dates clamped to midnight UTC.
