import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { loadEnv } from '@/lib/env';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Auth-group layout. Renders a centred card around each auth page. Returns
 * 404 in local mode so the auth routes don't leak — the existing
 * `<FeatureGate>` only hides nav links; the routes themselves were
 * reachable until this layout-level guard.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const env = loadEnv();
  if (env.APP_MODE !== 'hosted') notFound();
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-xl">Open Recommendations</CardTitle>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
