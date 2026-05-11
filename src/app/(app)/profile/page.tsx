import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { SignOutButton } from '@/components/auth/sign-out-button';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const env = loadEnv();
  if (env.APP_MODE !== 'hosted') redirect('/dashboard');

  const providers = createProviders(env);
  const headersList = await headers();
  const req = new Request('http://localhost/profile', { headers: headersList });
  const ctx = await providers.auth.getContext(req);

  if (!ctx.user.email) redirect('/login');

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <header className="space-y-3">
        <div className="section-num">Profile</div>
        <h1 className="text-4xl tracking-tight">Your account</h1>
        <p className="font-serif text-base italic text-muted-foreground">
          The identity we use to sign your work.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="border-b border-rule-strong pb-2 text-sm font-medium">Account</h2>
        <dl className="divide-y divide-rule">
          <div className="grid grid-cols-[8rem_1fr] gap-x-6 py-3 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd>{ctx.user.name ?? '—'}</dd>
          </div>
          <div className="grid grid-cols-[8rem_1fr] gap-x-6 py-3 text-sm">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-mono">{ctx.user.email}</dd>
          </div>
          <div className="grid grid-cols-[8rem_1fr] gap-x-6 py-3 text-sm">
            <dt className="text-muted-foreground">Roles</dt>
            <dd>
              {ctx.roles.length > 0 ? (
                <span className="inline-flex gap-2">
                  {ctx.roles.map((role) => (
                    <span
                      key={role}
                      className="border border-rule bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
                    >
                      {role}
                    </span>
                  ))}
                </span>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>
      </section>

      <div className="border-t border-rule pt-6">
        <SignOutButton />
      </div>
    </div>
  );
}
