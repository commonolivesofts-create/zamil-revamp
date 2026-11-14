// Implements: INTEGRATION §4 — the CSV / REST contracts of the inbound interfaces.
// Mock fixtures and live BIP output go through the same schemas, so a broken report fails loudly.
import { BUSINESS_UNITS, COA_SEGMENTS, parseSar } from '@expensehub/shared';
import { z } from 'zod';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT = /^-?\d+(\.\d{1,2})?$/;

const text = z.string().trim();
const required = text.min(1);
const optional = text.transform((s) => (s === '' ? null : s));
const flag = z.enum(['Y', 'N']);
const isoDate = text.regex(ISO_DATE, 'expected YYYY-MM-DD');
const optionalIsoDate = text
  .refine((s) => s === '' || ISO_DATE.test(s), 'expected YYYY-MM-DD')
  .transform((s) => (s === '' ? null : s));

function toFusionId(s: string): number {
  return Number(s);
}
const isFusionId = (s: string) => /^\d{1,18}$/.test(s) && Number.isSafeInteger(Number(s));
const fusionId = text.refine(isFusionId, 'expected a Fusion id').transform(toFusionId);
const optionalFusionId = text
  .refine((s) => s === '' || isFusionId(s), 'expected a Fusion id')
  .transform((s) => (s === '' ? null : toFusionId(s)));

const sar = text
  .regex(AMOUNT, 'expected an amount with ≤ 2 decimals')
  .transform((s) => parseSar(s));

/** INT-01/02/03 — EH_HCM_EMPLOYEES. */
export const hcmEmployeeCsv = z.object({
  PERSON_ID: fusionId,
  PERSON_NUMBER: required,
  FULL_NAME: required,
  EMAIL: optional,
  MOBILE: optional,
  ASSIGNMENT_ID: optionalFusionId,
  BU_CODE: z.enum(BUSINESS_UNITS),
  JOB_NAME: optional,
  LOCATION_CODE: optional,
  SUPERVISOR_PERSON_ID: optionalFusionId,
  DEFAULT_EXPENSE_ACCOUNT: optional,
  ACTIVE_FLAG: flag,
});
export type HcmEmployeeCsv = z.output<typeof hcmEmployeeCsv>;

/** INT-07 — EH_AP_EMPLOYEE_PAYEES (flags only, never bank details). */
export const apPayeeCsv = z.object({
  PERSON_ID: fusionId,
  SUPPLIER_NUMBER: optional,
  SUPPLIER_SITE: optional,
  BU_CODE: z.enum(BUSINESS_UNITS),
  SITE_ACTIVE_FLAG: flag,
  HAS_ACTIVE_BANK_FLAG: flag,
});
export type ApPayeeCsv = z.output<typeof apPayeeCsv>;

/** INT-04 — EH_GL_SEGMENT_VALUES. */
export const glSegmentValueCsv = z.object({
  SEGMENT: z.enum(COA_SEGMENTS),
  VALUE: required,
  DESCRIPTION: text,
  ENABLED_FLAG: flag,
  START_DATE: optionalIsoDate,
  END_DATE: optionalIsoDate,
});
export type GlSegmentValueCsv = z.output<typeof glSegmentValueCsv>;

/**
 * INT-05a — EH_HCM_BUSINESS_TRIPS. D-46: the report also returns every field of the business
 * leave request (ATTRIBUTE1…, ABSENCE_REASON, COMMENTS); the sync copies the one named by the
 * option TRIP_DESTINATION_FIELD into DESTINATION. Other extra columns are ignored.
 */
export const businessTripCsv = z.object({
  ABSENCE_ENTRY_ID: fusionId,
  PERSON_ID: fusionId,
  ABSENCE_TYPE: required,
  START_DATE: isoDate,
  END_DATE: isoDate,
  DURATION_DAYS: text.regex(/^\d+(\.\d)?$/, 'expected days').transform(Number),
  DESTINATION: text.optional().transform((s) => (s ? s : null)),
  APPROVAL_STATUS: required,
});
export type BusinessTripCsv = z.output<typeof businessTripCsv>;

/** INT-05b — EH_PAY_QUICK_PAYS. */
export const quickPayCsv = z.object({
  PAYROLL_ACTION_ID: fusionId,
  RUN_RESULT_ID: fusionId,
  PERSON_ID: fusionId,
  ELEMENT_NAME: required,
  PAY_VALUE: sar,
  EFFECTIVE_DATE: isoDate,
  BU_CODE: z.enum(BUSINESS_UNITS),
});
export type QuickPayCsv = z.output<typeof quickPayCsv>;

/** INT-09 — EH_AP_INVOICE_PAYMENTS [VERIFY source: AP_INVOICE_PAYMENTS_ALL / AP_CHECKS_ALL]. */
export const invoicePaymentCsv = z.object({
  INVOICE_ID: fusionId,
  PAYMENT_NUMBER: required,
  PAYMENT_DATE: isoDate,
  AMOUNT: sar,
  STATUS: required,
});
export type InvoicePaymentCsv = z.output<typeof invoicePaymentCsv>;

/** INT-06 — BIP EH_GL_DAILY_RATES (live: the REST resource cannot be filtered in the pod). */
export const glDailyRateCsv = z.object({
  FROM_CURRENCY: text.length(3),
  TO_CURRENCY: text.length(3),
  RATE_TYPE: required,
  RATE_DATE: isoDate,
  RATE: text.regex(/^\d+(\.\d{1,8})?$/, 'expected a rate with ≤ 8 decimals'),
});
export type GlDailyRateCsv = z.output<typeof glDailyRateCsv>;

/** INT-06 — REST currencyRates [VERIFY attribute names, INTEGRATION §4]. */
export const currencyRatesResponse = z.object({
  items: z.array(
    z.object({
      FromCurrency: z.string().length(3),
      ToCurrency: z.string().length(3),
      UserConversionType: z.string().min(1),
      ConversionDate: z.string().regex(ISO_DATE),
      ConversionRate: z.number().positive(),
    }),
  ),
  hasMore: z.boolean().optional(),
});
export type CurrencyRatesResponse = z.output<typeof currencyRatesResponse>;

export class ContractError extends Error {
  constructor(
    readonly source: string,
    readonly issues: string[],
  ) {
    super(`${source} does not match its contract:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ContractError';
  }
}

/** Validates every CSV row; reports file line numbers (header = line 1). */
export function parseRows<S extends z.ZodType>(
  schema: S,
  rows: unknown[],
  source: string,
): z.output<S>[] {
  const out: z.output<S>[] = [];
  const issues: string[] = [];
  rows.forEach((row, index) => {
    const result = schema.safeParse(row);
    if (result.success) out.push(result.data);
    else {
      for (const issue of result.error.issues) {
        issues.push(`line ${index + 2} ${issue.path.join('.')}: ${issue.message}`);
      }
    }
  });
  if (issues.length > 0) throw new ContractError(source, issues);
  return out;
}
