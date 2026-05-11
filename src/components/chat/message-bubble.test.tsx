import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from './message-bubble';

describe('MessageBubble', () => {
  it('renders user content as plain prose', () => {
    render(
      <MessageBubble
        message={{ id: 'u1', role: 'user', content: 'What about audits?' }}
      />,
    );
    expect(screen.getByText('What about audits?')).toBeInTheDocument();
    expect(screen.getByText(/^You$/)).toBeInTheDocument();
  });

  it('renders assistant citations as links to /sources/<slug>', () => {
    render(
      <MessageBubble
        message={{
          id: 'a1',
          role: 'assistant',
          content:
            'Auditors should rotate every five years [[source:report-a#page:12]].',
        }}
      />,
    );
    const link = screen.getByRole('link', { name: '[report-a#p12]' });
    expect(link).toHaveAttribute('href', '/sources/report-a');
  });

  it('keeps prose around multiple citations intact', () => {
    render(
      <MessageBubble
        message={{
          id: 'a2',
          role: 'assistant',
          content:
            'See [[source:a#page:1]] and also [[source:b#page:2]] for more.',
        }}
      />,
    );
    expect(screen.getByRole('link', { name: '[a#p1]' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '[b#p2]' })).toBeInTheDocument();
    expect(screen.getByText(/See/)).toBeInTheDocument();
    expect(screen.getByText(/and also/)).toBeInTheDocument();
    expect(screen.getByText(/for more\./)).toBeInTheDocument();
  });
});
