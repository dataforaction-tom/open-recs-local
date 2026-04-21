import type { JobContext } from '../context';
import type { QueuePayloads } from '../types';

// Stub. Task 8 implements the real parse pipeline (storage fetch -> OCR
// provider -> persist parsed blocks + emit phase/progress events).
export async function parseHandler(
  _ctx: JobContext,
  _payload: QueuePayloads['source.parse'],
): Promise<void> {
  throw new Error('source.parse handler not implemented — Task 8');
}
