import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@traininghub/shared';
import { AppError } from './lib/errors';
import { UniqueViolation } from './db/store';

export const CSRF_HEADER = 'X-Requested-With';
export const CSRF_VALUE = 'TrainingHub';
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export const requireAppHeader: RequestHandler = (req, _res, next) => {
  if (SAFE.has(req.method) || req.get(CSRF_HEADER) === CSRF_VALUE) return next();
  next(new AppError('FORBIDDEN', `Missing ${CSRF_HEADER} header`));
};

export const notFoundRoute: RequestHandler = (req, _res, next) =>
  next(new AppError('NOT_FOUND', `No route for ${req.method} ${req.path}`));

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  let e: AppError;
  if (err instanceof AppError) e = err;
  else if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const i of err.issues) fields[i.path.join('.') || '_'] ??= i.message;
    e = new AppError(
      'VALIDATION',
      err.issues[0]?.message ? `Check the form: ${err.issues[0].message}` : 'Validation failed',
      { fields },
    );
  } else if (err instanceof UniqueViolation) e = new AppError('INVALID_STATE', 'That record already exists');
  else if (err instanceof SyntaxError && (err as { type?: string }).type === 'entity.parse.failed')
    e = new AppError('VALIDATION', 'Malformed JSON body');
  else {
    req.log.error({ err }, 'unhandled error');
    e = new AppError('INTERNAL', 'Something went wrong. Please try again.');
  }
  if (e.httpStatus < 500) req.log.warn({ code: e.code }, e.message);
  const out: ApiErrorBody = {
    error: { code: e.code, message: e.message, ...(e.details !== undefined && { details: e.details }) },
  };
  res.status(e.httpStatus).json(out);
};
