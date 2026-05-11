import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProgressUpdateForm } from './progress-update-form';

const RECOMMENDATION_ID = randomUUID();

const EVIDENCE_TYPES = [
  { slug: 'document', name: 'Document' },
  { slug: 'url', name: 'URL' },
];
const PROGRESS_RATINGS = [
  { slug: 'no-progress', name: 'No progress' },
  { slug: 'some-progress', name: 'Some progress' },
];

describe('<ProgressUpdateForm>', () => {
  it('renders the notes textarea + submit button', () => {
    render(
      <ProgressUpdateForm
        recommendationId={RECOMMENDATION_ID}
        evidenceTypes={EVIDENCE_TYPES}
        progressRatings={PROGRESS_RATINGS}
        action={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/progress notes/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /post update/i })).toBeInTheDocument();
  });

  it('shows a validation message and does not call the action when notes are empty', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ProgressUpdateForm
        recommendationId={RECOMMENDATION_ID}
        evidenceTypes={EVIDENCE_TYPES}
        progressRatings={PROGRESS_RATINGS}
        action={action}
      />,
    );

    await user.click(screen.getByRole('button', { name: /post update/i }));

    expect(await screen.findByText(/add a brief progress note/i)).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it('calls the action with trimmed notes on a valid submission', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ ok: true });
    render(
      <ProgressUpdateForm
        recommendationId={RECOMMENDATION_ID}
        evidenceTypes={EVIDENCE_TYPES}
        progressRatings={PROGRESS_RATINGS}
        action={action}
      />,
    );

    await user.type(screen.getByLabelText(/progress notes/i), '   We made progress.   ');
    await user.click(screen.getByRole('button', { name: /post update/i }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        recommendationId: RECOMMENDATION_ID,
        progressNotes: 'We made progress.',
      }),
    );
  });

  it('renders an error banner when the action returns ok: false', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ ok: false, error: 'not_found' });
    render(
      <ProgressUpdateForm
        recommendationId={RECOMMENDATION_ID}
        evidenceTypes={EVIDENCE_TYPES}
        progressRatings={PROGRESS_RATINGS}
        action={action}
      />,
    );

    await user.type(screen.getByLabelText(/progress notes/i), 'note');
    await user.click(screen.getByRole('button', { name: /post update/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't post/i);
  });

  it('calls onSuccess and resets the textarea after a successful submission', async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ ok: true });
    const onSuccess = vi.fn();
    render(
      <ProgressUpdateForm
        recommendationId={RECOMMENDATION_ID}
        evidenceTypes={EVIDENCE_TYPES}
        progressRatings={PROGRESS_RATINGS}
        action={action}
        onSuccess={onSuccess}
      />,
    );

    const textarea = screen.getByLabelText(/progress notes/i) as HTMLTextAreaElement;
    await user.type(textarea, 'all good');
    await user.click(screen.getByRole('button', { name: /post update/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(textarea.value).toBe('');
  });
});
