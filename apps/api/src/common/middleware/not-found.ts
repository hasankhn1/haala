import type { RequestHandler } from 'express';
import { AppError } from '../errors';

/** Catch-all for unmatched routes — mounted after all module routers. */
export const notFound: RequestHandler = (req) => {
  throw AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`);
};
