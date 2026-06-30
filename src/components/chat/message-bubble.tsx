'use client';

import { useState } from 'react';
import Link from 'next/link';
import { tokeniseCitations } from './citations';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Citations the retrieval layer surfaced before the LLM ran. */
  retrieved?: ReadonlyArray<{ slug: string; page: number }>;
};

/**
 * Each assistant bubble parses inline `[[source:slug#page:n]]` markers and
 * renders them as accent-coloured links to `/sources/<slug>`. Page-anchor
 * support inside the source viewer is deferred until the viewer itself
 * exposes anchors.
 */
export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context); ignore silently.
    }
  };

  return (
    <article
      className={
        isUser
          ? 'border-l-2 border-rule pl-4'
          : 'border-l-2 border-accent bg-accent-soft/30 pl-4'
      }
    >
      <div className="eyebrow mb-2 text-muted-foreground">
        {isUser ? 'You' : 'Assistant'}
      </div>
      {isUser ? (
        <p className="font-serif text-base leading-relaxed">{message.content}</p>
      ) : (
        <p className="font-serif text-base leading-relaxed">
          {tokeniseCitations(message.content).map((token, i) =>
            token.type === 'text' ? (
              <span key={i}>{token.text}</span>
            ) : (
              <Link
                key={i}
                href={`/sources/${token.slug}`}
                className="text-accent underline-offset-4 hover:underline"
                title={`page ${token.page}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                [{token.slug}#p{token.page}]
              </Link>
            ),
          )}
        </p>
      )}
      {!isUser && (
        <button
          type="button"
          onClick={copy}
          className="mt-2 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-accent hover:underline"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      )}
    </article>
  );
}