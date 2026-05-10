import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardView } from './dashboard-view';

afterEach(() => {
  window.localStorage.clear();
});

describe('DashboardView', () => {
  it('renders both cards with rows when data is supplied', () => {
    window.localStorage.setItem('decision-flow:seen', JSON.stringify(true));
    render(
      <DashboardView
        recentJobs={[
          { id: 'j1', name: 'source.parse', state: 'completed', createdOn: new Date(), completedOn: new Date() },
        ]}
        recentSources={[
          { id: 's1', slug: 'sample', title: 'Sample report', status: 'ready', createdAt: new Date() },
        ]}
      />,
    );
    expect(screen.getByText(/recent jobs/i)).toBeInTheDocument();
    expect(screen.getByText(/recent sources/i)).toBeInTheDocument();
    expect(screen.getByText('source.parse')).toBeInTheDocument();
    expect(screen.getByText('Sample report')).toBeInTheDocument();
  });

  it('shows empty-state copy when arrays are empty', () => {
    window.localStorage.setItem('decision-flow:seen', JSON.stringify(true));
    render(<DashboardView recentJobs={[]} recentSources={[]} />);
    expect(screen.getByText(/no jobs yet/i)).toBeInTheDocument();
    expect(screen.getByText(/no sources yet/i)).toBeInTheDocument();
  });
});
