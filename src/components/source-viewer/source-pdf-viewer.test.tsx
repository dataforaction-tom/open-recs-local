import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourcePdfViewer } from './source-pdf-viewer';

let lastDocumentProps: { onLoadSuccess?: (info: { numPages: number }) => void } | null = null;
let lastPagePropsList: Array<{ pageNumber: number }> = [];

vi.mock('react-pdf', () => ({
  Document: (props: { children: React.ReactNode; onLoadSuccess?: (info: { numPages: number }) => void }) => {
    lastDocumentProps = { ...(props.onLoadSuccess !== undefined ? { onLoadSuccess: props.onLoadSuccess } : {}) };
    return <div data-testid="stub-document">{props.children}</div>;
  },
  Page: (props: { pageNumber: number }) => {
    lastPagePropsList.push({ pageNumber: props.pageNumber });
    return <div data-testid="stub-page" data-page={props.pageNumber} />;
  },
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}));

type FakeIO = {
  observe: (target: Element) => void;
  disconnect: () => void;
};
let lastIO: { fire: (entries: { target: Element; intersectionRatio: number }[]) => void } | null = null;

beforeEach(() => {
  lastDocumentProps = null;
  lastPagePropsList = [];
  lastIO = null;
  class StubIO implements FakeIO {
    private cb: (entries: { target: Element; intersectionRatio: number }[]) => void;
    constructor(cb: (entries: { target: Element; intersectionRatio: number }[]) => void) {
      this.cb = cb;
      lastIO = { fire: this.cb.bind(null) };
      // Re-bind so callers can drive the captured cb
      lastIO.fire = (entries) => cb(entries);
    }
    observe() {
      /* noop */
    }
    disconnect() {
      /* noop */
    }
    unobserve() {
      /* noop */
    }
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', StubIO);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SourcePdfViewer (continuous scroll)', () => {
  it('renders one Page per known total page', () => {
    render(
      <SourcePdfViewer pdfUrl="/api/files/abc" activePage={1} totalPages={3} onPageChange={vi.fn()} />,
    );
    const pages = screen.getAllByTestId('stub-page');
    expect(pages).toHaveLength(3);
    expect(pages.map((p) => p.getAttribute('data-page'))).toEqual(['1', '2', '3']);
  });

  it('reports the discovered total via onLoadSuccess + onTotalPagesChange', () => {
    const onTotal = vi.fn();
    render(
      <SourcePdfViewer
        pdfUrl="/api/files/abc"
        activePage={1}
        onPageChange={vi.fn()}
        onTotalPagesChange={onTotal}
      />,
    );
    lastDocumentProps?.onLoadSuccess?.({ numPages: 7 });
    expect(onTotal).toHaveBeenCalledWith(7);
  });

  it('emits onPageChange when an IntersectionObserver entry takes the lead', () => {
    const onPageChange = vi.fn();
    render(
      <SourcePdfViewer
        pdfUrl="/api/files/abc"
        activePage={1}
        totalPages={3}
        onPageChange={onPageChange}
      />,
    );
    const targets = document.querySelectorAll('[data-pdf-page]');
    expect(targets).toHaveLength(3);
    lastIO?.fire([
      { target: targets[1] as Element, intersectionRatio: 0.9 },
      { target: targets[0] as Element, intersectionRatio: 0.1 },
    ]);
    expect(onPageChange).toHaveBeenLastCalledWith(2);
  });

  it('shows Page X / Y once total is known', () => {
    render(
      <SourcePdfViewer pdfUrl="/api/files/abc" activePage={2} totalPages={5} onPageChange={vi.fn()} />,
    );
    expect(screen.getByText(/page 2 \/ 5/i)).toBeInTheDocument();
  });
});
