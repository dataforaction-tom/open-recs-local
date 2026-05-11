import type { Role } from '../../db/schema';
export type { Role };

export type AuthUser = {
  id: string;
  email?: string;
  name?: string;
};

export type AuthContext = {
  user: AuthUser;
  roles: Role[];
  isSystem: boolean;
};

export interface AuthProvider {
  getContext(req: Request): Promise<AuthContext>;
}
