import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecommendationsTable, type RecommendationRow } from './recommendations-table';

const fixtureRows: RecommendationRow[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Banana plan',
    sourceSlug: 'src-a',
    sourceTitle: 'Source A',
    createdAt: new Date('2026-05-01T00:00:00Z'),
    latestStatus: 'open',
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    title: 'Apple plan',
    sourceSlug: 'src-b',
    sourceTitle: 'Source B',
    createdAt: new Date('2026-05-02T00:00:00Z'),
    latestStatus: 'in_progress',
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    title: 'Cherry plan',
    sourceSlug: 'src-c',
    sourceTitle: 'Source C',
    createdAt: new Date('2026-05-03T00:00:00Z'),
    latestStatus: 'done',
  },
];

const noopAction = vi.fn().mockResolvedValue({ ok: true as const });

describe('RecommendationsTable', () => {
  it('renders one row per supplied recommendation', () => {
    render(<RecommendationsTable rows={fixtureRows} onStatusTransition={noopAction} />);
    expect(screen.getByText('Banana plan')).toBeInTheDocument();
    expect(screen.getByText('Apple plan')).toBeInTheDocument();
    expect(screen.getByText('Cherry plan')).toBeInTheDocument();
  });

  it('title cell links to /recommendations/[id]', () => {
    render(<RecommendationsTable rows={fixtureRows} onStatusTransition={noopAction} />);
    const link = screen.getByRole('link', { name: 'Banana plan' });
    expect(link).toHaveAttribute('href', '/recommendations/11111111-1111-1111-1111-111111111111');
  });

  it('source cell links to /sources/[slug]', () => {
    render(<RecommendationsTable rows={fixtureRows} onStatusTransition={noopAction} />);
    const link = screen.getByRole('link', { name: 'Source A' });
    expect(link).toHaveAttribute('href', '/sources/src-a');
  });

  it('renders the latest status as a badge per row', () => {
    render(<RecommendationsTable rows={fixtureRows} onStatusTransition={noopAction} />);
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('clicking the title header sorts the rows alphabetically', async () => {
    render(<RecommendationsTable rows={fixtureRows} onStatusTransition={noopAction} />);
    const sortButton = screen.getByRole('button', { name: /title/i });
    const user = userEvent.setup();
    await user.click(sortButton);

    const rendered = screen.getAllByRole('row').slice(1).map((row) => row.textContent);
    // Apple < Banana < Cherry alphabetically
    expect(rendered[0]).toContain('Apple');
    expect(rendered[1]).toContain('Banana');
    expect(rendered[2]).toContain('Cherry');
  });

  it('renders an empty-state row when no rows are supplied', () => {
    render(<RecommendationsTable rows={[]} onStatusTransition={noopAction} />);
    expect(screen.getByText(/no recommendations/i)).toBeInTheDocument();
  });
});
