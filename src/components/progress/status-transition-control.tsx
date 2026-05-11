'use client';

import { useState, useTransition } from 'react';
import { REC_STATUS, type RecStatus } from '@/lib/db/schema';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from './status-badge';
import type { StatusTransitionInputT } from '@/lib/validation/progress-update';

const LABELS: Record<RecStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  done: 'Done',
  blocked: 'Blocked',
  withdrawn: 'Withdrawn',
};

export type StatusTransitionAction = (
  input: StatusTransitionInputT,
) => Promise<{ ok: true } | { ok: false; error: string }>;

type Props = {
  recommendationId: string;
  current: RecStatus;
  note?: string | undefined;
  action: StatusTransitionAction;
};

export function StatusTransitionControl({ recommendationId, current, note, action }: Props) {
  const [optimistic, setOptimistic] = useState<RecStatus>(current);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onChange(value: RecStatus | null) {
    if (value === null || value === optimistic) return;
    const previous = optimistic;
    setOptimistic(value);
    setError(null);
    startTransition(async () => {
      const result = await action({ recommendationId, status: value });
      if (!result.ok) {
        setOptimistic(previous);
        setError("Couldn't update the status — please try again.");
      }
    });
  }

  return (
    <section className="border border-rule bg-accent-soft/30 p-5">
      <div className="flex flex-wrap items-center gap-4">
        <h3 className="text-sm font-medium">Status</h3>
        {note ? (
          <StatusBadge status={optimistic} title={note} />
        ) : (
          <StatusBadge status={optimistic} />
        )}
        <Select value={optimistic} onValueChange={onChange} disabled={isPending}>
          <SelectTrigger size="sm" aria-label="Change status" className="bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REC_STATUS.map((s) => (
              <SelectItem key={s} value={s}>
                {LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && (
          <span className="text-sm text-destructive" role="alert">
            {error}
          </span>
        )}
      </div>
    </section>
  );
}
