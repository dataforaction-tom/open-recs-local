import { z } from 'zod';

/**
 * Payload for the source edit server action. Multi-axis tag arrays carry
 * slug strings (potentially including freshly coined slugs from the LLM
 * pipeline or human input); the server resolves them via the per-axis
 * `resolveOrCreate*` repo functions.
 *
 * Array fields are required (caller always sends an array, possibly empty)
 * rather than `.default([])` so the Zod input/output types stay aligned —
 * keeps react-hook-form's generics happy under Zod 4.
 */
export const EditSourceInput = z.object({
  sourceId: z.string().uuid(),
  title: z.string().min(1).max(500),
  summary: z.string().max(8000).nullable().optional(),
  authors: z.array(z.string().min(1).max(200)).max(50),
  publication_date: z.string().nullable().optional(),
  org_owner: z.string().max(500).nullable().optional(),
  original_url: z.string().max(2000).nullable().optional(),
  attachment_url: z.string().max(2000).nullable().optional(),
  datasets: z
    .array(
      z.object({
        description: z.string().min(1).max(500),
        url: z.string().url().max(2000),
      }),
    )
    .max(50),
  is_private: z.boolean().optional(),
  thematic_area_slugs: z.array(z.string()),
  source_type_slugs: z.array(z.string()),
  purpose_slugs: z.array(z.string()),
  role_relevance_slugs: z.array(z.string()),
  target_audience_type_slugs: z.array(z.string()),
});

export type EditSourceInputT = z.infer<typeof EditSourceInput>;
