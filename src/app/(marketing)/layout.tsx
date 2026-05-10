import type { ReactNode } from 'react';
import { ConfigProvider } from '@/lib/config/provider';
import { loadEnv } from '@/lib/env';
import { getPublicConfig } from '@/lib/config/public';

export const dynamic = 'force-dynamic';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  const config = getPublicConfig(loadEnv());
  return <ConfigProvider value={config}>{children}</ConfigProvider>;
}
