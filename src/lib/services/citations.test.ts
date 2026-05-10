import { describe, expect, it } from 'vitest';
import { CITATION_RE, extractCitations, validateCitations } from './citations';

describe('extractCitations', () => {
  it('parses a single well-formed marker', () => {
    const text = 'See here [[source:annual-report-2024#page:7]] for context.';
    expect(extractCitations(text)).toEqual([
      {
        sourceSlug: 'annual-report-2024',
        pageNumber: 7,
        raw: '[[source:annual-report-2024#page:7]]',
      },
    ]);
  });

  it('parses multiple markers in order and deduplicates exact repeats', () => {
    const text = '[[source:a#page:1]] foo [[source:b#page:2]] bar [[source:a#page:1]]';
    const cites = extractCitations(text);
    expect(cites.map((c) => `${c.sourceSlug}#${c.pageNumber}`)).toEqual(['a#1', 'b#2']);
  });

  it('ignores malformed markers', () => {
    const inputs = [
      '[[source:#page:1]]',
      '[[source:a#page:0]]',
      '[[source:a#page:abc]]',
      '[[source:A#page:1]]',
      '[source:a#page:1]',
      '[[source:-a#page:1]]',
      '[[source:a-#page:1]]',
    ];
    for (const t of inputs) expect(extractCitations(t)).toEqual([]);
  });

  it('filters out-of-range pages when given a pageCounts map', () => {
    const text = 'cite [[source:s1#page:99]] then [[source:s1#page:2]]';
    const result = extractCitations(text, { pageCounts: { s1: 10 } });
    expect(result).toEqual([
      { sourceSlug: 's1', pageNumber: 2, raw: '[[source:s1#page:2]]' },
    ]);
  });

  it('CITATION_RE has the global flag for matchAll', () => {
    expect(CITATION_RE.flags).toContain('g');
  });
});

describe('validateCitations', () => {
  it('partitions valid + invalid markers against a known sources map', () => {
    const text = '[[source:known#page:1]] [[source:unknown#page:2]] [[source:known#page:5]]';
    const result = validateCitations(text, { known: 3 });
    expect(result.valid.map((c) => `${c.sourceSlug}#${c.pageNumber}`)).toEqual([
      'known#1',
    ]);
    expect(result.invalid).toEqual([
      '[[source:unknown#page:2]]',
      '[[source:known#page:5]]',
    ]);
  });
});
