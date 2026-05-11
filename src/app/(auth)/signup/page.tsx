import Link from 'next/link';
import { SignupForm } from '@/components/auth/signup-form';

export const dynamic = 'force-dynamic';

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-medium tracking-tight">Create an account</h1>
        <p className="font-serif text-sm italic text-muted-foreground">
          A name, an email, and a password is all we need.
        </p>
      </header>
      <SignupForm />
      <p className="text-sm text-muted-foreground">
        Already registered?{' '}
        <Link href="/login" className="text-accent underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
