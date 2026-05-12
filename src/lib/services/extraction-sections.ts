/**
 * Section-aware preprocessing for the `source.extract` Pass 2 LLM call.
 * Looks for recommendation-shaped headings (`# Recommendations`, `# Next
 * steps`, `# Conclusions [and recommendations]`, `# Actions`, `# We will`,
 * `# Summary`) and, when found, slices the markdown to just those sections.
 *
 * Each detected section runs from its heading to the start of either:
 *   (a) the next matched recommendation heading, OR
 *   (b) the next "non-recommendation" major heading (Background,
 *       Methodology, Introduction, Appendix, References, etc.), OR
 *   (c) end of document.
 *
 * Returns `mode: 'sections'` when at least one heading matched, else
 * `mode: 'full-document'` (caller uses the looser full-doc Pass 2 prompt).
 *
 * Pure function — no I/O, no Postgres. Unit-tested with synthetic markdown.
 */

const REC_HEADING_PATTERNS: readonly RegExp[] = [
  /^#\s+Recommendations(?:\s+and\s+next\s+steps)?\s*$/im,
  /^#\s+Next\s+steps\s*$/im,
  /^#\s+Conclusions?(?:\s+and\s+recommendations)?\s*$/im,
  /^#\s+Actions?\s*$/im,
  /^#\s+We\s+will\s*$/im,
  /^#\s+Summary\s*$/im,
];

// Headings that end a recommendation section when encountered after it.
const STOP_HEADING_PATTERN =
  /^#\s+(?:About|Introduction|Background|Method|Methodology|Appendix|Bibliography|References|Acknowledgements?|Acknowledgments|Contact|Overview)\s*$/im;

export type SectionDetectionResult = {
  processText: string;
  mode: 'sections' | 'full-document';
};

type Match = { start: number; index: number };

function findAllMatches(markdown: string, pattern: RegExp): Match[] {
  // The flags include `m` for line anchors. We re-create with `g+m+i` so we
  // can sweep the document with `exec`.
  const sweep = new RegExp(pattern.source, 'gim');
  const matches: Match[] = [];
  let m: RegExpExecArray | null;
  while ((m = sweep.exec(markdown)) !== null) {
    matches.push({ start: m.index, index: sweep.lastIndex });
  }
  return matches;
}

export function detectRecommendationSections(markdown: string): SectionDetectionResult {
  const recMatches: number[] = [];
  for (const pattern of REC_HEADING_PATTERNS) {
    for (const m of findAllMatches(markdown, pattern)) {
      recMatches.push(m.start);
    }
  }
  if (recMatches.length === 0) {
    return { processText: markdown, mode: 'full-document' };
  }
  recMatches.sort((a, b) => a - b);

  const stopMatches = findAllMatches(markdown, STOP_HEADING_PATTERN).map((m) => m.start);

  const slices: string[] = [];
  for (let i = 0; i < recMatches.length; i += 1) {
    const start = recMatches[i]!;
    const nextRec = recMatches[i + 1] ?? Infinity;
    const nextStop = stopMatches.find((p) => p > start) ?? Infinity;
    const end = Math.min(nextRec, nextStop, markdown.length);
    slices.push(markdown.slice(start, end).trimEnd());
  }
  return { processText: slices.join('\n\n'), mode: 'sections' };
}
