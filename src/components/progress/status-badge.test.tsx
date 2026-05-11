import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './status-badge';

describe('<StatusBadge>', () => {
  it('renders the human-readable label for each status', () => {
    const { rerender } = render(<StatusBadge status="open" />);
    expect(screen.getByText('Open')).toBeInTheDocument();

    rerender(<StatusBadge status="in_progress" />);
    expect(screen.getByText('In progress')).toBeInTheDocument();

    rerender(<StatusBadge status="done" />);
    expect(screen.getByText('Done')).toBeInTheDocument();

    rerender(<StatusBadge status="blocked" />);
    expect(screen.getByText('Blocked')).toBeInTheDocument();

    rerender(<StatusBadge status="withdrawn" />);
    expect(screen.getByText('Withdrawn')).toBeInTheDocument();
  });

  it('exposes the optional note via the title attribute', () => {
    render(<StatusBadge status="blocked" title="awaiting funding" />);
    expect(screen.getByText('Blocked')).toHaveAttribute('title', 'awaiting funding');
  });
});
