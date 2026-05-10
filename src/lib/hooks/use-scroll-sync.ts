import { useCallback, useEffect, useRef, useState } from 'react';

export type ScrollSide = 'pdf' | 'markdown';
export type Scroller = (page: number) => void;

export type UseScrollSyncInput = {
  initialPage?: number;
  /** Coalesce rapid setActivePage calls within this window. Default 120ms. */
  debounceMs?: number;
};

export type UseScrollSyncResult = {
  activePage: number;
  setActivePage: (page: number) => void;
  registerScroller: (side: ScrollSide, scroller: Scroller) => void;
  scrollTo: (side: ScrollSide, page: number) => void;
};

/**
 * Coordinates a single `activePage` value across the markdown and PDF panes.
 * setActivePage is debounced so a rapid IntersectionObserver flurry from one
 * pane doesn't ping-pong the other. The leaf components register their own
 * scrollers via registerScroller; the page that owns the cross-pane sync logic
 * calls scrollTo to imperatively move the side that didn't trigger the change.
 */
export function useScrollSync(input: UseScrollSyncInput = {}): UseScrollSyncResult {
  const { initialPage = 1, debounceMs = 120 } = input;
  const [activePage, setActivePageImmediate] = useState(initialPage);

  const pendingRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollersRef = useRef<Partial<Record<ScrollSide, Scroller>>>({});

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const setActivePage = useCallback(
    (page: number) => {
      pendingRef.current = page;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (pendingRef.current !== null) setActivePageImmediate(pendingRef.current);
        pendingRef.current = null;
        timerRef.current = null;
      }, debounceMs);
    },
    [debounceMs],
  );

  const registerScroller = useCallback((side: ScrollSide, scroller: Scroller) => {
    scrollersRef.current[side] = scroller;
  }, []);

  const scrollTo = useCallback((side: ScrollSide, page: number) => {
    const scroller = scrollersRef.current[side];
    if (scroller) scroller(page);
  }, []);

  return { activePage, setActivePage, registerScroller, scrollTo };
}
