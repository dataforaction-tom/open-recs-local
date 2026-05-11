'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSearchParamsState } from '@/lib/hooks/use-search-params-state';

const DEFAULTS = { q: '', mode: 'hybrid' as 'hybrid' | 'keyword' };

export function SearchForm() {
  const [state, setState] = useSearchParamsState<typeof DEFAULTS>(DEFAULTS);
  const [draft, setDraft] = useState(state.q);

  // Re-sync the input when the URL's q changes from outside (back/forward
  // or shared link). Mirror the recommendations-index-controls pattern that
  // sidesteps the React Compiler's setState-in-effect ban.
  const [lastSyncedQ, setLastSyncedQ] = useState(state.q);
  if (state.q !== lastSyncedQ) {
    setLastSyncedQ(state.q);
    setDraft(state.q);
  }

  return (
    <form
      className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        setState({ q: draft });
      }}
    >
      <label className="space-y-1.5">
        <span className="text-sm text-muted-foreground">Search the corpus</span>
        <Input
          type="search"
          placeholder="e.g. governance · safeguarding · audit rotation"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Search recommendations"
        />
      </label>
      <Button type="submit" size="default">
        Search
      </Button>
      <Button
        type="button"
        variant={state.mode === 'hybrid' ? 'secondary' : 'outline'}
        size="default"
        onClick={() => setState({ mode: state.mode === 'hybrid' ? 'keyword' : 'hybrid' })}
        aria-label={`Toggle search mode (current: ${state.mode})`}
      >
        {state.mode === 'hybrid' ? 'Hybrid' : 'Keyword'}
      </Button>
    </form>
  );
}
