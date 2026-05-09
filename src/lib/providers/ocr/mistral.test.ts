import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMistralOcr } from './mistral';
import { loadEnv } from '../../env';

const API_KEY = 'test-key-123';
const BASE_URL = 'https://mistral.test';
const FAKE_PDF = Buffer.from('%PDF-1.4 fake');

type FetchCall = { url: string; init: RequestInit };

function stubFetchSequence(responses: Response[]): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  let idx = 0;
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    calls.push({ url, init });
    const response = responses[idx++];
    if (!response) {
      throw new Error(`unexpected fetch call #${idx} to ${url}`);
    }
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

describe('mistral OCR provider', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uploads the PDF then OCRs by file_id, returning concatenated markdown', async () => {
    const { calls } = stubFetchSequence([
      jsonResponse({ id: 'file_abc', purpose: 'ocr', filename: 'r.pdf' }),
      jsonResponse({
        pages: [
          { index: 0, markdown: 'Page 1 content' },
          { index: 1, markdown: 'Page 2 content' },
        ],
      }),
    ]);
    const ocr = createMistralOcr({ apiKey: API_KEY, baseUrl: BASE_URL });

    const out = await ocr.parseDocument({ filename: 'r.pdf', bytes: FAKE_PDF });

    // Two endpoints hit in order.
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe(`${BASE_URL}/v1/files`);
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.body).toBeInstanceOf(FormData);
    const form = calls[0]!.init.body as FormData;
    expect(form.get('purpose')).toBe('ocr');
    expect(form.get('file')).toBeInstanceOf(Blob);

    expect(calls[1]!.url).toBe(`${BASE_URL}/v1/ocr`);
    expect(calls[1]!.init.method).toBe('POST');
    const ocrBody = JSON.parse(calls[1]!.init.body as string);
    expect(ocrBody).toEqual({
      model: 'mistral-ocr-latest',
      document: { type: 'file', file_id: 'file_abc' },
    });

    // Authorization on both calls.
    const authHeader0 = new Headers(calls[0]!.init.headers as HeadersInit).get('authorization');
    const authHeader1 = new Headers(calls[1]!.init.headers as HeadersInit).get('authorization');
    expect(authHeader0).toBe(`Bearer ${API_KEY}`);
    expect(authHeader1).toBe(`Bearer ${API_KEY}`);

    // Canonical markdown = pages joined by separator; pages 1-based.
    expect(out.markdown).toBe('Page 1 content\n\n---\n\nPage 2 content');
    expect(out.pages).toHaveLength(2);
    expect(out.pages[0]).toEqual({
      pageNumber: 1,
      markdown: 'Page 1 content',
      imageRefs: [],
    });
    expect(out.pages[1]).toEqual({
      pageNumber: 2,
      markdown: 'Page 2 content',
      imageRefs: [],
    });
    expect(out.metadata).toEqual({
      filename: 'r.pdf',
      model: 'mistral-ocr-latest',
      mistralFileId: 'file_abc',
    });
  });

  it('extracts image refs from each page markdown', async () => {
    stubFetchSequence([
      jsonResponse({ id: 'file_xyz' }),
      jsonResponse({
        pages: [
          { index: 0, markdown: 'see ![fig1](images/fig1.png) and ![](images/fig2.png)' },
        ],
      }),
    ]);
    const ocr = createMistralOcr({ apiKey: API_KEY, baseUrl: BASE_URL });

    const out = await ocr.parseDocument({ filename: 'r.pdf', bytes: FAKE_PDF });

    expect(out.pages[0]!.imageRefs).toEqual(['images/fig1.png', 'images/fig2.png']);
  });

  it('throws a clear error when /v1/files returns non-2xx', async () => {
    stubFetchSequence([
      new Response('quota exceeded', { status: 429, statusText: 'Too Many Requests' }),
    ]);
    const ocr = createMistralOcr({ apiKey: API_KEY, baseUrl: BASE_URL });

    await expect(ocr.parseDocument({ filename: 'r.pdf', bytes: FAKE_PDF })).rejects.toThrow(
      /Mistral file upload failed: HTTP 429/,
    );
  });

  it('throws a clear error referencing the file_id when /v1/ocr fails', async () => {
    stubFetchSequence([
      jsonResponse({ id: 'file_abc' }),
      new Response('bad input', { status: 400, statusText: 'Bad Request' }),
    ]);
    const ocr = createMistralOcr({ apiKey: API_KEY, baseUrl: BASE_URL });

    await expect(ocr.parseDocument({ filename: 'r.pdf', bytes: FAKE_PDF })).rejects.toThrow(
      /Mistral OCR failed for file_id=file_abc: HTTP 400/,
    );
  });

  it('throws at construction when apiKey is missing', () => {
    expect(() => createMistralOcr({ apiKey: '', baseUrl: BASE_URL })).toThrow(/apiKey/);
  });

  it('defaults baseUrl to https://api.mistral.ai when omitted', async () => {
    const { calls } = stubFetchSequence([
      jsonResponse({ id: 'file_abc' }),
      jsonResponse({ pages: [{ index: 0, markdown: 'x' }] }),
    ]);
    const ocr = createMistralOcr({ apiKey: API_KEY });

    await ocr.parseDocument({ filename: 'r.pdf', bytes: FAKE_PDF });

    expect(calls[0]!.url).toBe('https://api.mistral.ai/v1/files');
    expect(calls[1]!.url).toBe('https://api.mistral.ai/v1/ocr');
  });

  it('respects MISTRAL_BASE_URL override and trims trailing slashes', async () => {
    const { calls } = stubFetchSequence([
      jsonResponse({ id: 'file_abc' }),
      jsonResponse({ pages: [{ index: 0, markdown: 'x' }] }),
    ]);
    const ocr = createMistralOcr({ apiKey: API_KEY, baseUrl: `${BASE_URL}/` });

    await ocr.parseDocument({ filename: 'r.pdf', bytes: FAKE_PDF });

    expect(calls[0]!.url).toBe(`${BASE_URL}/v1/files`);
    expect(calls[1]!.url).toBe(`${BASE_URL}/v1/ocr`);
  });

  it('exposes name=mistral', () => {
    const ocr = createMistralOcr({ apiKey: API_KEY });
    expect(ocr.name).toBe('mistral');
  });
});

describe('env + factory wiring for mistral OCR', () => {
  it('loadEnv throws when OCR_PROVIDER=mistral but MISTRAL_API_KEY is missing', () => {
    expect(() =>
      loadEnv({
        APP_MODE: 'local',
        DATABASE_URL: 'postgres://x/y',
        OCR_PROVIDER: 'mistral',
      }),
    ).toThrow(/MISTRAL_API_KEY/);
  });

  it('loadEnv accepts a fully-configured mistral OCR setup', () => {
    const env = loadEnv({
      APP_MODE: 'local',
      DATABASE_URL: 'postgres://x/y',
      OCR_PROVIDER: 'mistral',
      MISTRAL_API_KEY: 'k',
      MISTRAL_BASE_URL: 'https://api.mistral.ai',
    });
    expect(env.OCR_PROVIDER).toBe('mistral');
    expect(env.MISTRAL_API_KEY).toBe('k');
    expect(env.MISTRAL_BASE_URL).toBe('https://api.mistral.ai');
  });

  it('loadEnv accepts mistral setup without explicit MISTRAL_BASE_URL', () => {
    const env = loadEnv({
      APP_MODE: 'local',
      DATABASE_URL: 'postgres://x/y',
      OCR_PROVIDER: 'mistral',
      MISTRAL_API_KEY: 'k',
    });
    expect(env.OCR_PROVIDER).toBe('mistral');
    expect(env.MISTRAL_BASE_URL).toBeUndefined();
  });
});
