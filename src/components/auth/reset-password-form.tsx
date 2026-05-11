'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { authClient } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResetPasswordInput, type ResetPasswordInputT } from '@/lib/validation/auth';

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const passwordId = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInputT>({
    resolver: zodResolver(ResetPasswordInput),
    defaultValues: { token, password: '' },
  });

  if (!token) {
    return (
      <p className="text-sm text-destructive">
        Missing reset token. Request a new reset link from <a href="/forgot-password" className="underline">forgot password</a>.
      </p>
    );
  }

  function onSubmit(values: ResetPasswordInputT) {
    startTransition(async () => {
      setServerError(null);
      const result = await authClient.resetPassword({
        token: values.token,
        newPassword: values.password,
      });
      if (result.error) {
        setServerError(result.error.message ?? 'Could not reset password. Try again.');
        return;
      }
      router.push('/login');
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <input type="hidden" {...register('token')} />
      <div className="space-y-1.5">
        <Label htmlFor={passwordId}>New password</Label>
        <Input
          id={passwordId}
          type="password"
          autoComplete="new-password"
          {...register('password')}
        />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>
      {serverError && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {serverError}
        </div>
      )}
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? 'Resetting…' : 'Reset password'}
      </Button>
    </form>
  );
}
