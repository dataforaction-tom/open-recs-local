import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from './footer';

describe('Footer', () => {
  it('renders the publication tagline + a Source repo link', () => {
    render(<Footer />);
    expect(screen.getByText(/open recommendations/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /source/i })).toHaveAttribute(
      'href',
      expect.stringContaining('github.com/dataforaction-tom/open-recs-local'),
    );
  });
});
