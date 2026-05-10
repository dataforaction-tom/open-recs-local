'use client';

import { useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { useLocalStorage } from '@/lib/hooks/use-local-storage';
import { useScrollSync } from '@/lib/hooks/use-scroll-sync';
import { SourceMarkdown, type SourcePage } from './source-markdown';
import { SourcePdfViewer } from './source-pdf-viewer';

const SPLIT_KEY = 'source-viewer:split';

export type SourceViewerProps = {
  title: string;
  pages: SourcePage[];
  pdfUrl: string;
};

export function SourceViewer({ title, pages, pdfUrl }: SourceViewerProps) {
  const [savedSize, setSavedSize] = useLocalStorage<number>(SPLIT_KEY, 50);
  const [totalPages, setTotalPages] = useState<number | undefined>(pages.length || undefined);
  const { activePage, setActivePage } = useScrollSync({ initialPage: 1 });

  const handleTotalPages = (count: number) => setTotalPages(count);

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col rounded-md border border-border bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <h1 className="text-base font-semibold tracking-tight">{title}</h1>
        <span className="text-xs text-muted-foreground">
          Page {activePage}
          {totalPages ? ` / ${totalPages}` : ''}
        </span>
      </header>
      <Group orientation="horizontal" className="flex-1">
        <Panel
          defaultSize={`${savedSize}%`}
          minSize="25%"
          maxSize="75%"
          onResize={(size) => {
            const numeric = typeof size === 'number' ? size : parseFloat(String(size));
            if (Number.isFinite(numeric)) setSavedSize(numeric);
          }}
        >
          <SourceMarkdown
            pages={pages}
            activePage={activePage}
            onActivePageChange={setActivePage}
          />
        </Panel>
        <Separator className="w-px bg-border transition-colors hover:w-1 hover:bg-primary/40" />
        <Panel minSize="25%" maxSize="75%">
          <SourcePdfViewer
            pdfUrl={pdfUrl}
            activePage={activePage}
            {...(totalPages !== undefined ? { totalPages } : {})}
            onPageChange={setActivePage}
            onTotalPagesChange={handleTotalPages}
          />
        </Panel>
      </Group>
    </div>
  );
}
