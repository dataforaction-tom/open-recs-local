import { redirect } from 'next/navigation';
import { loadEnv } from '@/lib/env';
import { getPublicConfig } from '@/lib/config/public';

export const dynamic = 'force-dynamic';

export default function RootPage() {
  const config = getPublicConfig(loadEnv());
  if (config.appMode === 'hosted') redirect('/landing');
  redirect('/dashboard');
}
