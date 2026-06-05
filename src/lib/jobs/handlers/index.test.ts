import { describe, expect, it, vi } from 'vitest';
import { registerHandlers } from './index';
import type { Providers } from '../../providers';

// Minimal fake queue that records registered handlers so we can invoke them.
function fakeQueue() {
  const handlers = new Map<string, (payload: unknown) => Promise<unknown>>();
  return {
    handlers,
    register: vi.fn(async (name: string, fn: (payload: unknown) => Promise<unknown>) => {
      handlers.set(name, fn);
    }),
    schedule: vi.fn(async () => {}),
  };
}

describe('registerHandlers — per-job provider resolution', () => {
  it('resolves providers via the injected resolver for each job', async () => {
    const queue = fakeQueue();
    const fakeProviders = { embedding: { name: 'stub' } } as unknown as Providers;
    const resolveProviders = vi.fn(async () => fakeProviders);

    await registerHandlers({
      queue: queue as never,
      db: {} as never,
      env: {} as never,
      emit: async () => {},
      resolveProviders,
    });

    // Invoking a registered job triggers a fresh provider resolution.
    const embed = queue.handlers.get('source.embed')!;
    await embed({ sourceId: 'x' }).catch(() => {}); // handler body may no-op on stub
    expect(resolveProviders).toHaveBeenCalled();
  });
});
