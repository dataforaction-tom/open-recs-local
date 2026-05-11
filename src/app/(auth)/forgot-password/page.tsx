import Link from 'next/link';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const dynamic = 'force-dynamic';

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-muted-foreground">
        Enter your email to receive a reset link
      </p>
      <ForgotPasswordForm />
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="underline hover:text-foreground">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
