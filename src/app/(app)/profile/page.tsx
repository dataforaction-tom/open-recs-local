import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <span className="text-muted-foreground">Name: </span>
            <span>{ctx.user.name ?? '—'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Email: </span>
            <span>{ctx.user.email}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Roles: </span>
            <span>{ctx.roles.length > 0 ? ctx.roles.join(', ') : '—'}</span>
          </div>
        </CardContent>
      </Card>
      <SignOutButton />
    </div>
  );
}
