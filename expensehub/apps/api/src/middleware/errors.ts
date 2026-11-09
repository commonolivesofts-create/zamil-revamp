// Implements: TRD §4.6, API §1 — every error leaves as `{ error: { code, message, details } }`.
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ErrorEnvelope } from '@expensehub/shared';
import { AppError } from '../lib/errors';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError('NOT_FOUND', `No route for ${req.method} ${req.path}`));
};

function isBodyParseError(err: unknown): boolean {
  return (
    err instanceof SyntaxError &&
    typeof (err as { status?: unknown }).status === 'number' &&
    (err as { type?: unknown }).type === 'entity.parse.failed'
  );
}

export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  let appError: AppError;
  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof ZodError) {
    appError = new AppError('VALIDATION', 'Request validation failed', {
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  } else if (isBodyParseError(err)) {
    appError = new AppError('VALIDATION', 'Malformed JSON body');
  } else if (err instanceof Error && err.name === 'MulterError') {
    const code = (err as Error & { code?: string }).code;
    appError = new AppError(
      'VALIDATION',
      code === 'LIMIT_FILE_SIZE'
        ? 'The file is too large (maximum 10 MB).'
        : 'Upload one receipt file.',
    );
  } else {
    // Unexpected: log the real error, return nothing internal to the client.
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
