import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagReviewQueue } from './tag-review-queue';

const sections = [
  {
    axis: 'purposes' as const,
    unverified: [
      {
        id: '12345678-1234-4567-8abc-12345678aaaa',
        slug: 'unverified-one',
        name: 'Unverified one',
        colorHex: null,
        description: null,
        unverified: true,
      },
    ],
    verified: [
      {
        id: '12345678-1234-4567-8abc-12345678bbbb',
        slug: 'strategy',
        name: 'Strategy',
        colorHex: null,
        description: null,
        unverified: false,
      },
    ],
  },
];

describe('TagReviewQueue', () => {
  it('renders an axis section per axis', () => {
    render(
      <TagReviewQueue
        sections={sections}
        onPromote={vi.fn().mockResolvedValue({ ok: true })}
        onRename={vi.fn().mockResolvedValue({ ok: true })}
        onMerge={vi.fn().mockResolvedValue({ ok: true })}
        onDelete={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(screen.getByText(/purposes/i)).toBeInTheDocument();
    expect(screen.getByText('Unverified one')).toBeInTheDocument();
  });

  it('clicking Promote fires onPromote with (axis, id)', async () => {
    const onPromote = vi.fn().mockResolvedValue({ ok: true });
    render(
      <TagReviewQueue
        sections={sections}
        onPromote={onPromote}
        onRename={vi.fn().mockResolvedValue({ ok: true })}
        onMerge={vi.fn().mockResolvedValue({ ok: true })}
        onDelete={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /^Promote$/i }));
    expect(onPromote).toHaveBeenCalledWith({
      axis: 'purposes',
      id: '12345678-1234-4567-8abc-12345678aaaa',
    });
  });

  it('shows an empty-state message when an axis has no unverified rows', () => {
    render(
      <TagReviewQueue
        sections={[{ axis: 'purposes', unverified: [], verified: [] }]}
        onPromote={vi.fn().mockResolvedValue({ ok: true })}
        onRename={vi.fn().mockResolvedValue({ ok: true })}
        onMerge={vi.fn().mockResolvedValue({ ok: true })}
        onDelete={vi.fn().mockResolvedValue({ ok: true })}
      />,
    );
    expect(screen.getByText(/queue is quiet/i)).toBeInTheDocument();
  });
});
