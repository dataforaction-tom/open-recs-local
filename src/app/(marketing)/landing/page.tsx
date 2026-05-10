import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">open-recs-local</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        A local-first place to upload reports, extract recommendations, and search across them.
      </p>
      <div className="mt-8 flex justify-center">
        <Link href="/dashboard" className={buttonVariants({ variant: 'default', size: 'lg' })}>
          Get started
        </Link>
      </div>
    </div>
  );
}
