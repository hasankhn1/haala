import type { Request, RequestHandler } from 'express';
import { HAALA_STAFF_ROLES, UserRole } from '@haala/shared';
import { AppError } from '../errors';

/**
 * Decides which brand the current request is allowed to act on.
 *
 * The single rule that matters: for a brand user the answer comes **only** from
 * the verified access token. The request body, params and query are never
 * consulted, so `POST /brand/products { brandId: "<someone else's>" }` cannot
 * move a row into another tenant — the field is not read, not merely rejected.
 *
 * Haala staff have no brand of their own, so they must name one explicitly with
 * `?brandId=`. That is deliberately not defaulted: an operator acting on "some
 * brand" without saying which is how the wrong catalogue gets edited.
 *
 * Must run after `authenticate`.
 */
export const brandScope: RequestHandler = (req, _res, next) => {
  const auth = req.auth;
  if (!auth) throw AppError.unauthorized();

  if (auth.role === UserRole.BrandUser) {
    // The CHECK constraint makes this unreachable from a well-formed database,
    // but a token minted before that constraint existed would land here.
    if (!auth.brandId) throw AppError.forbidden('This account is not attached to a brand');
    req.brandId = auth.brandId;
    return next();
  }

  if ((HAALA_STAFF_ROLES as readonly UserRole[]).includes(auth.role)) {
    const requested = req.query.brandId;
    if (typeof requested !== 'string' || requested.length === 0) {
      throw AppError.badRequest('Name the brand to act on with ?brandId=');
    }
    req.brandId = requested;
    return next();
  }

  throw AppError.forbidden();
};

/**
 * The resolved brand, as a plain `string` rather than `string | undefined`.
 *
 * Services take `brandId` as a required argument; this is the one place the
 * optional request field is narrowed, so a route that forgot `brandScope`
 * fails loudly here instead of quietly querying across every tenant.
 */
export function requireBrandId(req: Request): string {
  if (!req.brandId) {
    throw AppError.forbidden('No brand in scope for this request');
  }
  return req.brandId;
}
