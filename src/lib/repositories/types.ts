import type { AuthContext } from '../providers/auth/types';
import type { Db } from '../db/client';

export type RepoContext = {
  db: Db;
  auth: AuthContext;
};

export class AuthorizationError extends Error {
  constructor(message = 'not authorized') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}
