import Link from 'next/link';
import { MagicLinkForm } from '@/components/auth/magic-link-form';

export const dynamic = 'force-dynamic';

export default function MagicLinkPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-medium tracking-tight">Sign in by email</h1>
        <p className="font-serif text-sm italic text-muted-foreground">
          We’ll send a one-time link. No password required.
        </p>
      </header>
      <MagicLinkForm />
      <p className="text-sm text-muted-foreground">
        <Link href="/login" className="underline-offset-4 hover:text-accent hover:underline">
          ← Back to password sign-in
        </Link>
      </p>
    </div>
  );
}
