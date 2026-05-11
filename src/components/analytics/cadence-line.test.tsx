import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const lastLineProps: { current: unknown } = { current: null };
vi.mock('react-chartjs-2', () => ({
  Line: (props: unknown) => {
    lastLineProps.current = props;
    return <div data-testid="line-mock" />;
  },
}));
vi.mock('./chart-setup', () => ({}));

import { CadenceLine } from './cadence-line';

describe('<CadenceLine>', () => {
  it('renders the empty state when every bucket is zero', () => {
    render(
      <CadenceLine
        rows={[
          { bucket: '2026-01-01T00:00:00Z', count: 0 },
          { bucket: '2026-02-01T00:00:00Z', count: 0 },
        ]}
      />,
    );
    expect(screen.getByText(/no progress updates/i)).toBeInTheDocument();
  });

  it('maps bucket ISO strings to "MMM YY" labels', () => {
    render(
      <CadenceLine
        rows={[
          { bucket: '2026-01-01T00:00:00Z', count: 1 },
          { bucket: '2026-02-01T00:00:00Z', count: 3 },
        ]}
      />,
    );
    const props = lastLineProps.current as { data: { labels: string[]; datasets: { data: number[] }[] } };
    expect(props.data.labels).toEqual(['Jan 26', 'Feb 26']);
    expect(props.data.datasets[0]?.data).toEqual([1, 3]);
  });
});
