import { describe, expect, it } from 'vitest';
import { tokeniseCitations } from './citations';

describe('tokeniseCitations', () => {
  it('returns a single text token for plain prose', () => {
    expect(tokeniseCitations('Hello there.')).toEqual([
      { type: 'text', text: 'Hello there.' },
    ]);
  });

  it('extracts a single citation surrounded by text', () => {
    const tokens = tokeniseCitations(
      'Boards should rotate auditors [[source:report-a#page:12]] every five years.',
    );
    expect(tokens).toEqual([
      { type: 'text', text: 'Boards should rotate auditors ' },
      {
        type: 'citation',
        slug: 'report-a',
        page: 12,
        raw: '[[source:report-a#page:12]]',
      },
      { type: 'text', text: ' every five years.' },
    ]);
  });

  it('extracts back-to-back citations without losing surrounding text', () => {
    const tokens = tokeniseCitations(
      'See [[source:a#page:1]][[source:b#page:2]] for context.',
    );
    expect(tokens.map((t) => t.type)).toEqual([
      'text',
      'citation',
      'citation',
      'text',
    ]);
    expect(tokens[1]).toMatchObject({ slug: 'a', page: 1 });
    expect(tokens[2]).toMatchObject({ slug: 'b', page: 2 });
  });

  it('returns an empty list for empty input', () => {
    expect(tokeniseCitations('')).toEqual([]);
  });

  it('is safe to call repeatedly (regex lastIndex reset)', () => {
    const text = 'Plain [[source:s#page:3]] text.';
    expect(tokeniseCitations(text)).toEqual(tokeniseCitations(text));
  });
});
