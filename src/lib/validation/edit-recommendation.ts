import { z } from 'zod';

/**
 * Payload for the recommendation edit server action. Same shape conventions
 * as `EditSourceInput` — required arrays (no `.default([])`) so the input
 * and output types stay aligned for react-hook-form's generics.
 */
export const EditRecommendationInput = z.object({
  recommendationId: z.string().uuid(),
  title: z.string().min(5).max(500),
  body: z.string().min(20).max(20000),
  target_organization: z.string().max(500).nullable().optional(),
  priority_timescale_slug: z.string().nullable().optional(),
  confidence: z.enum(['high', 'medium', 'low']).nullable().optional(),
  notes: z.string().max(8000).nullable().optional(),
  page_start: z.number().int().nullable().optional(),
  thematic_area_slugs: z.array(z.string()),
  purpose_slugs: z.array(z.string()),
  target_audience_type_slugs: z.array(z.string()),
  location_scope_slugs: z.array(z.string()),
});

export type EditRecommendationInputT = z.infer<typeof EditRecommendationInput>;
