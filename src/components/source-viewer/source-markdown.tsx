'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { rewriteStorageImages } from './rewrite-storage-images';

export type SourcePage = {
  pageNumber: number;
  markdown: string;
  /** Map of storage key → signed URL for any image refs on this page. */
  imageUrls: Record<string, string>;
};

export type SourceMarkdownProps = {
  pages: SourcePage[];
};

export function SourceMarkdown({ pages }: SourceMarkdownProps) {
  // Collapse all per-page image maps into one — react-markdown plugins are
  // shared across the whole tree, so we hand the rehype rewriter every key.
  const urlsByKey = useMemo(() => {
    const merged: Record<string, string> = {};
    for (const page of pages) Object.assign(merged, page.imageUrls);
    return merged;
  }, [pages]);

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      {pages.map((page) => (
        <section key={page.pageNumber} data-page={page.pageNumber} className="py-4">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            // Order matters: rewrite first so our /api/files URLs survive
            // sanitisation. rehypeSanitize allows http(s) and same-origin
            // paths by default.
            rehypePlugins={[[rewriteStorageImages, { urlsByKey }], rehypeSanitize]}
          >
            {page.markdown}
          </ReactMarkdown>
        </section>
      ))}
    </div>
  );
}
