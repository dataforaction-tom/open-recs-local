import type { Queue } from '../queue';
import type { DbClient } from '@/lib/db/client';
import type { Providers } from '@/lib/providers';
import type { Env } from '@/lib/env';

export type HandlerDeps = {
  queue: Queue;
  db: DbClient['db'];
  providers: Providers;
  env: Env;
};

// TODO(Task 5): replace this no-op stub with JobContext wiring and real
// `source.parse` / `source.extract` / `source.embed` handler registration.
export async function registerHandlers(_deps: HandlerDeps): Promise<void> {
  // intentionally empty until Task 5
}
