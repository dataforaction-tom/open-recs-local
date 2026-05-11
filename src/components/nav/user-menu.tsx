'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { authClient } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';

/**
 * Compact auth-aware nav slot for hosted mode. Subscribes to Better-auth's
 * `useSession` so it reflects sign-in / sign-out without a hard reload.
 * Renders a Sign in link when logged out, a Profile link + Sign out button
 * when logged in.
 */
export function UserMenu() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [signingOut, startTransition] = useTransition();

  if (isPending) return null;

  if (!session?.user) {
    return (
      <Link
        href="/login"
        className="inline-flex h-8 items-center rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
      >
        Sign in
      </Link>
    );
  }

  function signOut() {
    startTransition(async () => {
      await authClient.signOut();
      router.push('/login');
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1">
      <Link
        href="/profile"
        className="inline-flex h-8 items-center rounded-md px-3 text-sm text-muted-foreground hover:text-foreground"
        title={session.user.email}
      >
        {session.user.name ?? session.user.email}
      </Link>
      <Button onClick={signOut} disabled={signingOut} variant="ghost" size="sm">
        {signingOut ? '…' : 'Sign out'}
      </Button>
    </div>
  );
}
