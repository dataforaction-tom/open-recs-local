import { z } from 'zod';

/**
 * Pass 1 output — source-level metadata extracted from the first ~10k chars
 * of canonical markdown.
 *
 * All multi-select axes are arrays of slug strings; the handler resolves
 * each slug to a taxonomy id via the per-axis `resolveOrCreate*` repo
 * functions, auto-creating unknown slugs with `unverified=true`.
 *
 * Wrapped in an object (not a bare set of fields) because real LLM
 * structured-output APIs require a top-level JSON object.
 */
export const SourceMetadataSchema = z.object({
  summary: z.string().nullable(),
  authors: z.array(z.string()).default([]),
  publication_date: z.string().nullable(),
  org_owner: z.string().nullable(),
  thematic_area_slugs: z.array(z.string()).default([]),
  source_type_slugs: z.array(z.string()).default([]),
  purpose_slugs: z.array(z.string()).default([]),
  role_relevance_slugs: z.array(z.string()).default([]),
  target_audience_type_slugs: z.array(z.string()).default([]),
});

export type SourceMetadataOutput = z.infer<typeof SourceMetadataSchema>;

/**
 * Pass 2 output — recommendations extracted from the document's
 * recommendation sections (or the full document when no sections are
 * detected). `body` is the field name on both LLM output and the
 * `recommendations.body` column — no rename mapping needed in the handler.
 *
 * `confidence` is required so the handler can persist it without nullable
 * checks. `priority_timescale_slug` is single-valued (one priority per rec);
 * all other axes are arrays.
 */
export const RecommendationsSchema = z.object({
  recommendations: z.array(
    z.object({
      title: z.string().min(5),
      body: z.string().min(20),
      thematic_area_slugs: z.array(z.string()).default([]),
      purpose_slugs: z.array(z.string()).default([]),
      target_audience_type_slugs: z.array(z.string()).default([]),
      location_scope_slugs: z.array(z.string()).default([]),
      priority_timescale_slug: z.string().nullable().optional(),
      target_organization: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
      confidence: z.enum(['high', 'medium', 'low']),
      page_start: z.number().int().nullable().optional(),
      page_end: z.number().int().nullable().optional(),
    }),
  ),
});

export type RecommendationsOutput = z.infer<typeof RecommendationsSchema>;
export type RecommendationInput = RecommendationsOutput['recommendations'][number];
