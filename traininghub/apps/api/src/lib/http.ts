import type { Request } from 'express';
import type { z } from 'zod';
import { AppError } from './errors';

export const parse = <S extends z.ZodType>(schema: S, value: unknown): z.infer<S> => schema.parse(value);
export const body = <S extends z.ZodType>(schema: S, req: Request): z.infer<S> =>
  schema.parse(req.body ?? {});
export function intParam(req: Request, name: string): number {
  const v = Number(req.params[name]);
  if (!Number.isSafeInteger(v) || v <= 0) throw new AppError('VALIDATION', `Invalid ${name}`);
  return v;
}
export const q = (req: Request, name: string) =>
  typeof req.query[name] === 'string' ? (req.query[name] as string) : '';
