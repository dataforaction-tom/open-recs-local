import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DarkModeToggle } from './dark-mode-toggle';

const setTheme = vi.fn();
let currentTheme = 'system';

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: currentTheme,
    resolvedTheme: currentTheme === 'dark' ? 'dark' : 'light',
    setTheme,
  }),
}));

describe('DarkModeToggle', () => {
  it('renders an accessible toggle button', () => {
    currentTheme = 'system';
    render(<DarkModeToggle />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAccessibleName(/theme/i);
  });

  it('cycles light → dark → system → light on successive clicks', async () => {
    setTheme.mockClear();
    currentTheme = 'light';
    const { rerender } = render(<DarkModeToggle />);
    const btn = screen.getByRole('button');
    const user = userEvent.setup();

    await user.click(btn);
    expect(setTheme).toHaveBeenLastCalledWith('dark');

    currentTheme = 'dark';
    rerender(<DarkModeToggle />);
    await user.click(screen.getByRole('button'));
    expect(setTheme).toHaveBeenLastCalledWith('system');

    currentTheme = 'system';
    rerender(<DarkModeToggle />);
    await user.click(screen.getByRole('button'));
    expect(setTheme).toHaveBeenLastCalledWith('light');
  });
});
