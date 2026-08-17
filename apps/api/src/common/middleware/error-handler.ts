import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ErrorCode, type ApiErrorBody } from '@haala/shared';
import { AppError } from '../errors';
import { logger } from '../logger';

/** Terminal error handler — must be mounted last, after all routes. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    const body: ApiErrorBody = {
      ok: false,
      error: { code: err.code, message: err.message, details: err.details },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ApiErrorBody = {
      ok: false,
      error: {
        code: ErrorCode.Validation,
        message: 'Validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    };
    res.status(422).json(body);
    return;
  }

  logger.error({ err, reqId: req.id }, 'Unhandled error');
  const body: ApiErrorBody = {
    ok: false,
    error: { code: ErrorCode.Internal, message: 'Something went wrong' },
  };
  res.status(500).json(body);
};
