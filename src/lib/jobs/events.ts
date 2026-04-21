import type { Sql } from 'postgres';
import type { JobEvent } from './context';

/**
 * pg_notify has a hard 8000-byte payload cap (NAMEDATALEN / message framing).
 * We leave ~500 bytes of headroom for the channel name and wire overhead.
 * `JobEvent` today is tiny, but an accidentally-large `error.message` could
 * blow past the limit silently — throw loudly instead.
 */
export const MAX_EVENT_PAYLOAD_BYTES = 7500;

/**
 * Emit a job event on the `job:<id>` channel. Any postgres client works;
 * callers typically reuse their app-level `sql`. The payload is JSON so the
 * subscriber side can decode it back into a typed `JobEvent`.
 */
export async function emitJobEvent(sql: Sql, jobId: string, event: JobEvent): Promise<void> {
  const channel = channelFor(jobId);
  const payload = JSON.stringify(event);
  if (Buffer.byteLength(payload, 'utf8') > MAX_EVENT_PAYLOAD_BYTES) {
    throw new Error(
      `JobEvent payload exceeds pg_notify limit (${MAX_EVENT_PAYLOAD_BYTES} bytes)`,
    );
  }
  await sql`select pg_notify(${channel}, ${payload})`;
}

/**
 * Subscribe to a job's events. Returns an unsubscribe function once the
 * server has accepted the LISTEN — awaiting the returned promise guarantees
 * that subsequent NOTIFYs on this channel will be delivered.
 *
 * porsager/postgres API (verified against node_modules/postgres/types):
 *   sql.listen(channel, onNotify, onListen?) => Promise<ListenMeta>
 *   ListenMeta = { state, unlisten(): Promise<void> }
 *
 * Malformed payloads are surfaced by throwing inside the callback; the
 * library logs them and keeps the subscription alive, which is the right
 * default for a lossy notification stream.
 */
export async function subscribeJobEvents(
  sql: Sql,
  jobId: string,
  onEvent: (event: JobEvent) => void,
): Promise<() => Promise<void>> {
  const channel = channelFor(jobId);
  const subscription = await sql.listen(channel, (payload) => {
    // Narrow to JobEvent at the boundary. Producers are trusted (our own
    // worker) so a simple JSON.parse is safe; if an external producer ever
    // injects garbage on the channel the subscriber crashes out loud.
    const event = JSON.parse(payload) as JobEvent;
    onEvent(event);
  });
  return () => subscription.unlisten();
}

function channelFor(jobId: string): string {
  return `job:${jobId}`;
}
