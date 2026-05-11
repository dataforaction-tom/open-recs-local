'use client';

import { useId, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';

type Props = {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
};

export function ChatInput({ value, onChange, onSubmit, disabled, placeholder }: Props) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to a reasonable cap so multi-line questions
  // don't force the user to scroll inside a tiny input.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    const next = Math.min(el.scrollHeight, 240);
    el.style.height = `${next}px`;
  }, [value]);

  return (
    <form
      className="flex items-end gap-3 border-t border-rule-strong bg-paper-2 px-1 pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim().length >= 2 && !disabled) onSubmit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        Ask a question
      </label>
      <textarea
        id={id}
        ref={ref}
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? 'Ask a question about the corpus…'}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (value.trim().length >= 2 && !disabled) onSubmit();
          }
        }}
        className="block w-full resize-none border border-rule bg-background px-3 py-2 font-serif text-base leading-relaxed outline-none focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <Button type="submit" disabled={disabled || value.trim().length < 2}>
        Ask
      </Button>
    </form>
  );
}
