/**
 * Citation marker the chat-search route asks the model to emit:
 * `[[source:<slug>#page:<n>]]` — slug is a URL-safe source slug,
 * page is a 1-indexed integer.
 */
const CITATION_RE = /\[\[source:([a-z0-9-]+)#page:(\d+)\]\]/gi;

export type CitationToken =
  | { type: 'text'; text: string }
  | { type: 'citation'; slug: string; page: number; raw: string };

/**
 * Splits an assistant message into text + citation tokens so the renderer
 * can wrap each citation in a link without losing the surrounding prose.
 * Stream-safe: callers can re-tokenise on every chunk update.
 */
export function tokeniseCitations(text: string): CitationToken[] {
  const tokens: CitationToken[] = [];
  let cursor = 0;
  // Reset lastIndex because the regex has the global flag.
  CITATION_RE.lastIndex = 0;
  for (const match of text.matchAll(CITATION_RE)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      tokens.push({ type: 'text', text: text.slice(cursor, start) });
    }
    const slug = match[1];
    const pageStr = match[2];
    if (slug && pageStr) {
      tokens.push({
        type: 'citation',
        slug,
        page: Number.parseInt(pageStr, 10),
        raw: match[0],
      });
    }
    cursor = start + match[0].length;
  }
  if (cursor < text.length) {
    tokens.push({ type: 'text', text: text.slice(cursor) });
  }
  return tokens;
}
