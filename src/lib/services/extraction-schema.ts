import { z } from 'zod';

/**
 * Structured-output schema the LLM must satisfy for `source.extract`.
 *
 * Shape is deliberately wrapped under `recommendations` rather than a bare
 * array: real LLM structured-output APIs (OpenAI-compatible) require a
 * top-level JSON object, not a top-level array. The fake provider bridges
 * the Task 2 flat-array fixtures by wrapping them on load.
 */
export const ExtractionSchema = z.object({
  recommendations: z
    .array(
      z.object({
        title: z.string().min(5),
        full_text: z.string().min(20),
        thematic_area_slug: z.string().optional(),
        page_start: z.number().int().nullable().optional(),
        page_end: z.number().int().nullable().optional(),
      }),
    )
    .min(0),
});

export type ExtractionOutput = z.infer<typeof ExtractionSchema>;
export type RecommendationInput = ExtractionOutput['recommendations'][number];
