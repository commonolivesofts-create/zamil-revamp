// CSRF header guard, 404 and the error envelope (every error leaves as
// `{ error: { code, message, details? } }`).
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { CSRF_HEADER, CSRF_HEADER_VALUE, type ErrorEnvelope } from '@attendance/shared';
import { AppError } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const requireAppHeader: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method) || req.get(CSRF_HEADER) === CSRF_HEADER_VALUE) return next();
  next(new AppError('FORBIDDEN', `Missing ${CSRF_HEADER} header`));
};

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError('NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

function isBodyParseError(err: unknown): boolean {
  return err instanceof SyntaxError && (err as { type?: unknown }).type === 'entity.parse.failed';
}

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  let appError: AppError;
  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof ZodError) {
    appError = new AppError('VALIDATION', 'Request validation failed', {
      issues: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  } else if (isBodyParseError(err)) {
    appError = new AppError('VALIDATION', 'Malformed JSON body');
  } else {
    // Unexpected (e.g. ORA- errors): log the real error, return nothing internal.
    req.log.error({ err }, 'unhandled error');
    appError = new AppError('INTERNAL', 'Something went wrong. Please try again.');
  }
  if (appError.httpStatus < 500) req.log.warn({ code: appError.code }, appError.message);

  const body: ErrorEnvelope = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined && { details: appError.details }),
    },
  };
  res.status(appError.httpStatus).json(body);
};
