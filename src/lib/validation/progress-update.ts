import { z } from 'zod';
import { REC_STATUS } from '../db/schema';

/**
 * Shared between the client form (RHF + zodResolver) and the server action.
 * Single source of truth for the shape, so a field rename can't drift.
 *
 * `evidenceUrl` is intentionally NOT `.url()` — the field accepts either an
 * http URL or an internal storage path string per the v1 contract.
 */
export const ProgressUpdateInput = z.object({
  recommendationId: z.string().uuid(),
  progressNotes: z.string().trim().min(1, 'Add a brief progress note').max(4000),
  evidenceType: z.string().min(1).max(64).optional(),
  evidenceUrl: z.string().trim().max(2048).optional(),
  userProgressRating: z.string().min(1).max(64).optional(),
});
export type ProgressUpdateInputT = z.infer<typeof ProgressUpdateInput>;

export const StatusTransitionInput = z.object({
  recommendationId: z.string().uuid(),
  status: z.enum(REC_STATUS),
  note: z.string().trim().max(1000).optional(),
});
export type StatusTransitionInputT = z.infer<typeof StatusTransitionInput>;
