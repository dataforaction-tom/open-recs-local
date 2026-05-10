import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SourcePdfViewer } from './source-pdf-viewer';

let lastDocumentProps: { onLoadSuccess?: (info: { numPages: number }) => void } | null = null;
let lastPageProps: { pageNumber?: number } | null = null;

vi.mock('react-pdf', () => ({
  Document: (props: { children: React.ReactNode; onLoadSuccess?: (info: { numPages: number }) => void }) => {
    lastDocumentProps = { ...(props.onLoadSuccess !== undefined ? { onLoadSuccess: props.onLoadSuccess } : {}) };
    return <div data-testid="stub-document">{props.children}</div>;
  },
  Page: (props: { pageNumber: number }) => {
    lastPageProps = { pageNumber: props.pageNumber };
    return <div data-testid="stub-page" data-page={props.pageNumber} />;
  },
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}));

describe('SourcePdfViewer', () => {
  it('renders a Page bound to the supplied activePage', () => {
    render(<SourcePdfViewer pdfUrl="/api/files/abc" activePage={3} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByTestId('stub-page')).toHaveAttribute('data-page', '3');
    expect(lastPageProps?.pageNumber).toBe(3);
  });

  it('clicking the next-page control calls onPageChange(active + 1)', async () => {
    const onPageChange = vi.fn();
    render(<SourcePdfViewer pdfUrl="/api/files/abc" activePage={2} totalPages={5} onPageChange={onPageChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /next page/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('clicking the previous-page control calls onPageChange(active - 1)', async () => {
    const onPageChange = vi.fn();
    render(<SourcePdfViewer pdfUrl="/api/files/abc" activePage={2} totalPages={5} onPageChange={onPageChange} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /previous page/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('previous-page is disabled on page 1, next-page is disabled on the last page', () => {
    const { rerender } = render(
      <SourcePdfViewer pdfUrl="/api/files/abc" activePage={1} totalPages={5} onPageChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next page/i })).not.toBeDisabled();

    rerender(<SourcePdfViewer pdfUrl="/api/files/abc" activePage={5} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
  });

  it('reports total pages back via onLoadSuccess from the underlying Document', () => {
    const onTotalPagesChange = vi.fn();
    render(
      <SourcePdfViewer
        pdfUrl="/api/files/abc"
        activePage={1}
        totalPages={undefined}
        onPageChange={vi.fn()}
        onTotalPagesChange={onTotalPagesChange}
      />,
    );
    lastDocumentProps?.onLoadSuccess?.({ numPages: 7 });
    expect(onTotalPagesChange).toHaveBeenCalledWith(7);
  });
});
