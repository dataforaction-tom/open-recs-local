import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import LandingPage from './page';

describe('Landing page', () => {
  it('renders the product name and a CTA link', () => {
    render(<LandingPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/open-recs-local/i);
    expect(screen.getByRole('link', { name: /get started/i })).toHaveAttribute('href', '/dashboard');
  });
});
