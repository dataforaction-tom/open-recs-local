import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditRecommendationForm } from './edit-recommendation-form';

const themeOptions = [
  { slug: 'governance', name: 'Governance', colorHex: '#4f46e5', unverified: false },
];

const baseProps = {
  rec: {
    id: '12345678-1234-4567-8abc-123456789abd',
    title: 'A rec title that is long enough',
    body: 'A body that is at least twenty characters long.',
    targetOrganization: null,
    notes: null,
    pageStart: null,
    pageEnd: null,
    priorityTimescaleSlug: null,
    confidence: null as 'high' | 'medium' | 'low' | null,
  },
  axisOptions: {
    thematic_areas: themeOptions,
    purposes: [],
    target_audience_types: [],
    location_scopes: [],
    priority_timescales: [
      { slug: 'short-term', name: 'Short-term', colorHex: null, unverified: false },
      { slug: 'medium-term', name: 'Medium-term', colorHex: null, unverified: false },
    ],
  },
  initialMemberships: {
    thematic_areas: ['governance'],
    purposes: [],
    target_audience_types: [],
    location_scopes: [],
  },
};

describe('EditRecommendationForm', () => {
  it('renders title and body in their inputs', () => {
    render(
      <EditRecommendationForm {...baseProps} action={vi.fn().mockResolvedValue({ ok: true })} />,
    );
    expect(screen.getByLabelText(/^Title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Body/i)).toBeInTheDocument();
  });

  it('renders current thematic-area memberships as chips', () => {
    render(
      <EditRecommendationForm {...baseProps} action={vi.fn().mockResolvedValue({ ok: true })} />,
    );
    expect(screen.getByText('Governance')).toBeInTheDocument();
  });

  it('submits with the recommendation id intact after the user fills title + body', async () => {
    const action = vi.fn().mockResolvedValue({ ok: true });
    render(<EditRecommendationForm {...baseProps} action={action} />);
    const user = userEvent.setup();
    const titleInput = screen.getByLabelText(/^Title/i);
    await user.clear(titleInput);
    await user.type(titleInput, 'Edited rec title now long enough');
    const bodyInput = screen.getByLabelText(/^Body/i);
    await user.clear(bodyInput);
    await user.type(bodyInput, 'Body content that meets the twenty-char minimum.');
    await user.click(screen.getByRole('button', { name: /^Save$/i }));
    expect(action).toHaveBeenCalledTimes(1);
    const payload = action.mock.calls[0]?.[0] as { recommendationId: string };
    expect(payload.recommendationId).toBe(baseProps.rec.id);
  });
});
