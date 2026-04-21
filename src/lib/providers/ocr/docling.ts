import type { OcrProvider, ParsedDocument, ParsedPage } from './types';

/**
 * Real OCR adapter backed by a self-hosted Docling-serve container.
 *
 * Endpoint: `POST {baseUrl}/v1alpha/convert/file` — multipart form upload with
 * the PDF bytes in the `files` field. The response shape varies slightly
 * between Docling-serve versions; see
 * https://github.com/docling-project/docling-serve for the authoritative
 * schema. This adapter handles the two shapes we've observed:
 *
 *   1. `{ status: 'success', document: { md_content, pages: [...] } }` — the
 *      preferred shape; per-page markdown is taken directly from `pages`.
 *   2. `{ status: 'success', document: { md_content } }` — older/minimal
 *      responses with no per-page segmentation. We fall back to splitting
 *      the concatenated markdown on `\n---\n`, matching the fake adapter's
 *      convention so downstream chunking stays identical.
 *
 * Image references are kept as markdown `![alt](path)` links; the adapter
 * only extracts the paths into `imageRefs` for each page. Actual image
 * resolution is a later concern (Phase 5 source viewer).
 */
export type DoclingOcrConfig = {
  /** Base URL of the Docling-serve instance, e.g. `http://docling:5001`. */
  baseUrl: string;
};

type DoclingPage = {
  page_no?: number;
  page_number?: number;
  markdown?: string;
  md_content?: string;
};

type DoclingDocument = {
  md_content?: string;
  markdown?: string;
  pages?: DoclingPage[];
  metadata?: Record<string, unknown>;
};

type DoclingResponse = {
  status?: string;
  message?: string;
  document?: DoclingDocument;
};

const IMAGE_RE = /!\[[^\]]*\]\(([^)]+)\)/g;

function extractImageRefs(markdown: string): string[] {
  const refs: string[] = [];
  // Use a fresh regex each call — sharing state across calls via the /g
  // flag is a classic footgun when reusing a module-level regex.
  const re = new RegExp(IMAGE_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    const ref = match[1];
    if (ref) refs.push(ref);
  }
  return refs;
}

function splitMarkdownIntoPages(markdown: string): ParsedPage[] {
  const chunks = markdown.split(/\r?\n---\r?\n/);
  return chunks.map((chunk, index) => {
    const trimmed = chunk.trim();
    return {
      pageNumber: index + 1,
      markdown: trimmed,
      imageRefs: extractImageRefs(trimmed),
    };
  });
}

function pagesFromResponse(pages: DoclingPage[]): ParsedPage[] {
  return pages.map((page, index) => {
    const pageNumber = page.page_no ?? page.page_number ?? index + 1;
    const markdown = (page.markdown ?? page.md_content ?? '').trim();
    return {
      pageNumber,
      markdown,
      imageRefs: extractImageRefs(markdown),
    };
  });
}

export function createDoclingOcr(config: DoclingOcrConfig): OcrProvider {
  // Trim trailing slash so `${baseUrl}/v1alpha/...` always yields a single slash.
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  return {
    name: 'docling',
    async parseDocument({ filename, bytes }): Promise<ParsedDocument> {
      const form = new FormData();
      // Docling-serve expects the field name `files` (plural). See upstream README.
      // Copy into a fresh Uint8Array so the Blob constructor sees an
      // ArrayBuffer-backed view (Node's Buffer may sit on a SharedArrayBuffer,
      // which the DOM BlobPart type rejects under strict TS lib typings).
      const view = new Uint8Array(bytes.byteLength);
      view.set(bytes);
      form.append('files', new Blob([view], { type: 'application/pdf' }), filename);

      const res = await fetch(`${baseUrl}/v1alpha/convert/file`, {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(
          `Docling OCR failed: HTTP ${res.status} ${res.statusText}${text ? ` — ${text}` : ''}`,
        );
      }

      const payload = (await res.json()) as DoclingResponse;

      if (payload.status && payload.status !== 'success') {
        throw new Error(
          `Docling OCR returned status=${payload.status}${payload.message ? `: ${payload.message}` : ''}`,
        );
      }

      const document = payload.document;
      if (!document) {
        throw new Error('Docling OCR response missing `document` field');
      }

      const markdown = (document.md_content ?? document.markdown ?? '').trim();
      const pages =
        document.pages && document.pages.length > 0
          ? pagesFromResponse(document.pages)
          : splitMarkdownIntoPages(markdown);

      return {
        markdown: pages.map((page) => page.markdown).join('\n\n---\n\n'),
        pages,
        metadata: { filename, ...(document.metadata ?? {}) },
      };
    },
  };
}
