import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { createDb, type DbClient } from '@/lib/db/client';
import { createProviders } from '@/lib/providers';
import { loadEnv, type Env } from '@/lib/env';
import { createQueue, type Queue } from './queue';
import type { JobContext } from './context';
import { registerHandlers } from './handlers';

let pg: StartedPg;
let queue: Queue;
let dbContext: DbClient;
let ctx: JobContext;

describe('JobContext + registerHandlers', () => {
  beforeAll(async () => {
    pg = await startPostgres();
    queue = await createQueue({ connectionString: pg.url });
    dbContext = createDb(pg.url);
    // Force a deterministic env rather than relying on process.env. All
    // providers in this test are fakes — we never need to call them, we
    // just need a well-typed JobContext to assert registration works.
    const env: Env = loadEnv({
      APP_MODE: 'local',
      DATABASE_URL: pg.url,
      LLM_PROVIDER: 'fake',
      EMBEDDING_PROVIDER: 'fake',
      OCR_PROVIDER: 'fake',
      STORAGE_PROVIDER: 'fake',
    });
    ctx = {
      queue,
      db: dbContext.db,
      providers: createProviders(env),
      env,
      // Test-only no-op emit. The real implementation arrives in Task 6.
      emit: async () => {},
    };
    await registerHandlers(ctx);
  }, 120_000);

  afterAll(async () => {
    await queue?.stop();
    await dbContext?.sql.end({ timeout: 5 });
    await pg?.container.stop();
  });

  // `source.parse` (Task 8), `source.extract` (Task 9), and `source.embed`
  // (Task 10) are all real handlers covered by their own integration tests.
  // No stubs remain in the registration list, so this file now only asserts
  // the compile-time queue-name guard below.

  it('rejects unknown queue names at compile time', () => {
    // Point 4: this is a pure TS assertion — if the `QueueName` union ever
    // loses its teeth, the following line will start compiling and this
    // test will fail to typecheck. Runtime is a no-op.
    // @ts-expect-error — 'source.unknown' is not a QueueName
    const _typeCheck = (): Promise<string> => queue.enqueue('source.unknown', {});
    expect(typeof _typeCheck).toBe('function');
  });
});
