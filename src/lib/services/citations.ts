export const CITATION_RE = /\[\[source:([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)#page:(\d+)\]\]/g;

export type Citation = {
  sourceSlug: string;
  pageNumber: number;
  raw: string;
};

export type ExtractCitationsOpts = {
  pageCounts?: Record<string, number>;
};

export function extractCitations(text: string, opts: ExtractCitationsOpts = {}): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];

  for (const match of text.matchAll(CITATION_RE)) {
    const [raw, slug, pageStr] = match;
    if (!raw || !slug || !pageStr) continue;

    const pageNumber = Number(pageStr);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) continue;

    if (opts.pageCounts) {
      const max = opts.pageCounts[slug];
      if (max === undefined || max < pageNumber) continue;
    }

    const key = `${slug}#${pageNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ sourceSlug: slug, pageNumber, raw });
  }

  return out;
}

export type ValidateCitationsResult = {
  valid: Citation[];
  invalid: string[];
};

export function validateCitations(
  text: string,
  pageCounts: Record<string, number>,
): ValidateCitationsResult {
  const valid: Citation[] = [];
  const invalid: string[] = [];
  const seenValid = new Set<string>();

  for (const match of text.matchAll(CITATION_RE)) {
    const [raw, slug, pageStr] = match;
    if (!raw || !slug || !pageStr) continue;

    const pageNumber = Number(pageStr);
    const max = pageCounts[slug];
    const ok =
      Number.isInteger(pageNumber) &&
      pageNumber >= 1 &&
      max !== undefined &&
      pageNumber <= max;

    if (!ok) {
      invalid.push(raw);
      continue;
    }

    const key = `${slug}#${pageNumber}`;
    if (seenValid.has(key)) continue;
    seenValid.add(key);
    valid.push({ sourceSlug: slug, pageNumber, raw });
  }

  return { valid, invalid };
}
