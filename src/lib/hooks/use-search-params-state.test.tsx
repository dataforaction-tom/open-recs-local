import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSearchParamsState } from './use-search-params-state';

const push = vi.fn();
let currentSearch = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(currentSearch),
  usePathname: () => '/recommendations',
}));

describe('useSearchParamsState', () => {
  it('returns the supplied defaults when no params are present', () => {
    push.mockClear();
    currentSearch = '';
    const { result } = renderHook(() =>
      useSearchParamsState({ q: '', mode: 'hybrid' as 'hybrid' | 'keyword' }),
    );
    expect(result.current[0]).toEqual({ q: '', mode: 'hybrid' });
  });

  it('reads non-default values from the URL', () => {
    currentSearch = 'q=auditor&mode=keyword';
    const { result } = renderHook(() =>
      useSearchParamsState({ q: '', mode: 'hybrid' as 'hybrid' | 'keyword' }),
    );
    expect(result.current[0]).toEqual({ q: 'auditor', mode: 'keyword' });
  });

  it('pushes a new URL on setState, omitting default values', () => {
    push.mockClear();
    currentSearch = '';
    const { result } = renderHook(() =>
      useSearchParamsState({ q: '', mode: 'hybrid' as 'hybrid' | 'keyword' }),
    );
    act(() => result.current[1]({ q: 'kingfisher' }));
    expect(push).toHaveBeenCalledWith('/recommendations?q=kingfisher');
  });

  it('clears a key when set back to its default value', () => {
    push.mockClear();
    currentSearch = 'q=auditor&mode=keyword';
    const { result } = renderHook(() =>
      useSearchParamsState({ q: '', mode: 'hybrid' as 'hybrid' | 'keyword' }),
    );
    act(() => result.current[1]({ q: '', mode: 'hybrid' }));
    expect(push).toHaveBeenCalledWith('/recommendations');
  });

  it('preserves keys not mentioned in the partial update', () => {
    push.mockClear();
    currentSearch = 'q=auditor&mode=keyword';
    const { result } = renderHook(() =>
      useSearchParamsState({ q: '', mode: 'hybrid' as 'hybrid' | 'keyword' }),
    );
    act(() => result.current[1]({ mode: 'hybrid' }));
    expect(push).toHaveBeenCalledWith('/recommendations?q=auditor');
  });
});
