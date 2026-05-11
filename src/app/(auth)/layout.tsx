import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadEnv } from '@/lib/env';

/**
 * Auth-group layout. A calm, editorial sign-in surface — wordmark on
 * top, single-column form panel, return-home link at the bottom.
 * Returns 404 in local mode so the auth routes never leak.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const env = loadEnv();
  if (env.APP_MODE !== 'hosted') notFound();
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-10 space-y-1 text-center">
        <Link
          href="/"
          className="inline-block text-lg font-medium tracking-tight hover:text-accent"
        >
          open recommendations
        </Link>
        <p className="font-serif text-sm italic text-muted-foreground">
          local edition
        </p>
      </div>
      <section className="border border-rule-strong bg-paper-2 p-8">
        {children}
      </section>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/" className="underline-offset-4 hover:text-accent hover:underline">
          ← Back to the homepage
        </Link>
      </p>
    </div>
  );
}
