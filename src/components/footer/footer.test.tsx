import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from './footer';

describe('Footer', () => {
  it('renders an open-recs-local copyright + GitHub link', () => {
    render(<Footer />);
    expect(screen.getByText(/open-recs-local/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /github/i })).toHaveAttribute(
      'href',
      expect.stringContaining('github.com/dataforaction-tom/open-recs-local'),
    );
  });
});
