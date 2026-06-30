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
    render(<ChatView hasSources />);
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

    render(<ChatView hasSources />);
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

  it('caps history sent to /api/chat-search at 20 entries to match the server schema', async () => {
    // Seed the chat with 22 prior messages by replying with a one-shot stream
    // 11 times. The 12th request should send a history of length 20 (the cap),
    // not 22 — otherwise the server's z.array(...).max(20) returns a 400.
    const reply = (text: string): Response =>
      new Response(streamFromChunks([text]), {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });

    const fetchMock = vi.mocked(fetch);
    for (let i = 0; i < 12; i += 1) {
      fetchMock.mockResolvedValueOnce(reply(`reply ${i + 1}`));
    }

    render(<ChatView hasSources />);
    const user = userEvent.setup();
    const input = screen.getByLabelText(/ask a question/i);
    const ask = screen.getByRole('button', { name: 'Ask' });

    for (let turn = 1; turn <= 12; turn += 1) {
      await user.clear(input);
      await user.type(input, `question ${turn}`);
      await user.click(ask);
      await waitFor(() =>
        expect(screen.getByText(`reply ${turn}`)).toBeInTheDocument(),
      );
    }

    const lastCall = fetchMock.mock.calls.at(-1)!;
    const body = JSON.parse((lastCall[1] as RequestInit).body as string) as {
      history: unknown[];
    };
    expect(body.history.length).toBeLessThanOrEqual(20);
  });

  it('renders an editorial error when the API returns 503 (no model configured)', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(503, { error: 'no streaming chat model configured' }),
    );
    render(<ChatView hasSources />);
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
