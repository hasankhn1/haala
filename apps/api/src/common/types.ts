import type { UserRole } from '@haala/shared';

/**
 * Augment Express' Request with the authenticated context and a request id.
 * `req.auth` is populated by the `authenticate` middleware.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { userId: string; role: UserRole; brandId?: string };
      /**
       * The brand the current request acts on, resolved by `brandScope`.
       * Present only on brand-scoped routes, and always trusted over anything
       * in the request body or params.
       */
      brandId?: string;
      id?: string;
    }
  }
}

export {};
