import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import type { JobEvent } from './context';
import { emitJobEvent, MAX_EVENT_PAYLOAD_BYTES, subscribeJobEvents } from './events';

// `LISTEN` is connection-scoped, so we keep a dedicated subscriber client and
// a separate emitter client to mirror the production topology (worker emits,
// SSE route subscribes). Using two clients proves the pg_notify path actually
// crosses a connection boundary.
let pg: StartedPg;
let subscriberSql: Sql;
let emitterSql: Sql;

describe('job events (pg_notify)', () => {
  beforeAll(async () => {
    pg = await startPostgres();
    subscriberSql = postgres(pg.url, { max: 5, prepare: false });
    emitterSql = postgres(pg.url, { max: 5, prepare: false });
  }, 120_000);

  afterAll(async () => {
    await subscriberSql?.end({ timeout: 5 });
    await emitterSql?.end({ timeout: 5 });
    await pg?.container.stop();
  });

  it('delivers an emitted event to a subscriber within 2s', async () => {
    const jobId = 'job-under-test-1';
    let resolveFirst: (event: JobEvent) => void = () => {};
    const firstEvent = new Promise<JobEvent>((resolve) => {
      resolveFirst = resolve;
    });

    // Await subscribe before emitting — otherwise the NOTIFY can race ahead
    // of the LISTEN being registered on the server.
    const unsub = await subscribeJobEvents(subscriberSql, jobId, (event) => {
      resolveFirst(event);
    });
    await emitJobEvent(emitterSql, jobId, { type: 'phase', phase: 'parsing' });

    const event = await Promise.race([
      firstEvent,
      new Promise<JobEvent>((_, reject) =>
        setTimeout(() => reject(new Error('event not received within 2s')), 2000),
      ),
    ]);

    expect(event).toEqual({ type: 'phase', phase: 'parsing' });
    await unsub();
  });

  it('scopes events to the subscribed jobId (no cross-talk)', async () => {
    const mine = 'job-a';
    const other = 'job-b';
    const received: JobEvent[] = [];
    const unsub = await subscribeJobEvents(subscriberSql, mine, (event) => {
      received.push(event);
    });

    await emitJobEvent(emitterSql, other, { type: 'phase', phase: 'ready' });
    await emitJobEvent(emitterSql, mine, { type: 'progress', percent: 42 });

    // Give notifications a moment to arrive; porsager dispatches on the
    // socket read loop so this is effectively immediate on localhost.
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(received).toEqual([{ type: 'progress', percent: 42 }]);
    await unsub();
  });

  it('rejects payloads that exceed the pg_notify limit', async () => {
    const huge = 'x'.repeat(MAX_EVENT_PAYLOAD_BYTES + 1);
    await expect(
      emitJobEvent(emitterSql, 'job-big', { type: 'error', message: huge }),
    ).rejects.toThrow(/payload/i);
  });
});
