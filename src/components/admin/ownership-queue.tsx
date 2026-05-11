'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { PendingOwnershipRequestRow } from '@/lib/repositories/ownership-request';

export type ResolveAction = (
  input: { id: string },
) => Promise<{ ok: true } | { ok: false; error: string }>;

type Props = {
  rows: PendingOwnershipRequestRow[];
  onApprove: ResolveAction;
  onReject: ResolveAction;
};

export function OwnershipQueue({ rows, onApprove, onReject }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resolve(id: string, fn: ResolveAction) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await fn({ id });
      setBusyId(null);
      if (!result.ok) setError(result.error || 'Could not resolve the request.');
    });
  }

  if (rows.length === 0) {
    return (
      <p className="font-serif text-sm italic text-muted-foreground">
        No pending requests — the queue is quiet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-rule border-y border-rule">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-start justify-between gap-3 py-4 text-sm"
          >
            <div className="space-y-1">
              <div>
                <Link
                  href={`/sources/${row.sourceSlug}`}
                  className="font-medium underline-offset-4 hover:text-accent hover:underline"
                >
                  {row.sourceTitle}
                </Link>
              </div>
              <div className="text-xs text-muted-foreground">
                {row.requesterName ? `${row.requesterName} · ` : ''}
                <span className="font-mono">{row.requesterEmail}</span> ·{' '}
                {row.createdAt.toLocaleDateString()}
              </div>
              {row.note && (
                <p className="font-serif italic text-muted-foreground">{row.note}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => resolve(row.id, onReject)}
                disabled={isPending && busyId === row.id}
                variant="outline"
                size="sm"
              >
                Reject
              </Button>
              <Button
                onClick={() => resolve(row.id, onApprove)}
                disabled={isPending && busyId === row.id}
                size="sm"
              >
                Approve
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p
          role="alert"
          className="border border-destructive bg-accent-claret-soft px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}
