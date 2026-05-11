'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { authClient } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoginInput, type LoginInputT } from '@/lib/validation/auth';

export function LoginForm() {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInputT>({
    resolver: zodResolver(LoginInput),
    defaultValues: { email: '', password: '' },
  });

  function onSubmit(values: LoginInputT) {
    startTransition(async () => {
      setServerError(null);
      const result = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });
      if (result.error) {
        setServerError(result.error.message ?? 'Invalid email or password.');
        return;
      }
      router.push('/dashboard');
      router.refresh();
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor={emailId}>Email</Label>
        <Input id={emailId} type="email" autoComplete="email" {...register('email')} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={passwordId}>Password</Label>
          <Link href="/forgot-password" className="text-xs text-muted-foreground underline-offset-4 hover:text-accent hover:underline">
            Forgot?
          </Link>
        </div>
        <Input
          id={passwordId}
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
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
        {isPending ? 'Signing in…' : 'Sign in'}
      </Button>
      <div className="text-center text-sm text-muted-foreground">
        or{' '}
        <Link href="/magic-link" className="text-accent underline-offset-4 hover:underline">
          sign in with a magic link
        </Link>
      </div>
    </form>
  );
}
