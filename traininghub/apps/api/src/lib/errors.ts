import { ERROR_HTTP_STATUS, type ErrorCode } from '@traininghub/shared';

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
export const notFound = (what: string) => new AppError('NOT_FOUND', `${what} not found`);
export const forbidden = (msg = 'You do not have access to this') => new AppError('FORBIDDEN', msg);
export const invalid = (msg: string, details?: unknown) => new AppError('INVALID_STATE', msg, details);
export const validation = (msg: string, fields?: Record<string, string | string[]>) =>
  new AppError('VALIDATION', msg, fields ? { fields } : undefined);
