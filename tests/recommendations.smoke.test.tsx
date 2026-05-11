import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  RecommendationsTable,
  type RecommendationRow,
} from '@/components/recommendations/recommendations-table';
import { FilterChips } from '@/components/recommendations/filter-chips';
import { RecommendationDetailHeader } from '@/components/recommendations/recommendation-detail-header';
import { SimilarRecommendations } from '@/components/recommendations/similar-recommendations';

const fixtureRows: RecommendationRow[] = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    title: 'Rotate auditors',
    sourceSlug: 'sample-report',
    sourceTitle: 'Sample report',
    createdAt: new Date('2026-05-10T00:00:00Z'),
    latestStatus: 'open',
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    title: 'Publish safeguarding report',
    sourceSlug: 'sample-report',
    sourceTitle: 'Sample report',
    createdAt: new Date('2026-05-09T00:00:00Z'),
    latestStatus: 'in_progress',
  },
];

const noopAction = vi.fn().mockResolvedValue({ ok: true as const });

const onClear = vi.fn();

beforeEach(() => {
  onClear.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Recommendations index pieces (smoke)', () => {
  it('table + chips render together with consistent links', () => {
    render(
      <div>
        <FilterChips
          active={[
            { key: 'q', label: 'Search', value: 'auditor' },
            { key: 'mode', label: 'Mode', value: 'keyword' },
          ]}
          onClear={onClear}
        />
        <RecommendationsTable rows={fixtureRows} onStatusTransition={noopAction} />
      </div>,
    );

    expect(screen.getByText('Search:')).toBeInTheDocument();
    expect(screen.getByText('auditor')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rotate auditors' })).toHaveAttribute(
      'href',
      '/recommendations/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    );
    expect(screen.getAllByRole('link', { name: 'Sample report' })[0]).toHaveAttribute(
      'href',
      '/sources/sample-report',
    );
  });

  it('clearing a chip emits the correct key', async () => {
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

describe('Recommendation detail pieces (smoke)', () => {
  it('header + similar list compose into a coherent detail view', () => {
    render(
      <div>
        <RecommendationDetailHeader
          title="Rotate auditors"
          body="Rotate external auditors at least every seven financial years."
          sourceSlug="sample-report"
          sourceTitle="Sample report"
          pageAnchor={2}
        />
        <SimilarRecommendations
          rows={[
            {
              id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
              title: 'Establish a board-level risk committee',
              sourceSlug: 'sample-report',
              distance: 0.04,
            },
          ]}
        />
      </div>,
    );

    expect(screen.getByRole('heading', { name: 'Rotate auditors' })).toBeInTheDocument();
    expect(screen.getByText(/page 2/i)).toBeInTheDocument();
    const sibling = screen.getByRole('link', { name: 'Establish a board-level risk committee' });
    expect(sibling).toHaveAttribute('href', '/recommendations/cccccccc-cccc-cccc-cccc-cccccccccccc');
  });
});
