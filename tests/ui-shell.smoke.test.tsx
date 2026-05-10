import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from '@/lib/config/provider';
import type { PublicConfig } from '@/lib/config/public';
import { Navigation } from '@/components/nav/navigation';
import { Footer } from '@/components/footer/footer';
import { DashboardView } from '@/components/dashboard/dashboard-view';
import { DECISION_FLOW_SEEN_KEY } from '@/components/decision-flow/decision-flow';

/**
 * UI shell smoke. We mount Navigation + DashboardView + Footer together (the
 * pieces an (app)/layout.tsx renders around a page). Server-component layouts
 * can't be exercised end-to-end in happy-dom, so we approximate by rendering
 * the same providers and pieces a page would see at runtime.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

const setTheme = vi.fn();
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme }),
}));

afterEach(() => {
  window.localStorage.clear();
  setTheme.mockClear();
});

const localConfig: PublicConfig = {
  appMode: 'local',
  features: { auth: false, ownership: false, admin: false },
};

function renderShell() {
  return render(
    <ConfigProvider value={localConfig}>
      <Navigation />
      <DashboardView recentJobs={[]} recentSources={[]} />
      <Footer />
    </ConfigProvider>,
  );
}

describe('UI shell smoke', () => {
  it('renders nav, dashboard, footer, and the dark mode toggle', () => {
    renderShell();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText(/recent jobs/i)).toBeInTheDocument();
    expect(screen.getByText(/recent sources/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /github/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /theme/i })).toBeInTheDocument();
  });

  it('clicking the theme toggle calls setTheme', async () => {
    renderShell();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /theme/i }));
    expect(setTheme).toHaveBeenCalled();
  });

  it('DecisionFlow is visible on first render and disappears after Skip', async () => {
    renderShell();
    expect(screen.getByText(/welcome to open-recs-local/i)).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /skip onboarding/i }));
    expect(screen.queryByText(/welcome to open-recs-local/i)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DECISION_FLOW_SEEN_KEY)).toBeTruthy();
  });

  it('does not render the Admin link in local mode', () => {
    renderShell();
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
  });
});
