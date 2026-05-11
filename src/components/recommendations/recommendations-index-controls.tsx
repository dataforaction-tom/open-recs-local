'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSearchParamsState } from '@/lib/hooks/use-search-params-state';
import { FilterChips, type ActiveFilter } from './filter-chips';

const DEFAULTS = { q: '', mode: 'hybrid' as 'hybrid' | 'keyword' };

export function RecommendationsIndexControls() {
  const [state, setState] = useSearchParamsState<typeof DEFAULTS>(DEFAULTS);
  const [draft, setDraft] = useState(state.q);

  // Re-sync the input when the URL's q changes from outside (back/forward,
  // shared link, chip-clear). React's "store info from previous renders"
  // pattern avoids the React Compiler's setState-in-effect ban.
  const [lastSyncedQ, setLastSyncedQ] = useState(state.q);
  if (state.q !== lastSyncedQ) {
    setLastSyncedQ(state.q);
    setDraft(state.q);
  }

  const active: ActiveFilter[] = [];
  if (state.q.length > 0) active.push({ key: 'q', label: 'Search', value: state.q });
  if (state.mode !== DEFAULTS.mode) {
    active.push({ key: 'mode', label: 'Mode', value: state.mode });
  }

  return (
    <div className="space-y-4">
      <form
        className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          setState({ q: draft });
        }}
      >
        <label className="space-y-1.5">
          <span className="text-sm text-muted-foreground">Search</span>
          <Input
            type="search"
            placeholder="e.g. governance · safeguarding · audit rotation"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Search recommendations"
          />
        </label>
        <Button type="submit" size="default" variant="outline">
          Search
        </Button>
        <Button
          type="button"
          variant={state.mode === 'hybrid' ? 'default' : 'outline'}
          size="default"
          onClick={() => setState({ mode: state.mode === 'hybrid' ? 'keyword' : 'hybrid' })}
          aria-label={`Toggle search mode (current: ${state.mode})`}
        >
          {state.mode === 'hybrid' ? 'Hybrid mode' : 'Keyword mode'}
        </Button>
      </form>
      <FilterChips
        active={active}
        onClear={(key) => {
          if (key === 'q') {
            setDraft('');
            setState({ q: '' });
          } else if (key === 'mode') {
            setState({ mode: 'hybrid' });
          }
        }}
      />
    </div>
  );
}
