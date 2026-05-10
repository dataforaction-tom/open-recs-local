'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Two-way binding between a typed state object and `?key=value` URL params.
 * Defaults stay out of the URL — calling setState with a key set to its
 * default value strips that key. Partial updates preserve unmentioned keys.
 */
export function useSearchParamsState<T extends Record<string, string>>(
  defaults: T,
): [T, (partial: Partial<T>) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo<T>(() => {
    const out = { ...defaults };
    for (const key of Object.keys(defaults) as Array<keyof T>) {
      const fromUrl = searchParams.get(String(key));
      if (fromUrl !== null && fromUrl.length > 0) {
        out[key] = fromUrl as T[keyof T];
      }
    }
    return out;
  }, [defaults, searchParams]);

  const setState = useCallback(
    (partial: Partial<T>) => {
      const next: Record<string, string> = {};
      for (const key of Object.keys(defaults) as Array<keyof T>) {
        const merged = (partial[key] ?? state[key]) as string;
        if (merged !== defaults[key] && merged.length > 0) {
          next[String(key)] = merged;
        }
      }
      const params = new URLSearchParams(next);
      const search = params.toString();
      router.push(search.length > 0 ? `${pathname}?${search}` : pathname);
    },
    [defaults, pathname, router, state],
  );

  return [state, setState];
}
