import Link from 'next/link';
import { MagicLinkForm } from '@/components/auth/magic-link-form';

export const dynamic = 'force-dynamic';

export default function MagicLinkPage() {
  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-muted-foreground">
        Sign in without a password
      </p>
      <MagicLinkForm />
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/login" className="underline hover:text-foreground">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
