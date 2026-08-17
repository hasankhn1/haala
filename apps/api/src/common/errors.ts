import { ErrorCode } from '@haala/shared';

export interface ErrorDetail {
  path: string;
  message: string;
}

/**
 * Operational error with an HTTP status + stable machine code. Anything thrown
 * that is NOT an AppError is treated as a 500 by the error handler.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(message = 'Bad request', details?: ErrorDetail[]) {
    return new AppError(400, ErrorCode.Validation, message, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new AppError(401, ErrorCode.Unauthorized, message);
  }
  static forbidden(message = 'You do not have access to this resource') {
    return new AppError(403, ErrorCode.Forbidden, message);
  }
  static notFound(message = 'Resource not found') {
    return new AppError(404, ErrorCode.NotFound, message);
  }
  static conflict(message = 'Resource conflict') {
    return new AppError(409, ErrorCode.Conflict, message);
  }
  static invalidState(message = 'Operation not allowed in the current state') {
    return new AppError(409, ErrorCode.InvalidState, message);
  }
  static outOfStock(message = 'One or more items are out of stock') {
    return new AppError(409, ErrorCode.OutOfStock, message);
  }
  static paymentFailed(message = 'Payment could not be processed') {
    return new AppError(402, ErrorCode.PaymentFailed, message);
  }
  static validation(message = 'Validation failed', details?: ErrorDetail[]) {
    return new AppError(422, ErrorCode.Validation, message, details);
  }
  static internal(message = 'Something went wrong') {
    return new AppError(500, ErrorCode.Internal, message);
  }
  static notImplemented(message = 'Not implemented yet', details?: ErrorDetail[]) {
    return new AppError(501, 'NOT_IMPLEMENTED', message, details);
  }
}
