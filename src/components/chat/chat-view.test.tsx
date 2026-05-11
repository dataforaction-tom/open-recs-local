import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatView } from './chat-view';

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      const chunk = chunks[i] ?? '';
      controller.enqueue(encoder.encode(chunk));
      i += 1;
    },
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ChatView', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the example prompts when there are no messages yet', () => {
    render(<ChatView />);
    expect(
      screen.getByText(/board oversight of risk/i),
    ).toBeInTheDocument();
  });

  it('streams an assistant reply chunk-by-chunk and surfaces retrieved passages', async () => {
    const stream = streamFromChunks(['Hello ', 'world.']);
    const response = new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'x-citations-count': '1',
        'x-retrieved': JSON.stringify([{ slug: 'sample', page: 4 }]),
      },
    });
    vi.mocked(fetch).mockResolvedValueOnce(response);

    render(<ChatView />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText(/ask a question/i),
      'What about audits?',
    );
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    await waitFor(() =>
      expect(screen.getByText('Hello world.')).toBeInTheDocument(),
    );
    expect(screen.getByText('What about audits?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sample · p4/i })).toHaveAttribute(
      'href',
      '/sources/sample',
    );
  });

  it('renders an editorial error when the API returns 503 (no model configured)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(503, { error: 'no streaming chat model configured' }),
    );
    render(<ChatView />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/ask a question/i), 'anything');
    await user.click(screen.getByRole('button', { name: 'Ask' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /OPENAI_COMPAT_BASE_URL/i,
      ),
    );
  });
});
