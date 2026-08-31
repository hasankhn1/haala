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
