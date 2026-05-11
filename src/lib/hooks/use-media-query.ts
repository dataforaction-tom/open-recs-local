'use client';

import { useState } from 'react';

/**
 * Subscribe to a `matchMedia` query. SSR-safe: returns `false` during the
 * server render and the first client render, then re-renders with the real
 * value once the listener attaches. The "info from previous renders" pattern
 * keeps this out of useEffect, which the React Compiler ESLint rule blocks.
 *
 * Example: `useMediaQuery('(min-width: 768px)')` mirrors Tailwind's `md:`.
 */
export function useMediaQuery(query: string): boolean {
  const [lastQuery, setLastQuery] = useState(query);
  const [matches, setMatches] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  // Re-evaluate when the caller swaps the query string at runtime.
  if (query !== lastQuery) {
    setLastQuery(query);
    setSubscribed(false);
  }

  if (!subscribed && typeof window !== 'undefined' && 'matchMedia' in window) {
    setSubscribed(true);
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    mql.addEventListener('change', (event) => setMatches(event.matches));
  }

  return matches;
}
