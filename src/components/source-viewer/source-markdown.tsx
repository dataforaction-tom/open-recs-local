'use client';

import { useEffect, useMemo, useRef } from 'react';
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
  /** Page that should be brought into view imperatively (driven by scroll-sync). */
  activePage?: number;
  /** Fires when the most-visible section changes due to user scroll. */
  onActivePageChange?: (page: number) => void;
};

export function SourceMarkdown({ pages, activePage, onActivePageChange }: SourceMarkdownProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Collapse all per-page image maps into one — react-markdown plugins are
  // shared across the whole tree, so we hand the rehype rewriter every key.
  const urlsByKey = useMemo(() => {
    const merged: Record<string, string> = {};
    for (const page of pages) Object.assign(merged, page.imageUrls);
    return merged;
  }, [pages]);

  // IntersectionObserver: emit the page number of the section currently
  // covering the most viewport area. Threshold 0/0.5/1 gives enough resolution
  // to pick a winner without flooding the debounced scroll-sync state.
  useEffect(() => {
    if (!onActivePageChange || !containerRef.current) return;
    const root = containerRef.current;
    const sections = Array.from(root.querySelectorAll<HTMLElement>('section[data-page]'));
    if (sections.length === 0) return;

    const visible = new Map<number, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset['page']);
          if (Number.isFinite(page)) visible.set(page, entry.intersectionRatio);
        }
        let bestPage = -1;
        let bestRatio = -1;
        for (const [p, r] of visible) {
          if (r > bestRatio) {
            bestRatio = r;
            bestPage = p;
          }
        }
        if (bestPage > 0 && bestRatio > 0) onActivePageChange(bestPage);
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    for (const s of sections) io.observe(s);
    return () => io.disconnect();
  }, [pages, onActivePageChange]);

  // Imperative scroll: when activePage changes externally (the PDF side
  // moved), bring the matching section into view without firing the IO
  // chain back to the PDF.
  useEffect(() => {
    if (activePage === undefined || !containerRef.current) return;
    const target = containerRef.current.querySelector<HTMLElement>(
      `section[data-page="${activePage}"]`,
    );
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [activePage]);

  return (
    <div
      ref={containerRef}
      className="prose prose-sm font-serif max-w-none h-full overflow-auto px-1 prose-headings:font-sans prose-headings:tracking-tight prose-code:font-mono prose-a:text-accent prose-a:no-underline hover:prose-a:underline"
    >
      {pages.map((page) => (
        <section
          key={page.pageNumber}
          data-page={page.pageNumber}
          className="border-b border-rule py-6 last:border-b-0"
        >
          <div className="eyebrow mb-3 text-muted-foreground">page {page.pageNumber}</div>
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
