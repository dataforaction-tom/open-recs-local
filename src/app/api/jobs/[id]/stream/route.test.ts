import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobEvent } from '@/lib/jobs/context';

// Mock the side-effect modules so the route test is a pure stream-composition
// check: no real DB, no real env. The Testcontainers-backed event behaviour
// lives in `src/lib/jobs/events.test.ts`.
vi.mock('@/lib/env', () => ({
  loadEnv: () => ({ APP_MODE: 'local', DATABASE_URL: 'postgres://fake/fake' }),
}));

const sqlEnd = vi.fn(async () => {});
vi.mock('@/lib/db/client', () => ({
  createDb: () => ({ db: {}, sql: { end: sqlEnd } }),
}));

type EventHandler = (event: JobEvent) => void;
let capturedHandler: EventHandler | undefined;
const unlistenMock = vi.fn(async () => {});

vi.mock('@/lib/jobs/events', () => ({
  subscribeJobEvents: vi.fn(async (_sql: unknown, _jobId: string, onEvent: EventHandler) => {
    capturedHandler = onEvent;
    return unlistenMock;
  }),
}));

async function importRoute() {
  // Re-import after mocks are in place; vitest hoists vi.mock above imports,
  // but the route reads its deps at module-eval so we dynamic-import.
  return import('./route');
}

function readAll(reader: ReadableStreamDefaultReader<Uint8Array>, timeoutMs = 500): Promise<string> {
  const decoder = new TextDecoder();
  let acc = '';
  return new Promise((resolve) => {
    const deadline = setTimeout(() => resolve(acc), timeoutMs);
    const pump = async (): Promise<void> => {
      try {
        const { value, done } = await reader.read();
        if (done) {
          clearTimeout(deadline);
          resolve(acc);
          return;
        }
        if (value) acc += decoder.decode(value);
        void pump();
      } catch {
        clearTimeout(deadline);
        resolve(acc);
      }
    };
    void pump();
  });
}

describe('GET /api/jobs/[id]/stream', () => {
  beforeEach(() => {
    capturedHandler = undefined;
    unlistenMock.mockClear();
    sqlEnd.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats emitted events as SSE data frames', async () => {
    const { GET } = await importRoute();
    const controller = new AbortController();
    const req = new Request('http://localhost/api/jobs/abc/stream', { signal: controller.signal });
    const res = await GET(req, { params: Promise.resolve({ id: 'abc' }) });

    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(res.headers.get('cache-control')).toContain('no-cache');
    expect(capturedHandler).toBeDefined();

    // Push a progress event through the captured subscribe callback.
    capturedHandler?.({ type: 'progress', percent: 25, message: 'parsing' });

    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const chunk = new TextDecoder().decode(value);
    expect(chunk).toBe('data: {"type":"progress","percent":25,"message":"parsing"}\n\n');

    controller.abort();
    await reader.cancel().catch(() => {});
  });

  it('closes the stream and unsubscribes on terminal phase events', async () => {
    const { GET } = await importRoute();
    const controller = new AbortController();
    const req = new Request('http://localhost/api/jobs/abc/stream', { signal: controller.signal });
    const res = await GET(req, { params: Promise.resolve({ id: 'abc' }) });

    capturedHandler?.({ type: 'phase', phase: 'ready' });

    const body = await readAll(res.body!.getReader(), 500);
    expect(body).toContain('"phase":"ready"');
    expect(unlistenMock).toHaveBeenCalledTimes(1);
    expect(sqlEnd).toHaveBeenCalledTimes(1);
  });

  it('closes the stream on client abort', async () => {
    const { GET } = await importRoute();
    const controller = new AbortController();
    const req = new Request('http://localhost/api/jobs/abc/stream', { signal: controller.signal });
    const res = await GET(req, { params: Promise.resolve({ id: 'abc' }) });

    controller.abort();

    // Allow the abort handler's microtasks to run.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const body = await readAll(res.body!.getReader(), 200);
    expect(body).toBe('');
    expect(unlistenMock).toHaveBeenCalled();
    expect(sqlEnd).toHaveBeenCalled();
  });
});
