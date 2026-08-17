import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ApiSuccess } from '@haala/shared';

/** Send a success envelope. */
export const sendSuccess = <T>(res: Response, data: T, status = 200): Response => {
  const body: ApiSuccess<T> = { ok: true, data };
  return res.status(status).json(body);
};

/**
 * Wraps an async route handler so rejected promises are forwarded to the
 * Express error handler instead of crashing the process.
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
