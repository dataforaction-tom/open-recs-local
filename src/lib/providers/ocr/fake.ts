import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { OcrProvider, ParsedDocument, ParsedPage } from './types';

export type FakeOcrConfig = {
  /** Directory holding fixture `.md` files. Defaults to `<cwd>/fixtures/ocr`. */
  fixturesDir?: string;
};

export function createFakeOcr(config: FakeOcrConfig = {}): OcrProvider {
  const fixturesDir = config.fixturesDir ?? path.resolve(process.cwd(), 'fixtures/ocr');
  return {
    name: 'fake',
    async parseDocument({ filename, bytes: _bytes }): Promise<ParsedDocument> {
      const stem = filename.replace(/\.[^.]+$/, '');
      const fixturePath = path.join(fixturesDir, `${stem}.md`);
      let markdown: string;
      try {
        markdown = await readFile(fixturePath, 'utf8');
      } catch {
        throw new Error(`fake OCR: no fixture found for "${filename}"`);
      }
      const chunks = markdown.split(/\r?\n---\r?\n/);
      const pages: ParsedPage[] = chunks.map((chunk, index) => ({
        pageNumber: index + 1,
        markdown: chunk.trim(),
        imageRefs: [],
      }));
      return {
        markdown: pages.map((page) => page.markdown).join('\n\n---\n\n'),
        pages,
        metadata: { filename },
      };
    },
  };
}
