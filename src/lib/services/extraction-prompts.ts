/**
 * System-prompt builders for the two-pass extraction pipeline. Every
 * builder interpolates the relevant taxonomy slug lists into the prompt
 * body so the LLM picks from the project's known vocabulary; the
 * "new slug" escape clause lets the LLM coin a fresh tag when none of the
 * listed slugs fit (the handler then auto-creates it with `unverified=true`).
 *
 * Pure string-building. No I/O. Unit-tested.
 */

export type TaxonomySlugLists = {
  thematic_area: readonly string[];
  source_type: readonly string[];
  purpose: readonly string[];
  role_relevance: readonly string[];
  target_audience_type: readonly string[];
  location_scope: readonly string[];
  priority_timescale: readonly string[];
};

function formatSlugList(slugs: readonly string[]): string {
  if (slugs.length === 0) return '(taxonomy is empty — omit this field)';
  return slugs.map((s) => `"${s}"`).join(', ');
}

const NEW_SLUG_RULE =
  'For each multi-select axis, return slugs from the list when they fit. ' +
  'If none truly fits and the document explicitly references a different concept, ' +
  'return a new slug — we will review it. Do not force a poor match. ' +
  'Use `null` (or an empty array for multi-select fields) when nothing applies.';

export function buildPass1Prompt(slugs: TaxonomySlugLists): string {
  return [
    'You are an assistant extracting source-level metadata from policy / report documents.',
    'Return a JSON object with the fields listed below. Do not return a bare array.',
    '',
    `Thematic areas: ${formatSlugList(slugs.thematic_area)}`,
    `Source types: ${formatSlugList(slugs.source_type)}`,
    `Purposes: ${formatSlugList(slugs.purpose)}`,
    `Role relevances: ${formatSlugList(slugs.role_relevance)}`,
    `Target audience types: ${formatSlugList(slugs.target_audience_type)}`,
    '',
    NEW_SLUG_RULE,
    '',
    'The exact JSON shape is:',
    '{',
    '  "summary": "2-3 sentence abstract of the document, or null",',
    '  "authors": ["author name", "..."],',
    '  "publication_date": "ISO date (YYYY-MM-DD) or null",',
    '  "org_owner": "publishing organisation name, or null",',
    '  "thematic_area_slugs": ["slug", "..."],',
    '  "source_type_slugs": ["slug", "..."],',
    '  "purpose_slugs": ["slug", "..."],',
    '  "role_relevance_slugs": ["slug", "..."],',
    '  "target_audience_type_slugs": ["slug", "..."]',
    '}',
  ].join('\n');
}

const PASS2_AXIS_BLOCK = (slugs: TaxonomySlugLists): string =>
  [
    `Thematic areas: ${formatSlugList(slugs.thematic_area)}`,
    `Purposes: ${formatSlugList(slugs.purpose)}`,
    `Target audience types: ${formatSlugList(slugs.target_audience_type)}`,
    `Location scopes: ${formatSlugList(slugs.location_scope)}`,
    `Priority timescales: ${formatSlugList(slugs.priority_timescale)}`,
  ].join('\n');

const PASS2_OUTPUT_SHAPE = [
  'The exact JSON shape is:',
  '{',
  '  "recommendations": [',
  '    {',
  '      "title": "Short title (5+ chars)",',
  '      "body": "Full recommendation text (20+ chars; include header + main explanation, stop at subsections)",',
  '      "thematic_area_slugs": ["slug", "..."],',
  '      "purpose_slugs": ["slug", "..."],',
  '      "target_audience_type_slugs": ["slug", "..."],',
  '      "location_scope_slugs": ["slug", "..."],',
  '      "priority_timescale_slug": "slug or null",',
  '      "target_organization": "specific org named in the rec, or null",',
  '      "notes": "context about which section / null",',
  '      "confidence": "high | medium | low",',
  '      "page_start": null,',
  '      "page_end": null',
  '    }',
  '  ]',
  '}',
].join('\n');

export function buildPass2StrictPrompt(slugs: TaxonomySlugLists): string {
  return [
    "You are a recommendation extraction assistant. The text below is from a document's dedicated recommendation sections.",
    'EXTRACT ONLY ACTIONABLE RECOMMENDATIONS that prescribe specific actions.',
    'DO NOT extract statements about what groups "need" or "want" — those are requirements, not recommendations.',
    '',
    'For each recommendation, extract:',
    '- title: short imperative title',
    '- body: COMPLETE text including header AND detailed explanation, stop at subsections',
    '- multi-axis tags from the slug lists below',
    '- priority_timescale_slug + target_organization + notes (if apparent)',
    '- confidence: "high" for clear action items, "medium" for somewhat vague, "low" for context-dependent',
    '- page_start / page_end if you can infer them; otherwise null',
    '',
    PASS2_AXIS_BLOCK(slugs),
    '',
    NEW_SLUG_RULE,
    '',
    'Skip needs assessments, requirements statements, background context. Extract only directives.',
    '',
    PASS2_OUTPUT_SHAPE,
  ].join('\n');
}

export function buildPass2LooserPrompt(slugs: TaxonomySlugLists): string {
  return [
    'You are a recommendation extraction assistant. The text below is a full document — recommendations are scattered throughout, often as section headers with explanations.',
    'EXTRACT RECOMMENDATIONS that are actionable, prescriptive, and concise.',
    '',
    'Look for:',
    '- ## section headers that are themselves actionable',
    '- Numbered lists (1., 2., 3.)',
    '- Imperative statements ("Develop...", "Create...", "Establish...", "Recommend...")',
    '',
    'For each: title + body (header + 1-2 explanatory paragraphs, stop at subsections), multi-axis tags from the slug lists, priority_timescale_slug, target_organization, notes, confidence (high/medium/low), and page anchors if inferable.',
    '',
    PASS2_AXIS_BLOCK(slugs),
    '',
    NEW_SLUG_RULE,
    '',
    'Skip background, descriptions, questions, and supporting rationale. Focus on prescriptive action items.',
    '',
    PASS2_OUTPUT_SHAPE,
  ].join('\n');
}
