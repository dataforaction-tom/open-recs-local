'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSearchParamsState } from '@/lib/hooks/use-search-params-state';
import { FilterChips, type ActiveFilter } from './filter-chips';

const DEFAULTS = { q: '', mode: 'hybrid' as 'hybrid' | 'keyword' };

export function RecommendationsIndexControls() {
  const [state, setState] = useSearchParamsState<typeof DEFAULTS>(DEFAULTS);
  const [draft, setDraft] = useState(state.q);

  const active: ActiveFilter[] = [];
  if (state.q.length > 0) active.push({ key: 'q', label: 'Search', value: state.q });
  if (state.mode !== DEFAULTS.mode) {
    active.push({ key: 'mode', label: 'Mode', value: state.mode });
  }

  return (
    <div className="space-y-3">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setState({ q: draft });
        }}
      >
        <input
          type="search"
          placeholder="Search recommendations…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-label="Search recommendations"
        />
        <Button type="submit" size="sm">
          Search
        </Button>
        <Button
          type="button"
          variant={state.mode === 'hybrid' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setState({ mode: state.mode === 'hybrid' ? 'keyword' : 'hybrid' })}
          aria-label={`Toggle search mode (current: ${state.mode})`}
        >
          {state.mode === 'hybrid' ? 'Hybrid' : 'Keyword'}
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
