import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { OcrProvider, ParsedDocument, ParsedPage } from './types';

export type FakeOcrConfig = {
  /**
   * Directory holding fixture `<stem>.canonical.md` files.
   * Resolution order: explicit config → `FIXTURES_DIR` env → `<cwd>/fixtures/sources`.
   */
  fixturesDir?: string;
};

function resolveFixturesDir(config: FakeOcrConfig): string {
  if (config.fixturesDir) return config.fixturesDir;
  const fromEnv = process.env.FIXTURES_DIR;
  if (fromEnv && fromEnv.length > 0) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), 'fixtures/sources');
}

export function createFakeOcr(config: FakeOcrConfig = {}): OcrProvider {
  // Resolved lazily on each call so tests can mutate FIXTURES_DIR between runs.
  return {
    name: 'fake',
    async parseDocument({ filename, bytes: _bytes }): Promise<ParsedDocument> {
      const fixturesDir = resolveFixturesDir(config);
      const stem = filename.replace(/\.[^.]+$/, '');
      const fixturePath = path.join(fixturesDir, `${stem}.canonical.md`);
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
