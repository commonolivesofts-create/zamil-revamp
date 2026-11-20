import { ERROR_HTTP_STATUS, type ErrorCode } from '@attendance/shared';

/** An expected failure that leaves the API as the shared error envelope. */
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
