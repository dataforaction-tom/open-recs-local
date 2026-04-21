import type { OcrProvider, ParsedDocument, ParsedPage } from './types';

/**
 * Real OCR adapter backed by Mistral's hosted OCR API.
 *
 * The Mistral OCR endpoint does not accept raw PDF bytes in the OCR call —
 * the document must first be uploaded to the Files API, then referenced by
 * `file_id` in the OCR request. We therefore run a two-step flow per
 * `parseDocument` invocation:
 *
 *   1. `POST {baseUrl}/v1/files` (multipart) — upload the PDF; returns
 *      `{ id: 'file_...', purpose: 'ocr', ... }`.
 *   2. `POST {baseUrl}/v1/ocr` (JSON) — reference the uploaded file via
 *      `{ model: 'mistral-ocr-latest', document: { type: 'file', file_id } }`.
 *      Returns `{ pages: [{ index, markdown, images?, ... }, ...] }`.
 *
 * `baseUrl` is configurable so that tests (and any future self-hosted
 * Mistral deployment) can point elsewhere. Image blobs returned per page
 * are ignored for now; we only extract markdown image references so the
 * downstream source viewer can resolve them later (see Phase 5).
 */
export type MistralOcrConfig = {
  apiKey: string;
  /** Defaults to `https://api.mistral.ai` when omitted. */
  baseUrl?: string;
  /** Override for tests; production uses `mistral-ocr-latest`. */
  model?: string;
};

type MistralFileUploadResponse = {
  id?: string;
  purpose?: string;
  filename?: string;
};

type MistralOcrPage = {
  index?: number;
  page_number?: number;
  markdown?: string;
};

type MistralOcrResponse = {
  pages?: MistralOcrPage[];
  model?: string;
};

const DEFAULT_BASE_URL = 'https://api.mistral.ai';
const DEFAULT_MODEL = 'mistral-ocr-latest';
const IMAGE_RE = /!\[[^\]]*\]\(([^)]+)\)/g;

function extractImageRefs(markdown: string): string[] {
  const refs: string[] = [];
  // Fresh regex per-call: sharing a /g regex across calls leaks lastIndex state.
  const re = new RegExp(IMAGE_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    const ref = match[1];
    if (ref) refs.push(ref);
  }
  return refs;
}

export function createMistralOcr(config: MistralOcrConfig): OcrProvider {
  if (!config.apiKey) {
    throw new Error('Mistral OCR adapter requires an apiKey');
  }
  // Trim trailing slash so `${baseUrl}/v1/...` always yields a single slash.
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = config.model ?? DEFAULT_MODEL;
  const authHeader = `Bearer ${config.apiKey}`;

  return {
    name: 'mistral',
    async parseDocument({ filename, bytes }): Promise<ParsedDocument> {
      // --- Step 1: upload the PDF to the Files API ---------------------------
      const form = new FormData();
      // Copy into a fresh Uint8Array so the Blob constructor sees an
      // ArrayBuffer-backed view (Node's Buffer may sit on a SharedArrayBuffer,
      // which the DOM BlobPart type rejects under strict TS lib typings).
      const view = new Uint8Array(bytes.byteLength);
      view.set(bytes);
      form.append('purpose', 'ocr');
      form.append('file', new Blob([view], { type: 'application/pdf' }), filename);

      const uploadRes = await fetch(`${baseUrl}/v1/files`, {
        method: 'POST',
        headers: { Authorization: authHeader },
        body: form,
      });

      if (!uploadRes.ok) {
        const text = await uploadRes.text().catch(() => '');
        throw new Error(
          `Mistral file upload failed: HTTP ${uploadRes.status} ${uploadRes.statusText}${
            text ? ` — ${text}` : ''
          }`,
        );
      }

      const uploadPayload = (await uploadRes.json()) as MistralFileUploadResponse;
      const fileId = uploadPayload.id;
      if (!fileId) {
        throw new Error('Mistral file upload response missing `id` field');
      }

      // --- Step 2: OCR the uploaded file -------------------------------------
      const ocrRes = await fetch(`${baseUrl}/v1/ocr`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          document: { type: 'file', file_id: fileId },
        }),
      });

      if (!ocrRes.ok) {
        const text = await ocrRes.text().catch(() => '');
        throw new Error(
          `Mistral OCR failed for file_id=${fileId}: HTTP ${ocrRes.status} ${ocrRes.statusText}${
            text ? ` — ${text}` : ''
          }`,
        );
      }

      const payload = (await ocrRes.json()) as MistralOcrResponse;
      const rawPages = payload.pages ?? [];

      const pages: ParsedPage[] = rawPages.map((page, index) => {
        // Mistral uses 0-based `index`; our ParsedPage is 1-based.
        const pageNumber = (page.page_number ?? (page.index ?? index) + 1);
        const markdown = (page.markdown ?? '').trim();
        return {
          pageNumber,
          markdown,
          imageRefs: extractImageRefs(markdown),
        };
      });

      return {
        markdown: pages.map((page) => page.markdown).join('\n\n---\n\n'),
        pages,
        metadata: { filename, model, mistralFileId: fileId },
      };
    },
  };
}
