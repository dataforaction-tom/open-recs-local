import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { ConfigProvider } from '@/lib/config/provider';
import { Footer } from '@/components/footer/footer';
import { Navigation } from '@/components/nav/navigation';
import { Container } from '@/components/ui/container';
import { loadEnv } from '@/lib/env';
import { getPublicConfig } from '@/lib/config/public';
import { createProviders } from '@/lib/providers';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const env = loadEnv();
  const config = getPublicConfig(env);

  // Resolve the viewer's roles server-side so the admin nav link can be gated
  // per-user rather than by the coarse `admin` feature flag, which is on for
  // every hosted-mode visitor. Anonymous / local-mode viewers get `false`.
  let isAdmin = false;
  if (config.features.admin) {
    const providers = createProviders(env);
    const headersList = await headers();
    const req = new Request('http://localhost/', { headers: headersList });
    const auth = await providers.auth.getContext(req);
    isAdmin = auth.roles.includes('admin');
  }

  return (
    <ConfigProvider value={config}>
      <Navigation isAdmin={isAdmin} />
      <main className="flex-1 py-12">
        <Container>{children}</Container>
      </main>
      <Footer />
    </ConfigProvider>
  );
}