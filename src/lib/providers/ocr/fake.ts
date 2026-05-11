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

function synthesizeFallback(filename: string): string {
  // Two-page synthetic doc so source_pages gets multiple rows. Each page
  // ends with a clear recommendation sentence so the extraction LLM has
  // something concrete to pull out.
  return [
    `# ${filename}`,
    '',
    'This document was uploaded without a matching OCR fixture. The fake OCR provider is returning synthetic content so the pipeline can complete end-to-end during development. Switch to the Docling or Mistral OCR providers to extract real content from PDFs.',
    '',
    '## Section 1',
    '',
    'Organisations should establish a clear governance framework that defines roles, responsibilities, and escalation paths. The framework should be reviewed annually and signed off by the senior leadership team.',
    '',
    '---',
    '',
    '## Section 2',
    '',
    'Recommendation: implement a quarterly progress review process where each thematic area presents updates against agreed indicators. The reviews should produce a written summary shared with stakeholders within ten working days.',
    '',
  ].join('\n');
}

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
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          // Fallback for ad-hoc dev uploads: the test fixtures cover the
          // two seeded PDFs but we don't want a click-through to fail
          // when someone drops an arbitrary file in. Emit a synthetic
          // two-page document with a recommendation paragraph so the
          // downstream LLM extraction has something to work on.
          markdown = synthesizeFallback(filename);
        } else {
          throw err; // permission/IO errors should surface with their original message
        }
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
