import Link from 'next/link';
import { LoginForm } from '@/components/auth/login-form';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-medium tracking-tight">Sign in</h1>
        <p className="font-serif text-sm italic text-muted-foreground">
          Welcome back. Enter your email and password.
        </p>
      </header>
      <LoginForm />
      <p className="text-sm text-muted-foreground">
        No account?{' '}
        <Link href="/signup" className="text-accent underline-offset-4 hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
