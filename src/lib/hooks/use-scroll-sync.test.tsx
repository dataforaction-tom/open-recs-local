import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useScrollSync } from './use-scroll-sync';

afterEach(() => {
  vi.useRealTimers();
});

describe('useScrollSync', () => {
  it('debounces rapid setActivePage calls to the last value', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useScrollSync({ initialPage: 1, debounceMs: 100 }));

    act(() => {
      result.current.setActivePage(2);
      result.current.setActivePage(3);
      result.current.setActivePage(4);
    });

    // Before the debounce window, the value isn't applied yet.
    expect(result.current.activePage).toBe(1);
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(result.current.activePage).toBe(4);
  });

  it('applies a single setActivePage call after the debounce window', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useScrollSync({ initialPage: 1, debounceMs: 50 }));
    act(() => result.current.setActivePage(7));
    expect(result.current.activePage).toBe(1);
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(result.current.activePage).toBe(7);
  });

  it('exposes registerScroller / scrollTo for imperative scroll', () => {
    const { result } = renderHook(() => useScrollSync({ initialPage: 1 }));
    const scroller = vi.fn();
    act(() => result.current.registerScroller('pdf', scroller));
    act(() => result.current.scrollTo('pdf', 5));
    expect(scroller).toHaveBeenCalledWith(5);
  });

  it('scrollTo for an unregistered side is a no-op', () => {
    const { result } = renderHook(() => useScrollSync({ initialPage: 1 }));
    expect(() => act(() => result.current.scrollTo('markdown', 3))).not.toThrow();
  });

  it('initialPage seeds the active page', () => {
    const { result } = renderHook(() => useScrollSync({ initialPage: 4 }));
    expect(result.current.activePage).toBe(4);
  });
});
