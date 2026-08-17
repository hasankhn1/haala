import type { RequestHandler } from 'express';
import type { UserRole } from '@haala/shared';
import { AppError } from '../errors';

/**
 * Restricts a route to the given roles. Must run after `authenticate`.
 * `authorize()` with no roles just requires any authenticated user.
 */
export const authorize =
  (...roles: UserRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) throw AppError.unauthorized();
    if (roles.length > 0 && !roles.includes(req.auth.role)) {
      throw AppError.forbidden();
    }
    next();
  };
