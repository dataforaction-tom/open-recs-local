import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export const dynamic = 'force-dynamic';

export default function ResetPasswordPage() {
  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-muted-foreground">Choose a new password</p>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
