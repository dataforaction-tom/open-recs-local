import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DecisionFlow, DECISION_FLOW_SEEN_KEY } from './decision-flow';

afterEach(() => {
  window.localStorage.clear();
});

describe('DecisionFlow', () => {
  it('renders the first step by default and advances on Next', async () => {
    render(<DecisionFlow />);
    expect(screen.getByText(/welcome/i)).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.queryByText(/welcome/i)).not.toBeInTheDocument();
  });

  it('Back is disabled on the first step', () => {
    render(<DecisionFlow />);
    const back = screen.getByRole('button', { name: /back/i });
    expect(back).toBeDisabled();
  });

  it('Skip persists the seen flag and unmounts the flow', async () => {
    const { container } = render(<DecisionFlow />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /skip/i }));
    expect(window.localStorage.getItem(DECISION_FLOW_SEEN_KEY)).toBeTruthy();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the seen flag is already set', () => {
    window.localStorage.setItem(DECISION_FLOW_SEEN_KEY, JSON.stringify(true));
    const { container } = render(<DecisionFlow />);
    expect(container.firstChild).toBeNull();
  });
});
