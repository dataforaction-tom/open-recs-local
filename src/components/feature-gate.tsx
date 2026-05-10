'use client';

import type { ReactNode } from 'react';
import { useConfig } from '@/lib/config/provider';
import type { Features } from '@/lib/config/public';

export function FeatureGate({
  feature,
  children,
}: {
  feature: keyof Features;
  children: ReactNode;
}) {
  const config = useConfig();
  if (!config.features[feature]) return null;
  return <>{children}</>;
}
