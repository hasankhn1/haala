/**
 * Uniform API envelope. Every endpoint returns one of these shapes so the
 * apps can handle success/error the same way everywhere.
 */

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiErrorBody {
  ok: false;
  error: {
    code: string;
    message: string;
    /** Field-level validation issues, when applicable. */
    details?: Array<{ path: string; message: string }>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorBody;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Stable machine-readable error codes shared by server and clients. */
export const ErrorCode = {
  Validation: 'VALIDATION_ERROR',
  Unauthorized: 'UNAUTHORIZED',
  Forbidden: 'FORBIDDEN',
  NotFound: 'NOT_FOUND',
  Conflict: 'CONFLICT',
  RateLimited: 'RATE_LIMITED',
  Internal: 'INTERNAL_ERROR',
  PaymentFailed: 'PAYMENT_FAILED',
  OutOfStock: 'OUT_OF_STOCK',
  InvalidState: 'INVALID_STATE',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
