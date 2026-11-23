// Small helpers shared by the create/update/delete routes.
import type { Request } from 'express';
import type { z } from 'zod';
import { AppError } from '../lib/errors';

/** Parses the JSON body; zod errors become 400 VALIDATION with field issues. */
export const body = <S extends z.ZodType>(schema: S, req: Request): z.infer<S> =>
  schema.parse(req.body ?? {});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A UUID route parameter; anything else is a 404 with the module's message. */
export function uuidParam(req: Request, notFoundMessage: string): string {
  const value = req.params.uuid;
  if (typeof value !== 'string' || !UUID.test(value))
    throw new AppError('NOT_FOUND', notFoundMessage);
  return value;
}

/** A positive integer route parameter. */
export function idParam(req: Request, notFoundMessage: string): number {
  const value = Number(req.params.id);
  if (!Number.isSafeInteger(value) || value < 1) throw new AppError('NOT_FOUND', notFoundMessage);
  return value;
}
