import type { Env } from '../env';

export type Features = {
  auth: boolean;
  ownership: boolean;
  admin: boolean;
};

export type PublicConfig = {
  appMode: 'local' | 'hosted';
  features: Features;
};

/**
 * Server-side: derive the public client config from validated env. This is the
 * one place mode → feature flags is decided. The result is shipped to the
 * browser via <ConfigProvider>; nothing else env-shaped should leak to the
 * client.
 */
export function getPublicConfig(env: Env): PublicConfig {
  if (env.APP_MODE === 'hosted') {
    return {
      appMode: 'hosted',
      features: { auth: true, ownership: true, admin: true },
    };
  }
  return {
    appMode: 'local',
    features: { auth: false, ownership: false, admin: false },
  };
}
