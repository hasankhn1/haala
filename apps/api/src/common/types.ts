import type { UserRole } from '@haala/shared';

/**
 * Augment Express' Request with the authenticated context and a request id.
 * `req.auth` is populated by the `authenticate` middleware.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string; role: UserRole };
      id?: string;
    }
  }
}

export {};
