import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressUpdatesList } from './progress-updates-list';
import type { ProgressUpdateRow } from '@/lib/repositories/progress-update';

const SAMPLE: ProgressUpdateRow[] = [
  {
    id: 'a',
    createdAt: new Date(),
    progressNotes: 'Latest update',
    evidenceType: { slug: 'document', name: 'Document' },
    evidenceUrl: 'https://example.com/q3.pdf',
    userProgressRating: { slug: 'some-progress', name: 'Some progress', weight: 25 },
    authorUserId: null,
  },
  {
    id: 'b',
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    progressNotes: 'Older update with no extras',
    evidenceType: null,
    evidenceUrl: null,
    userProgressRating: null,
    authorUserId: null,
  },
];

describe('<ProgressUpdatesList>', () => {
  it('renders an empty-state card when there are no rows', () => {
    render(<ProgressUpdatesList rows={[]} />);
    expect(screen.getByText(/no progress updates yet/i)).toBeInTheDocument();
  });

  it('renders a card per row with notes, evidence badge, rating badge and url', () => {
    render(<ProgressUpdatesList rows={SAMPLE} />);

    expect(screen.getByText('Latest update')).toBeInTheDocument();
    expect(screen.getByText('Older update with no extras')).toBeInTheDocument();
    expect(screen.getByText('Document')).toBeInTheDocument();
    expect(screen.getByText('Some progress')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /q3\.pdf/i }) as HTMLAnchorElement;
    expect(link.href).toBe('https://example.com/q3.pdf');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
