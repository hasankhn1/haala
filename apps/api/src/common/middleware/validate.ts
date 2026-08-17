import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates and coerces request parts against zod schemas. Parsed values
 * replace the raw ones, so handlers receive typed, trusted input.
 * ZodErrors bubble to the error handler → 422 with field details.
 */
export const validate =
  (schemas: ValidationSchemas): RequestHandler =>
  (req, _res, next) => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) Object.assign(req.query, schemas.query.parse(req.query));
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
