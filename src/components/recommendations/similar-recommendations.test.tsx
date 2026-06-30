import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SimilarRecommendations } from './similar-recommendations';

describe('SimilarRecommendations', () => {
  it('renders an empty-state when no rows are supplied', () => {
    render(<SimilarRecommendations rows={[]} />);
    expect(screen.getByText(/no similar/i)).toBeInTheDocument();
  });

  it('renders one link per supplied row pointing at /recommendations/[id]', () => {
    render(
      <SimilarRecommendations
        rows={[
          { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', title: 'Sibling A', sourceSlug: 'src-a', sourceTitle: 'Source A', distance: 0.1 },
          { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', title: 'Sibling B', sourceSlug: 'src-b', sourceTitle: 'Source B', distance: 0.2 },
        ]}
      />,
    );
    const a = screen.getByRole('link', { name: 'Sibling A' });
    expect(a).toHaveAttribute('href', '/recommendations/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(screen.getByRole('link', { name: 'Sibling B' })).toBeInTheDocument();
  });
});
