import rateLimit from 'express-rate-limit';
import { ErrorCode, type ApiErrorBody } from '@haala/shared';

const body: ApiErrorBody = {
  ok: false,
  error: { code: ErrorCode.RateLimited, message: 'Too many requests, please slow down' },
};

/** Tight limiter for auth endpoints (brute-force protection). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: body,
});

/** General API limiter. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: body,
});
