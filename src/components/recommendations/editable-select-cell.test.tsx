import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditableSelectCell } from './editable-select-cell';

const OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
];

describe('<EditableSelectCell>', () => {
  it('renders the current label by default', () => {
    render(
      <EditableSelectCell value="open" options={OPTIONS} onSubmit={vi.fn()} />,
    );
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('calls onSubmit with the new value when an option is chosen', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ ok: true });
    render(
      <EditableSelectCell value="open" options={OPTIONS} onSubmit={onSubmit} />,
    );

    await user.click(screen.getByRole('button', { name: /change/i }));
    await user.click(await screen.findByRole('option', { name: 'In progress' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('in_progress'));
  });

  it('rolls back the displayed value when onSubmit returns ok: false', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, error: 'not_found' });
    render(
      <EditableSelectCell value="open" options={OPTIONS} onSubmit={onSubmit} />,
    );

    await user.click(screen.getByRole('button', { name: /change/i }));
    await user.click(await screen.findByRole('option', { name: 'Done' }));

    // After rollback, the original label is shown again.
    await waitFor(() => expect(screen.getByText('Open')).toBeInTheDocument());
  });

  it('uses the optional render prop for the display side', () => {
    render(
      <EditableSelectCell
        value="done"
        options={OPTIONS}
        onSubmit={vi.fn()}
        render={(value) => <span data-testid="custom">[[{value}]]</span>}
      />,
    );
    expect(screen.getByTestId('custom')).toHaveTextContent('[[done]]');
  });
});
