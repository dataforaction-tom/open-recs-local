'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSearchParamsState } from '@/lib/hooks/use-search-params-state';

type SourceStatusValue =
  | 'pending'
  | 'parsing'
  | 'extracting'
  | 'embedding'
  | 'ready'
  | 'failed';

const STATUS_OPTIONS: { value: SourceStatusValue; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'parsing', label: 'Parsing' },
  { value: 'extracting', label: 'Extracting' },
  { value: 'embedding', label: 'Embedding' },
  { value: 'ready', label: 'Ready' },
  { value: 'failed', label: 'Failed' },
];

const DEFAULTS = { q: '', status: '' };

export function SourcesIndexControls(props: {
  initialQ: string;
  initialStatus?: SourceStatusValue | undefined;
}) {
  const [state, setState] = useSearchParamsState<typeof DEFAULTS>(DEFAULTS);
  const [draftQ, setDraftQ] = useState(props.initialQ);

  // Re-sync the input when the URL's q changes from outside (back/forward,
  // shared link, clear-filters link). React's "store info from previous
  // renders" pattern avoids the React Compiler's setState-in-effect ban.
  const [lastSyncedQ, setLastSyncedQ] = useState(props.initialQ);
  if (state.q !== lastSyncedQ) {
    setLastSyncedQ(state.q);
    setDraftQ(state.q);
  }

  return (
    <div className="space-y-4">
      <form
        className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          setState({ q: draftQ });
        }}
      >
        <label className="space-y-1.5">
          <span className="text-sm text-muted-foreground">Search titles</span>
          <Input
            type="search"
            placeholder="e.g. governance · audit · safeguarding"
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            aria-label="Search sources by title"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm text-muted-foreground">Status</span>
          <select
            aria-label="Filter sources by status"
            className="h-8 min-w-32 border border-rule bg-background px-2.5 py-1 font-mono text-sm leading-none outline-none transition-colors focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent/40"
            value={state.status}
            onChange={(e) => {
              const value = e.target.value;
              setState({ status: value });
            }}
          >
            <option value="">All</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" size="default" variant="outline">
          Search
        </Button>
      </form>

      {(state.q.length > 0 || state.status.length > 0) && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>Filters active</span>
          <Link
            href="/sources"
            className="underline underline-offset-4 hover:text-accent"
          >
            Clear filters
          </Link>
        </div>
      )}
    </div>
  );
}