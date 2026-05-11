import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchForm } from './search-form';

const push = vi.fn();
let currentSearch = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(currentSearch),
  usePathname: () => '/search',
}));

describe('SearchForm', () => {
  it('submits the input value as ?q= on the search URL', async () => {
    push.mockClear();
    currentSearch = '';
    render(<SearchForm />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/search recommendations/i), 'audit rotation');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(push).toHaveBeenCalledWith('/search?q=audit+rotation');
  });

  it('clicking the mode button toggles hybrid <-> keyword in the URL', async () => {
    push.mockClear();
    currentSearch = '';
    render(<SearchForm />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /toggle search mode/i }));
    expect(push).toHaveBeenCalledWith('/search?mode=keyword');
  });

  it('seeds the input from the URL q param', () => {
    currentSearch = 'q=safeguarding';
    render(<SearchForm />);
    expect(screen.getByLabelText(/search recommendations/i)).toHaveValue(
      'safeguarding',
    );
  });
});
