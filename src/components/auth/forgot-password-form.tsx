'use client';

import { useId, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { authClient } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ForgotPasswordInput, type ForgotPasswordInputT } from '@/lib/validation/auth';

export function ForgotPasswordForm() {
  const emailId = useId();
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInputT>({
    resolver: zodResolver(ForgotPasswordInput),
    defaultValues: { email: '' },
  });

  function onSubmit(values: ForgotPasswordInputT) {
    startTransition(async () => {
      setServerError(null);
      const result = await authClient.requestPasswordReset({
        email: values.email,
        redirectTo: '/reset-password',
      });
      if (result.error) {
        setServerError(result.error.message ?? 'Could not send reset email. Try again.');
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="border border-accent bg-accent-soft/50 px-3 py-3 text-sm">
        If an account exists for that email, a reset link has been sent.{' '}
        <span className="font-serif italic text-muted-foreground">
          In dev, the URL is in the server logs.
        </span>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor={emailId}>Email</Label>
        <Input id={emailId} type="email" autoComplete="email" {...register('email')} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      {serverError && (
        <div
          role="alert"
          className="border border-destructive bg-accent-claret-soft px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </div>
      )}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
