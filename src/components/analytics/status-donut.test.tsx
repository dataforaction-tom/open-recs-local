import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock react-chartjs-2 so happy-dom doesn't try to render a canvas. The
// stub component records its props on a global so the assertion below can
// inspect what the component passed Chart.js.
const lastDoughnutProps: { current: unknown } = { current: null };
vi.mock('react-chartjs-2', () => ({
  Doughnut: (props: unknown) => {
    lastDoughnutProps.current = props;
    return <div data-testid="doughnut-mock" />;
  },
}));
vi.mock('./chart-setup', () => ({}));

import { StatusDonut } from './status-donut';

describe('<StatusDonut>', () => {
  it('shows the empty state when every bucket is zero', () => {
    render(<StatusDonut rows={[]} />);
    expect(screen.getByText(/no recommendations yet/i)).toBeInTheDocument();
  });

  it('passes a fully-padded dataset to Doughnut (all 5 statuses, zero-filled)', () => {
    render(
      <StatusDonut
        rows={[
          { status: 'open', count: 3 },
          { status: 'done', count: 1 },
        ]}
      />,
    );
    const props = lastDoughnutProps.current as {
      data: { labels: string[]; datasets: { data: number[] }[] };
    };
    expect(props.data.labels).toHaveLength(5);
    // open=3, in_progress=0, done=1, blocked=0, withdrawn=0
    expect(props.data.datasets[0]?.data).toEqual([3, 0, 1, 0, 0]);
  });
});
