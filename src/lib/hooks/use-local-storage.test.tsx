import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLocalStorage } from './use-local-storage';

afterEach(() => {
  window.localStorage.clear();
});

describe('useLocalStorage', () => {
  it('returns the default value when nothing is stored', () => {
    const { result } = renderHook(() => useLocalStorage('key1', 'init'));
    expect(result.current[0]).toBe('init');
  });

  it('returns the stored value when something is already in localStorage', () => {
    window.localStorage.setItem('key2', JSON.stringify('persisted'));
    const { result } = renderHook(() => useLocalStorage('key2', 'init'));
    expect(result.current[0]).toBe('persisted');
  });

  it('writes back through the setter and persists', () => {
    const { result } = renderHook(() => useLocalStorage('key3', 0));
    act(() => result.current[1](42));
    expect(result.current[0]).toBe(42);
    expect(window.localStorage.getItem('key3')).toBe(JSON.stringify(42));
  });
});
