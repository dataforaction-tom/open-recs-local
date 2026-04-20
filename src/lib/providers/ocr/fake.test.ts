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
});
