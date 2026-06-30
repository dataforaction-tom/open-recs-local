'use client';

import { useCallback, useRef, useState } from 'react';
import { ChatInput } from './chat-input';
import { MessageBubble, type ChatMessage } from './message-bubble';
import { EmptyCorpusNotice } from '@/components/shared/empty-corpus-notice';

const EXAMPLES = [
  'What do these reports say about board oversight of risk?',
  'Where is safeguarding covered most thoroughly?',
  'Compare auditor rotation recommendations across the corpus.',
];

// Mirror the server-side cap in /api/chat-search (history.max(20)). Without
// trimming the client sends the full transcript and starts getting 400s
// after roughly ten turns.
const MAX_HISTORY = 20;

type Retrieved = ReadonlyArray<{ slug: string; page: number }>;

function parseRetrievedHeader(header: string | null): Retrieved {
  if (!header) return [];
  try {
    const raw = JSON.parse(header) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((entry): Retrieved => {
      if (typeof entry !== 'object' || entry === null) return [];
      const slug = (entry as Record<string, unknown>)['slug'];
      const page = (entry as Record<string, unknown>)['page'];
      if (typeof slug !== 'string' || typeof page !== 'number') return [];
      return [{ slug, page }];
    });
  } catch {
    return [];
  }
}

export function ChatView({ hasSources }: { hasSources: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idCounterRef = useRef(0);

  const nextId = useCallback(() => {
    idCounterRef.current += 1;
    return `msg-${idCounterRef.current}`;
  }, []);

  const ask = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2 || streaming) return;
      setError(null);
      setStreaming(true);

      const userMessage: ChatMessage = { id: nextId(), role: 'user', content: trimmed };
      const assistantId = nextId();
      const history = messages
        .slice(-MAX_HISTORY)
        .map((m) => ({ role: m.role, content: m.content }));
      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: assistantId, role: 'assistant', content: '' },
      ]);
      setDraft('');

      try {
        const res = await fetch('/api/chat-search', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ q: trimmed, history }),
        });
        if (!res.ok) {
          const detail =
            res.status === 503
              ? 'No streaming chat model is configured. Set OPENAI_COMPAT_BASE_URL + OPENAI_COMPAT_MODEL (or run an Ollama model) and reload.'
              : `Chat failed (${res.status}). Try again.`;
          setError(detail);
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          return;
        }

        const retrieved = parseRetrievedHeader(res.headers.get('x-retrieved'));
        if (retrieved.length > 0) {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, retrieved } : m)),
          );
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setError('Stream unavailable. Try again.');
          return;
        }
        const decoder = new TextDecoder();
        let acc = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)),
          );
        }
        acc += decoder.decode();
        if (acc !== '') {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m)),
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Chat failed.';
        setError(message);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        setStreaming(false);
      }
    },
    [messages, nextId, streaming],
  );

  const regenerate = useCallback(() => {
    if (streaming) return;
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    // Drop the trailing assistant answer and the user turn we're re-asking
    // so ask() can re-append a fresh user + assistant pair without leaving
    // duplicates behind.
    setMessages((prev) => {
      const trimmed = [...prev];
      const last = trimmed[trimmed.length - 1];
      if (last && last.role === 'assistant') trimmed.pop();
      const next = trimmed[trimmed.length - 1];
      if (next && next.role === 'user') trimmed.pop();
      return trimmed;
    });
    void ask(lastUser.content);
  }, [ask, messages, streaming]);

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const lastAssistantId = lastAssistant?.id;
  const retrieved = lastAssistant?.retrieved ?? [];

  return (
    <div className="grid grid-cols-1 gap-10 md:grid-cols-[1fr_18rem]">
      <div className="flex min-h-[24rem] flex-col gap-6">
        {messages.length === 0 ? (
          hasSources ? (
            <div className="space-y-4">
              <p className="font-serif text-base italic text-muted-foreground">
                Try one of these to start, or ask anything about the documents
                already in the library.
              </p>
              <ul className="space-y-2">
                {EXAMPLES.map((example) => (
                  <li key={example}>
                    <button
                      type="button"
                      onClick={() => ask(example)}
                      disabled={streaming}
                      className="border border-rule bg-paper-2 px-3 py-2 text-left font-serif text-sm leading-relaxed text-foreground transition-colors hover:border-accent hover:bg-accent-soft/40 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {example}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyCorpusNotice />
          )
        ) : (
          <ol className="space-y-6">
            {messages.map((m) => (
              <li key={m.id}>
                <MessageBubble message={m} />
                {m.role === 'assistant' && streaming && m.content === '' && (
                  <p className="ml-4 mt-2 font-serif text-sm italic text-muted-foreground">
                    Thinking…
                  </p>
                )}
                {m.role === 'assistant' &&
                  m.id === lastAssistantId &&
                  !streaming && (
                    <button
                      type="button"
                      onClick={regenerate}
                      className="ml-4 mt-2 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-accent hover:underline"
                    >
                      Regenerate
                    </button>
                  )}
              </li>
            ))}
          </ol>
        )}

        {error && (
          <div
            role="alert"
            className="border border-destructive bg-accent-claret-soft px-3 py-2 font-serif text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <div className="mt-auto">
          <ChatInput
            value={draft}
            onChange={setDraft}
            onSubmit={() => ask(draft)}
            disabled={streaming}
          />
        </div>
      </div>

      <aside className="space-y-3">
        <div className="border-b border-rule-strong pb-2">
          <h2 className="text-sm font-medium">Retrieved passages</h2>
        </div>
        {retrieved.length === 0 ? (
          <p className="font-serif text-sm italic text-muted-foreground">
            The retrieval layer surfaces the source pages it consulted here
            once you ask a question.
          </p>
        ) : (
          <ul className="space-y-2 font-mono text-xs">
            {retrieved.map((r, i) => (
              <li key={`${r.slug}-${r.page}-${i}`}>
                <a
                  href={`/sources/${r.slug}`}
                  className="text-muted-foreground underline-offset-4 hover:text-accent hover:underline"
                >
                  {r.slug} · p{r.page}
                </a>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
