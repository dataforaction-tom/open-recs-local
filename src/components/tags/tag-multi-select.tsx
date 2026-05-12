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
              <li
                key={opt.slug}
                role="option"
                aria-selected={false}
                aria-label={opt.name}
                tabIndex={0}
                onClick={() => add(opt.slug)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    add(opt.slug);
                  }
                }}
                className="flex w-full cursor-pointer items-center justify-between px-2 py-1 text-left text-sm hover:bg-accent-soft focus:bg-accent-soft focus:outline-none"
              >
                <span>{opt.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{opt.slug}</span>
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
