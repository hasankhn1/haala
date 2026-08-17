import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

/** Assigns/propagates a request id for tracing and log correlation. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  req.id = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
};
