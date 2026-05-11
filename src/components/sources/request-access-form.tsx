'use client';

import { useId, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  RequestAccessInput,
  type RequestAccessInputT,
} from '@/lib/validation/ownership-request';

export type RequestAccessAction = (
  input: RequestAccessInputT,
) => Promise<{ ok: true; id?: string } | { ok: false; error: string }>;

export type WithdrawAction = (
  input: { id: string },
) => Promise<{ ok: true } | { ok: false; error: string }>;

type Props = {
  sourceId: string;
  sourceTitle: string;
  pendingRequestId: string | null;
  action: RequestAccessAction;
  withdrawAction: WithdrawAction;
};

const NICE_ERROR: Record<string, string> = {
  unauthenticated: 'Sign in to request access.',
  duplicate: 'You already have a pending request for this source.',
  validation: 'Could not submit — please check your input.',
  'unknown-source': 'That source no longer exists.',
};

export function RequestAccessForm({
  sourceId,
  sourceTitle,
  pendingRequestId,
  action,
  withdrawAction,
}: Props) {
  const noteId = useId();
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(pendingRequestId);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
  } = useForm<RequestAccessInputT>({
    resolver: zodResolver(RequestAccessInput),
    defaultValues: { sourceId },
  });

  function onSubmit(values: RequestAccessInputT) {
    startTransition(async () => {
      setServerMessage(null);
      const cleaned: RequestAccessInputT = {
        sourceId,
        ...(values.note ? { note: values.note } : {}),
      };
      const result = await action(cleaned);
      if (!result.ok) {
        setServerMessage(NICE_ERROR[result.error] ?? 'Could not submit. Try again.');
        return;
      }
      // Store the real request id so Withdraw can target it without a reload.
      // The action propagates `id` from createOwnershipRequest's return.
      if (!result.id) {
        setServerMessage('Request created but the id was not returned. Reload to manage it.');
        return;
      }
      setRequestId(result.id);
      reset({ sourceId });
    });
  }

  function onWithdraw() {
    if (!requestId) return;
    startTransition(async () => {
      const result = await withdrawAction({ id: requestId });
      if (!result.ok) {
        setServerMessage('Could not withdraw the request. Try again.');
        return;
      }
      setRequestId(null);
    });
  }

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">{sourceTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          This source is private. Request access from an admin.
        </p>
        {requestId ? (
          <div className="space-y-3">
            <p className="rounded-md border border-border bg-muted/30 px-3 py-2">
              Your request is pending review.
            </p>
            <Button onClick={onWithdraw} disabled={isPending} variant="outline">
              {isPending ? 'Withdrawing…' : 'Withdraw request'}
            </Button>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <input type="hidden" {...register('sourceId')} />
            <div className="space-y-1.5">
              <Label htmlFor={noteId}>Note (optional)</Label>
              <Textarea id={noteId} rows={3} {...register('note')} placeholder="Why do you need access?" />
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Requesting…' : 'Request access'}
            </Button>
          </form>
        )}
        {serverMessage && (
          <div
            role="alert"
            className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {serverMessage}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
