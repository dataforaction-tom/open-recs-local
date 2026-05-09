import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFakeOcr } from './fake';

describe('fake OCR provider', () => {
  it('parses the sample-report fixture into 2 pages', async () => {
    const ocr = createFakeOcr();
    const out = await ocr.parseDocument({ filename: 'sample-report.pdf', bytes: Buffer.from('') });
    expect(out.pages).toHaveLength(2);
    expect(out.pages[0]?.pageNumber).toBe(1);
    expect(out.pages[1]?.pageNumber).toBe(2);
    expect(out.pages[0]?.markdown).toContain('Page One');
    expect(out.pages[1]?.markdown).toContain('Page Two');
  });

  it('sets metadata.filename to the input filename', async () => {
    const ocr = createFakeOcr();
    const out = await ocr.parseDocument({ filename: 'sample-report.pdf', bytes: Buffer.from('') });
    expect(out.metadata.filename).toBe('sample-report.pdf');
  });

  it('throws with a clear error when no fixture matches', async () => {
    const ocr = createFakeOcr();
    await expect(
      ocr.parseDocument({ filename: 'whatever.pdf', bytes: Buffer.from('') }),
    ).rejects.toThrow('fake OCR: no fixture found for "whatever.pdf"');
  });

  it('reads from an explicit fixturesDir override', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'ocr-fixtures-'));
    await writeFile(path.join(tmp, 'custom.canonical.md'), 'alpha\n\n---\n\nbeta', 'utf8');
    const ocr = createFakeOcr({ fixturesDir: tmp });
    const out = await ocr.parseDocument({ filename: 'custom.pdf', bytes: Buffer.from('') });
    expect(out.pages).toHaveLength(2);
    expect(out.pages[0]?.markdown).toBe('alpha');
    expect(out.pages[1]?.markdown).toBe('beta');
  });

  it('honours FIXTURES_DIR env var when no explicit dir is provided', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'ocr-fixtures-env-'));
    await writeFile(path.join(tmp, 'envy.canonical.md'), 'from-env', 'utf8');
    const previous = process.env.FIXTURES_DIR;
    process.env.FIXTURES_DIR = tmp;
    try {
      const ocr = createFakeOcr();
      const out = await ocr.parseDocument({ filename: 'envy.pdf', bytes: Buffer.from('') });
      expect(out.pages[0]?.markdown).toBe('from-env');
    } finally {
      if (previous === undefined) delete process.env.FIXTURES_DIR;
      else process.env.FIXTURES_DIR = previous;
    }
  });
});
