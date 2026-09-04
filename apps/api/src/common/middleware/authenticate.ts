import type { RequestHandler } from 'express';
import { verifyAccessToken } from '../jwt';
import { AppError } from '../errors';

/** Requires a valid Bearer access token; populates `req.auth`. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw AppError.unauthorized('Missing bearer token');
  }
  try {
    const payload = verifyAccessToken(header.slice(7));
    req.auth = {
      userId: payload.sub,
      role: payload.role,
      ...(payload.brandId ? { brandId: payload.brandId } : {}),
    };
    next();
  } catch {
    throw AppError.unauthorized('Invalid or expired token');
  }
};

/**
 * Populates `req.auth` when a valid token is present, and lets the request
 * through when it is not.
 *
 * For the routes a **guest** must be able to reach: the catalogue and the store
 * lookup. Phase 4 took the sign-in wall out of the customer app — "guests
 * browse, fill a basket, pick a store, and are asked for nothing until
 * checkout" — but the API kept `router.use(authenticate)` on both of those
 * routers, so browsing 401'd for anybody without an account. The client half of
 * that change shipped and the server half did not.
 *
 * **A bad token degrades to anonymous rather than failing.** On a public route
 * that is the useful behaviour: somebody whose access token expired while the
 * app was backgrounded should see the shop, not an error. Never use this where
 * the answer depends on who is asking — `authenticate` is still the only thing
 * that may guard those, precisely because it rejects.
 */
export const optionalAuthenticate: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const payload = verifyAccessToken(header.slice(7));
      req.auth = {
        userId: payload.sub,
        role: payload.role,
        ...(payload.brandId ? { brandId: payload.brandId } : {}),
      };
    } catch {
      // Deliberately ignored; see above. `req.auth` simply stays unset.
    }
  }
  next();
};
