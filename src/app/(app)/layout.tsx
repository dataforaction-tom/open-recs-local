import type { ReactNode } from 'react';
import { ConfigProvider } from '@/lib/config/provider';
import { Footer } from '@/components/footer/footer';
import { Navigation } from '@/components/nav/navigation';
import { Container } from '@/components/ui/container';
import { loadEnv } from '@/lib/env';
import { getPublicConfig } from '@/lib/config/public';

export const dynamic = 'force-dynamic';

export default function AppLayout({ children }: { children: ReactNode }) {
  const config = getPublicConfig(loadEnv());
  return (
    <ConfigProvider value={config}>
      <Navigation />
      <main className="flex-1 py-12">
        <Container>{children}</Container>
      </main>
      <Footer />
    </ConfigProvider>
  );
}
