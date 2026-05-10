import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider } from '@/lib/config/provider';
import type { PublicConfig } from '@/lib/config/public';
import { Navigation } from './navigation';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

const local: PublicConfig = {
  appMode: 'local',
  features: { auth: false, ownership: false, admin: false },
};

const hosted: PublicConfig = {
  appMode: 'hosted',
  features: { auth: true, ownership: true, admin: true },
};

function renderNav(config: PublicConfig) {
  return render(
    <ConfigProvider value={config}>
      <Navigation />
    </ConfigProvider>,
  );
}

describe('Navigation', () => {
  it('renders the core app links', () => {
    renderNav(local);
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sources' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chat' })).toBeInTheDocument();
  });

  it('hides the Admin link in local mode', () => {
    renderNav(local);
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });

  it('shows the Admin link in hosted mode', () => {
    renderNav(hosted);
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
  });

  it('marks the active route via aria-current', () => {
    renderNav(local);
    const dashboard = screen.getByRole('link', { name: 'Dashboard' });
    expect(dashboard).toHaveAttribute('aria-current', 'page');
  });

  it('renders the dark mode toggle', () => {
    renderNav(local);
    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument();
  });
});
