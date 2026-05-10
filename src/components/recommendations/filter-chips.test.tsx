import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterChips } from './filter-chips';

describe('FilterChips', () => {
  it('renders nothing when there are no active filters', () => {
    const { container } = render(<FilterChips active={[]} onClear={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one chip per active filter with its label', () => {
    render(
      <FilterChips
        active={[
          { key: 'q', label: 'Search', value: 'auditor' },
          { key: 'mode', label: 'Mode', value: 'keyword' },
        ]}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByText('Search: auditor')).toBeInTheDocument();
    expect(screen.getByText('Mode: keyword')).toBeInTheDocument();
  });

  it('clicking a chip clear button calls onClear with the chip key', async () => {
    const onClear = vi.fn();
    render(
      <FilterChips
        active={[{ key: 'q', label: 'Search', value: 'auditor' }]}
        onClear={onClear}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /clear search filter/i }));
    expect(onClear).toHaveBeenCalledWith('q');
  });
});
