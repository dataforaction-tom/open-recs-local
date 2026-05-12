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

  it('preserves ?source= and ?theme= filters when submitting or toggling mode', async () => {
    push.mockClear();
    currentSearch =
      'q=audit&source=00000000-0000-0000-0000-000000000001&theme=00000000-0000-0000-0000-000000000002';
    render(<SearchForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Search' }));
    const submitUrl = push.mock.calls.at(-1)?.[0] as string;
    expect(submitUrl).toContain('source=00000000-0000-0000-0000-000000000001');
    expect(submitUrl).toContain('theme=00000000-0000-0000-0000-000000000002');

    push.mockClear();
    await user.click(screen.getByRole('button', { name: /toggle search mode/i }));
    const toggleUrl = push.mock.calls.at(-1)?.[0] as string;
    expect(toggleUrl).toContain('source=00000000-0000-0000-0000-000000000001');
    expect(toggleUrl).toContain('theme=00000000-0000-0000-0000-000000000002');
    expect(toggleUrl).toContain('mode=keyword');
  });
});
