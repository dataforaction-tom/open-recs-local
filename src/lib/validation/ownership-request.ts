import { z } from 'zod';

export const RequestAccessInput = z.object({
  sourceId: z.string().uuid(),
  note: z.string().trim().max(1000).optional(),
});
export type RequestAccessInputT = z.infer<typeof RequestAccessInput>;

export const ResolveRequestInput = z.object({
  id: z.string().uuid(),
});
export type ResolveRequestInputT = z.infer<typeof ResolveRequestInput>;
