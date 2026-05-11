import Link from 'next/link';
import { LoginForm } from '@/components/auth/login-form';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-muted-foreground">Sign in to your account</p>
      <LoginForm />
      <p className="text-center text-sm text-muted-foreground">
        No account?{' '}
        <Link href="/signup" className="underline hover:text-foreground">
          Sign up
        </Link>
      </p>
    </div>
  );
}
