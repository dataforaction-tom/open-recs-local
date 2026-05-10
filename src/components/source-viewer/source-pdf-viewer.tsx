'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from '@/components/ui/button';

if (typeof window !== 'undefined') {
  // The worker is copied into public/ by scripts/copy-pdf-worker.ts at predev/prebuild.
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.mjs';
}

export type SourcePdfViewerProps = {
  pdfUrl: string;
  activePage: number;
  totalPages?: number | undefined;
  onPageChange: (page: number) => void;
  onTotalPagesChange?: (count: number) => void;
};

export function SourcePdfViewer({
  pdfUrl,
  activePage,
  totalPages,
  onPageChange,
  onTotalPagesChange,
}: SourcePdfViewerProps) {
  const known = typeof totalPages === 'number' && totalPages > 0;
  const isFirst = activePage <= 1;
  const isLast = known && activePage >= (totalPages ?? 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border bg-background/80 px-3 py-1.5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous page"
            disabled={isFirst}
            onClick={() => onPageChange(activePage - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next page"
            disabled={isLast}
            onClick={() => onPageChange(activePage + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          Page {activePage}
          {known ? ` / ${totalPages}` : ''}
        </span>
      </div>
      <div className="flex-1 overflow-auto bg-muted/30 p-4">
        <Document
          file={pdfUrl}
          onLoadSuccess={(info: { numPages: number }) => onTotalPagesChange?.(info.numPages)}
          loading={<p className="text-sm text-muted-foreground">Loading PDF…</p>}
        >
          <Page pageNumber={activePage} />
        </Document>
      </div>
    </div>
  );
}
