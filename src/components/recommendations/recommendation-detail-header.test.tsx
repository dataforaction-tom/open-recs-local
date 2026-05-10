import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecommendationDetailHeader } from './recommendation-detail-header';

describe('RecommendationDetailHeader', () => {
  it('renders title, body, and a link to the source', () => {
    render(
      <RecommendationDetailHeader
        title="Test recommendation"
        body="The recommendation body."
        sourceSlug="my-src"
        sourceTitle="My Source"
        pageAnchor={null}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Test recommendation' })).toBeInTheDocument();
    expect(screen.getByText('The recommendation body.')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'My Source' });
    expect(link).toHaveAttribute('href', '/sources/my-src');
  });

  it('shows the page anchor link when set', () => {
    render(
      <RecommendationDetailHeader
        title="x"
        body="y"
        sourceSlug="my-src"
        sourceTitle="My Source"
        pageAnchor={7}
      />,
    );
    expect(screen.getByText(/page 7/i)).toBeInTheDocument();
  });

  it('hides the page anchor when null', () => {
    render(
      <RecommendationDetailHeader
        title="x"
        body="y"
        sourceSlug="my-src"
        sourceTitle="My Source"
        pageAnchor={null}
      />,
    );
    expect(screen.queryByText(/page \d/i)).not.toBeInTheDocument();
  });
});
