'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { PublicConfig } from './public';

const ConfigContext = createContext<PublicConfig | null>(null);

export function ConfigProvider({
  value,
  children,
}: {
  value: PublicConfig;
  children: ReactNode;
}) {
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig(): PublicConfig {
  const config = useContext(ConfigContext);
  if (!config) {
    throw new Error('useConfig must be used inside a <ConfigProvider>');
  }
  return config;
}
