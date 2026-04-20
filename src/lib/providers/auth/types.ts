export type Role = 'admin' | 'editor' | 'viewer';

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
