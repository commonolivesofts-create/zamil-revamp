// Implements: TRD §4.6 — one error type; HTTP status comes from the code (API §1).
import { ERROR_HTTP_STATUS, type ErrorCode } from '@expensehub/shared';

export class AppError extends Error {
  readonly httpStatus: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.httpStatus = ERROR_HTTP_STATUS[code];
  }
}
