'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { Button } from '@/components/ui/button';

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      await authClient.signOut();
      router.push('/login');
      router.refresh();
    });
  }

  return (
    <Button onClick={onClick} disabled={isPending} variant="outline" className={className}>
      {isPending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
