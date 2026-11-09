// Building blocks for API contracts (API §1: money as strings with ≤ 2 decimals).
import { z } from 'zod';

/** Non-negative SAR amount as typed by a user or sent by the API: "150", "150.5", "150.00". */
export const sarAmountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Enter an amount like 150 or 150.00');

/** Unit rate with up to 4 decimals (NUMBER(14,4)), e.g. mileage "0.7500". */
export const unitRateSchema = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,4})?$/, 'Enter a rate with up to 4 decimals');

export const isoDateSchema = z.iso.date();
export const versionSchema = z.number().int().positive();
export const timestampSchema = z.iso.datetime({ offset: true });

export function listOf<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item) });
}
