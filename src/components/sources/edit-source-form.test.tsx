import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditSourceForm } from './edit-source-form';

const themeOptions = [
  { slug: 'governance', name: 'Governance', colorHex: '#4f46e5', unverified: false },
  { slug: 'data', name: 'Data', colorHex: '#7c2d12', unverified: false },
];

const baseProps = {
  source: {
    id: '12345678-1234-4567-8abc-123456789abc',
    title: 'A report',
    summary: 'Short abstract.',
    authors: ['Alice'],
    publicationDate: null,
    orgOwner: 'Sample Org',
    originalUrl: null,
    attachmentUrl: null,
    datasets: [],
    isPrivate: false,
  },
  axisOptions: {
    thematic_areas: themeOptions,
    source_types: [],
    purposes: [],
    role_relevances: [],
    target_audience_types: [],
  },
  initialMemberships: {
    thematic_areas: ['governance'],
    source_types: [],
    purposes: [],
    role_relevances: [],
    target_audience_types: [],
  },
  showPrivacyToggle: false,
};

describe('EditSourceForm', () => {
  it('renders the source title in the title input', () => {
    render(<EditSourceForm {...baseProps} action={vi.fn().mockResolvedValue({ ok: true })} />);
    expect(screen.getByLabelText(/^Title/i)).toHaveValue('A report');
  });

  it('renders current thematic-area memberships as chips', () => {
    render(<EditSourceForm {...baseProps} action={vi.fn().mockResolvedValue({ ok: true })} />);
    expect(screen.getByText('Governance')).toBeInTheDocument();
  });

  it('submits the form payload to the action when the title input has a value', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true });
    render(<EditSourceForm {...baseProps} action={action} />);
    const user = userEvent.setup();
    // Type into the title field to ensure it has a value (some happy-dom
    // versions don't propagate react-hook-form's `defaultValues` to the
    // underlying DOM input — typing makes the test independent of that).
    const titleInput = screen.getByLabelText(/^Title/i);
    await user.clear(titleInput);
    await user.type(titleInput, 'Edited title');
    await user.click(screen.getByRole('button', { name: /^Save$/i }));
    expect(action).toHaveBeenCalledTimes(1);
    const payload = action.mock.calls[0]?.[0] as { sourceId: string; title: string };
    expect(payload.sourceId).toBe(baseProps.source.id);
    expect(payload.title).toBe('Edited title');
  });

  it('renders the privacy toggle only when showPrivacyToggle is true', () => {
    const { rerender } = render(
      <EditSourceForm {...baseProps} action={vi.fn().mockResolvedValue({ ok: true })} />,
    );
    expect(screen.queryByLabelText(/Private/i)).toBeNull();
    rerender(
      <EditSourceForm
        {...baseProps}
        showPrivacyToggle
        action={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(screen.getByLabelText(/Private/i)).toBeInTheDocument();
  });
});
