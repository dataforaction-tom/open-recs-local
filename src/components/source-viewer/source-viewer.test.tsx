import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceViewer } from './source-viewer';

vi.mock('react-pdf', () => ({
  Document: ({ children }: { children: React.ReactNode }) => <div data-testid="stub-document">{children}</div>,
  Page: (props: { pageNumber: number }) => <div data-testid="stub-page" data-page={props.pageNumber} />,
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}));

const fixturePages = [
  { pageNumber: 1, markdown: '# Page one', imageUrls: {} },
  { pageNumber: 2, markdown: '# Page two', imageUrls: {} },
];

describe('SourceViewer', () => {
  it('renders the source title in the header', () => {
    render(<SourceViewer title="Sample Report" pages={fixturePages} pdfUrl="/api/files/T1" />);
    expect(screen.getByText('Sample Report')).toBeInTheDocument();
  });

  it('renders both panes', () => {
    render(<SourceViewer title="Sample Report" pages={fixturePages} pdfUrl="/api/files/T1" />);
    // Markdown side: page sections.
    expect(document.querySelectorAll('section[data-page]')).toHaveLength(2);
    // PDF side: stubbed react-pdf Page.
    expect(screen.getByTestId('stub-page')).toBeInTheDocument();
  });

  it('header shows the active page indicator', () => {
    render(<SourceViewer title="x" pages={fixturePages} pdfUrl="/api/files/T1" />);
    // Both the SourceViewer header and the inner SourcePdfViewer toolbar
    // surface "Page 1 / 2" — assert the count rather than uniqueness.
    expect(screen.getAllByText(/page 1 \/ 2/i).length).toBeGreaterThanOrEqual(1);
  });

  it('exposes a resizable handle between panes', () => {
    render(<SourceViewer title="x" pages={fixturePages} pdfUrl="/api/files/T1" />);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });
});
