import type { AuthContext, AuthProvider } from './types';

const SYSTEM_CONTEXT: AuthContext = {
  user: { id: 'system', name: 'system' },
  roles: ['admin'],
  isSystem: true,
};

export const localAuth: AuthProvider = {
  async getContext(_req: Request): Promise<AuthContext> {
    return SYSTEM_CONTEXT;
  },
};
