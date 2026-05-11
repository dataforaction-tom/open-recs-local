import Link from 'next/link';
import { SignupForm } from '@/components/auth/signup-form';

export const dynamic = 'force-dynamic';

export default function SignupPage() {
  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-muted-foreground">Create your account</p>
      <SignupForm />
      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/login" className="underline hover:text-foreground">
          Sign in
        </Link>
      </p>
    </div>
  );
}
