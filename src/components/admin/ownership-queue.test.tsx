import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OwnershipQueue } from './ownership-queue';
import type { PendingOwnershipRequestRow } from '@/lib/repositories/ownership-request';

const ROWS: PendingOwnershipRequestRow[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    sourceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sourceSlug: 'priv-source',
    sourceTitle: 'Private Source',
    requesterEmail: 'requester@example.com',
    requesterName: 'Reggie Requester',
    note: 'I work on this project',
    createdAt: new Date('2026-05-10T00:00:00Z'),
  },
];

describe('<OwnershipQueue>', () => {
  it('renders the empty state when there are no pending requests', () => {
    render(<OwnershipQueue rows={[]} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByText(/no pending requests/i)).toBeInTheDocument();
  });

  it('lists each pending request with title, requester, and note', () => {
    render(<OwnershipQueue rows={ROWS} onApprove={vi.fn()} onReject={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Private Source' })).toHaveAttribute(
      'href',
      '/sources/priv-source',
    );
    expect(screen.getByText(/Reggie Requester/)).toBeInTheDocument();
    expect(screen.getByText('I work on this project')).toBeInTheDocument();
  });

  it('calls onApprove with the row id', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn().mockResolvedValue({ ok: true });
    render(<OwnershipQueue rows={ROWS} onApprove={onApprove} onReject={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => expect(onApprove).toHaveBeenCalledWith({ id: ROWS[0]!.id }));
  });

  it('surfaces errors from the action as an alert', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn().mockResolvedValue({ ok: false, error: 'no_user_for_email' });
    render(<OwnershipQueue rows={ROWS} onApprove={onApprove} onReject={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /approve/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no_user_for_email');
  });
});
