// Implements: TRD §5 CSRF — mutating requests must carry `X-Requested-With: ExpenseHub`.
import type { RequestHandler } from 'express';
import { CSRF_HEADER, CSRF_HEADER_VALUE } from '@expensehub/shared';
import { AppError } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const requireAppHeader: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method) || req.get(CSRF_HEADER) === CSRF_HEADER_VALUE) {
    next();
    return;
  }
  next(new AppError('FORBIDDEN', `Missing ${CSRF_HEADER} header`));
};
