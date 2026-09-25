import rateLimit from 'express-rate-limit';
import { ErrorCode, type ApiErrorBody } from '@haala/shared';
import { config } from '../../config';

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
  /*
   * Off under test, and only under test.
   *
   * The store is in-memory and keyed by IP, so every test file shares one
   * bucket from 127.0.0.1. Eight of them sign in — several in a loop — and the
   * suite had grown to sit exactly at this ceiling, so whichever test lost the
   * race failed, intermittently and for a reason that looks nothing like rate
   * limiting. Adding tests made it worse, which is the wrong incentive to have.
   *
   * This is the limiter's own `skip`, evaluated per request, so nothing about
   * the production path changes.
   */
  skip: () => config.env === 'test',
});

/** General API limiter. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: body,
});
