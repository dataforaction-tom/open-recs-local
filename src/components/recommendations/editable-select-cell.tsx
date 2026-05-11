'use client';

import { type ReactNode, useState, useTransition } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type EditableOption = {
  value: string;
  label: string;
};

type Props<V extends string> = {
  value: V;
  options: ReadonlyArray<{ value: V; label: string }>;
  onSubmit: (next: V) => Promise<{ ok: true } | { ok: false; error: string }>;
  render?: (value: V) => ReactNode;
};

/**
 * Generic inline-editable cell. Shows the current label as a "change…"
 * button by default; on click, expands to a Select. Selecting a new option
 * fires onSubmit inside useTransition; the displayed value flips back to
 * the previous on a non-ok result.
 *
 * Pass `render` to customise the static display (e.g. a status badge).
 */
export function EditableSelectCell<V extends string>({
  value,
  options,
  onSubmit,
  render,
}: Props<V>) {
  const [optimistic, setOptimistic] = useState<V>(value);
  // Re-sync to the incoming `value` when the parent re-renders with a new
  // prop (e.g. after a server refresh, a filter change that swaps the row
  // bound to this cell instance, or a successful action revalidating the
  // page). Without this, optimistic state shadows the new authoritative
  // value and the user sees stale data. React's "store info from previous
  // renders" pattern — https://react.dev/reference/react/useState — keeps
  // this out of useEffect, which the React Compiler ESLint rule blocks.
  const [lastSyncedValue, setLastSyncedValue] = useState<V>(value);
  if (value !== lastSyncedValue) {
    setLastSyncedValue(value);
    setOptimistic(value);
  }
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const currentLabel =
    options.find((o) => o.value === optimistic)?.label ?? String(optimistic);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label="Change"
        className="inline-flex items-center gap-1 rounded text-left hover:opacity-80"
      >
        {render ? render(optimistic) : <span>{currentLabel}</span>}
      </button>
    );
  }

  function onChange(next: V | null) {
    if (next === null || next === optimistic) {
      setEditing(false);
      return;
    }
    const previous = optimistic;
    setOptimistic(next);
    setEditing(false);
    startTransition(async () => {
      const result = await onSubmit(next);
      if (!result.ok) setOptimistic(previous);
    });
  }

  return (
    <Select
      value={optimistic}
      onValueChange={onChange}
      defaultOpen
      disabled={isPending}
    >
      <SelectTrigger size="sm" aria-label="Change status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
