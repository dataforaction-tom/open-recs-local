import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfigProvider } from '@/lib/config/provider';
import type { PublicConfig } from '@/lib/config/public';
import { Navigation } from './navigation';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

// UserMenu pulls in @/lib/auth/client which constructs a Better-auth react
// client at module-load. The client wants window globals it doesn't see in
// happy-dom; mock the surface UserMenu actually touches.
vi.mock('@/lib/auth/client', () => ({
  authClient: {
    useSession: () => ({ data: null, isPending: false }),
    signOut: vi.fn(),
  },
}));

const local: PublicConfig = {
  appMode: 'local',
  features: { auth: false, ownership: false, admin: false },
};

const hosted: PublicConfig = {
  appMode: 'hosted',
  features: { auth: true, ownership: true, admin: true },
};

function renderNav(config: PublicConfig, isAdmin = false) {
  return render(
    <ConfigProvider value={config}>
      <Navigation isAdmin={isAdmin} />
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

  it('shows the Admin link in hosted mode for admin users', () => {
    renderNav(hosted, true);
    expect(screen.getByRole('link', { name: 'Admin' })).toBeInTheDocument();
  });

  it('hides the Admin link in hosted mode for non-admin users', () => {
    renderNav(hosted, false);
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
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
