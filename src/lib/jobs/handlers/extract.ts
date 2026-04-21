import type { JobContext } from '../context';
import type { QueuePayloads } from '../types';

// Stub. Task 9 implements the real extract pipeline (LLM structured output
// over parsed blocks -> persist recommendations).
export async function extractHandler(
  _ctx: JobContext,
  _payload: QueuePayloads['source.extract'],
): Promise<void> {
  throw new Error('source.extract handler not implemented — Task 9');
}
