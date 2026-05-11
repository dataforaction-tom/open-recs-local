import { Suspense } from 'react';
import Link from 'next/link';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export const dynamic = 'force-dynamic';

export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-medium tracking-tight">Choose a new password</h1>
        <p className="font-serif text-sm italic text-muted-foreground">
          Pick something memorable. We never see it in plain text.
        </p>
      </header>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
      <p className="text-sm text-muted-foreground">
        <Link href="/login" className="underline-offset-4 hover:text-accent hover:underline">
          ← Back to sign in
        </Link>
      </p>
    </div>
  );
}
