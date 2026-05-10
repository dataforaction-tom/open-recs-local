import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceMarkdown } from './source-markdown';

type IoCb = (entries: { target: Element; intersectionRatio: number }[]) => void;
let lastIO: { fire: IoCb } | null = null;

beforeEach(() => {
  lastIO = null;
  class StubIO {
    constructor(cb: IoCb) {
      lastIO = { fire: cb };
    }
    observe(_t: Element) {}
    disconnect() {}
    unobserve(_t: Element) {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', StubIO);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SourceMarkdown', () => {
  it('renders each page as a section tagged with the page number', () => {
    render(
      <SourceMarkdown
        pages={[
          { pageNumber: 1, markdown: '# Page one\n\nFirst page body.', imageUrls: {} },
          { pageNumber: 2, markdown: '# Page two\n\nSecond page body.', imageUrls: {} },
        ]}
      />,
    );

    const sections = document.querySelectorAll('section[data-page]');
    expect(sections).toHaveLength(2);
    expect(sections[0]?.getAttribute('data-page')).toBe('1');
    expect(sections[1]?.getAttribute('data-page')).toBe('2');
    expect(screen.getByText('First page body.')).toBeInTheDocument();
    expect(screen.getByText('Second page body.')).toBeInTheDocument();
  });

  it('rewrites a markdown image whose src is a known storage key', async () => {
    render(
      <SourceMarkdown
        pages={[
          {
            pageNumber: 1,
            markdown: '![](abc/img-1.png)',
            imageUrls: { 'abc/img-1.png': '/api/files/signed-T1' },
          },
        ]}
      />,
    );
    const img = document.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/api/files/signed-T1');
  });

  it('leaves external image URLs untouched', async () => {
    render(
      <SourceMarkdown
        pages={[
          {
            pageNumber: 1,
            markdown: '![](https://example.com/x.png)',
            imageUrls: {},
          },
        ]}
      />,
    );
    const img = document.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://example.com/x.png');
  });

  it('fires onActivePageChange when an IntersectionObserver entry takes the lead', () => {
    const onActivePageChange = vi.fn();
    render(
      <SourceMarkdown
        pages={[
          { pageNumber: 1, markdown: 'a', imageUrls: {} },
          { pageNumber: 2, markdown: 'b', imageUrls: {} },
        ]}
        onActivePageChange={onActivePageChange}
      />,
    );
    const sections = document.querySelectorAll('section[data-page]');
    expect(sections).toHaveLength(2);
    lastIO?.fire([
      { target: sections[1] as Element, intersectionRatio: 0.8 },
      { target: sections[0] as Element, intersectionRatio: 0.1 },
    ]);
    expect(onActivePageChange).toHaveBeenLastCalledWith(2);
  });

  it('imperatively scrolls to activePage when it changes externally', () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    const { rerender } = render(
      <SourceMarkdown
        pages={[
          { pageNumber: 1, markdown: 'a', imageUrls: {} },
          { pageNumber: 2, markdown: 'b', imageUrls: {} },
        ]}
        activePage={1}
      />,
    );
    rerender(
      <SourceMarkdown
        pages={[
          { pageNumber: 1, markdown: 'a', imageUrls: {} },
          { pageNumber: 2, markdown: 'b', imageUrls: {} },
        ]}
        activePage={2}
      />,
    );
    expect(scrollSpy).toHaveBeenCalled();
  });
});
