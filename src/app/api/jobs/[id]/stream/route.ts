import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import type { JobEvent } from '@/lib/jobs/context';
import { subscribeJobEvents } from '@/lib/jobs/events';

// Prevent Next from trying to statically analyze or cache this route — it's
// an infinite stream, not a page.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Heartbeat cadence: SSE clients behind proxies (nginx default 60s idle
// timeout) drop quiet streams. 25s leaves margin while staying cheap.
const HEARTBEAT_MS = 25_000;

const encoder = new TextEncoder();

/**
 * Server-Sent Events stream for a single job's progress. Terminates on a
 * terminal phase (`ready` / `failed`) or on client abort.
 *
 * why: pg_notify LISTEN requires a dedicated connection per subscriber, so
 * each SSE request opens its own `createDb` pool. That's acceptable for a
 * local-first app where concurrent subscribers are bounded by the UI.
 * Sharing a pool would collapse all subscribers onto one LISTEN stream and
 * multiplex payloads incorrectly.
 */
export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const env = loadEnv();
  const { sql } = createDb(env.DATABASE_URL);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const heartbeat: ReturnType<typeof setInterval> = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: keepalive\n\n`));
        } catch {
          // controller was closed between the `closed` check and enqueue
        }
      }, HEARTBEAT_MS);

      const close = async (unsub?: () => Promise<void>): Promise<void> => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try {
          await unsub?.();
        } catch {
          // best-effort unlisten; the connection teardown below will catch it
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
        await sql.end({ timeout: 5 }).catch(() => {});
      };

      let unsub: (() => Promise<void>) | undefined;
      try {
        unsub = await subscribeJobEvents(sql, id, (event: JobEvent) => {
          if (closed) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          if (event.type === 'phase' && (event.phase === 'ready' || event.phase === 'failed')) {
            void close(unsub);
          }
        });
      } catch (err) {
        controller.error(err);
        await sql.end({ timeout: 5 }).catch(() => {});
        return;
      }

      req.signal.addEventListener('abort', () => {
        void close(unsub);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
