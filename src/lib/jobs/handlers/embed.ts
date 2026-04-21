import type { JobContext } from '../context';
import type { QueuePayloads } from '../types';

// Stub. Task 10 implements the real embed pipeline (embedding provider over
// recommendation rows -> persist vectors, emit ready).
export async function embedHandler(
  _ctx: JobContext,
  _payload: QueuePayloads['source.embed'],
): Promise<void> {
  throw new Error('source.embed handler not implemented — Task 10');
}
