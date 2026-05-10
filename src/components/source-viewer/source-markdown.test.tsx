import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceMarkdown } from './source-markdown';

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
});
