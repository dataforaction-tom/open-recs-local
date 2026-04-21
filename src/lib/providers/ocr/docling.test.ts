import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDoclingOcr } from './docling';
import { loadEnv } from '../../env';

const BASE_URL = 'http://docling.test:5001';
const FAKE_PDF = Buffer.from('%PDF-1.4 fake');

type FetchCall = { url: string; init: RequestInit };

function stubFetch(response: Response): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push({ url, init });
    return response;
  });
  vi.stubGlobal('fetch', fetchStub);
  return { calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('docling OCR provider', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('POSTs to /v1alpha/convert/file with multipart body containing the PDF', async () => {
    const { calls } = stubFetch(
      jsonResponse({
        status: 'success',
        document: { md_content: 'hello', pages: [{ page_no: 1, markdown: 'hello' }] },
      }),
    );
    const ocr = createDoclingOcr({ baseUrl: BASE_URL });

    await ocr.parseDocument({ filename: 'report.pdf', bytes: FAKE_PDF });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe(`${BASE_URL}/v1alpha/convert/file`);
    expect(call.init.method).toBe('POST');
    expect(call.init.body).toBeInstanceOf(FormData);
    const form = call.init.body as FormData;
    const fileEntry = form.get('files');
    expect(fileEntry).toBeInstanceOf(Blob);
  });

  it('maps pages array directly when Docling returns per-page markdown', async () => {
    stubFetch(
      jsonResponse({
        status: 'success',
        document: {
          md_content: 'page one\n\n---\n\npage two',
          pages: [
            { page_no: 1, markdown: 'page one' },
            { page_no: 2, markdown: 'page two' },
          ],
          metadata: { title: 'Report' },
        },
      }),
    );
    const ocr = createDoclingOcr({ baseUrl: BASE_URL });

    const out = await ocr.parseDocument({ filename: 'r.pdf', bytes: FAKE_PDF });

    expect(out.pages).toHaveLength(2);
    expect(out.pages[0]).toEqual({ pageNumber: 1, markdown: 'page one', imageRefs: [] });
    expect(out.pages[1]).toEqual({ pageNumber: 2, markdown: 'page two', imageRefs: [] });
    expect(out.markdown).toBe('page one\n\n---\n\npage two');
    expect(out.metadata).toMatchObject({ filename: 'r.pdf', title: 'Report' });
  });

  it('falls back to splitting on \\n---\\n when pages array is absent', async () => {
    stubFetch(
      jsonResponse({
        status: 'success',
        document: { md_content: 'alpha\n---\nbeta\n---\ngamma' },
      }),
    );
    const ocr = createDoclingOcr({ baseUrl: BASE_URL });

    const out = await ocr.parseDocument({ filename: 'r.pdf', bytes: FAKE_PDF });

    expect(out.pages).toHaveLength(3);
    expect(out.pages.map((p) => p.markdown)).toEqual(['alpha', 'beta', 'gamma']);
    expect(out.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
  });

  it('extracts image refs from page markdown', async () => {
    stubFetch(
      jsonResponse({
        status: 'success',
        document: {
          md_content: 'see ![fig1](images/fig1.png) and ![](images/fig2.png)',
          pages: [
            {
              page_no: 1,
              markdown: 'see ![fig1](images/fig1.png) and ![](images/fig2.png)',
            },
          ],
        },
      }),
    );
    const ocr = createDoclingOcr({ baseUrl: BASE_URL });

    const out = await ocr.parseDocument({ filename: 'r.pdf', bytes: FAKE_PDF });

    expect(out.pages[0]!.imageRefs).toEqual(['images/fig1.png', 'images/fig2.png']);
  });

  it('throws with status code when the server returns non-2xx', async () => {
    stubFetch(new Response('boom', { status: 502, statusText: 'Bad Gateway' }));
    const ocr = createDoclingOcr({ baseUrl: BASE_URL });

    await expect(ocr.parseDocument({ filename: 'r.pdf', bytes: FAKE_PDF })).rejects.toThrow(
      /HTTP 502/,
    );
  });

  it('throws with descriptive error when status != "success"', async () => {
    stubFetch(
      jsonResponse({ status: 'failed', message: 'unsupported format' }),
    );
    const ocr = createDoclingOcr({ baseUrl: BASE_URL });

    await expect(ocr.parseDocument({ filename: 'r.pdf', bytes: FAKE_PDF })).rejects.toThrow(
      /status=failed.*unsupported format/,
    );
  });

  it('trims trailing slashes on baseUrl', async () => {
    const { calls } = stubFetch(
      jsonResponse({ status: 'success', document: { md_content: 'x' } }),
    );
    const ocr = createDoclingOcr({ baseUrl: `${BASE_URL}/` });

    await ocr.parseDocument({ filename: 'r.pdf', bytes: FAKE_PDF });
    expect(calls[0]!.url).toBe(`${BASE_URL}/v1alpha/convert/file`);
  });

  it('exposes name=docling', () => {
    const ocr = createDoclingOcr({ baseUrl: BASE_URL });
    expect(ocr.name).toBe('docling');
  });
});

describe('env + factory wiring for docling OCR', () => {
  it('loadEnv throws when OCR_PROVIDER=docling but DOCLING_BASE_URL is missing', () => {
    expect(() =>
      loadEnv({
        APP_MODE: 'local',
        DATABASE_URL: 'postgres://x/y',
        OCR_PROVIDER: 'docling',
      }),
    ).toThrow(/DOCLING_BASE_URL/);
  });

  it('loadEnv accepts a fully-configured docling OCR setup', () => {
    const env = loadEnv({
      APP_MODE: 'local',
      DATABASE_URL: 'postgres://x/y',
      OCR_PROVIDER: 'docling',
      DOCLING_BASE_URL: 'http://docling:5001',
    });
    expect(env.OCR_PROVIDER).toBe('docling');
    expect(env.DOCLING_BASE_URL).toBe('http://docling:5001');
  });
});
