import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-medium tracking-tight">Forgot your password?</h1>
        <p className="font-serif text-sm italic text-muted-foreground">
          Enter your email and we’ll send a reset link.
        </p>
      </header>
      <ForgotPasswordForm />
      <p className="text-sm text-muted-foreground">
        <Link href="/login" className="underline-offset-4 hover:text-accent hover:underline">
          ← Back to sign in
        </Link>
      </p>
    </div>
  );
}
