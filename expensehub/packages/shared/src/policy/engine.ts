// Implements: FR-POL-01…03, FR-POL-05, FR-CAP-04…08, FR-CAP-10, FR-TRP-02. D-45: no grade limits,
// no per diem (paid by Quick Pay).
// One pure function, run by the API (authoritative on save) and for the live checklist (FR-POL-02).
// The caller gathers the context (type, limits, rate, COA, trip, duplicates); nothing here does I/O.
import { convertToSar, multiplyRate, vatFromGross, withinTolerance } from '../calc';
import { formatSar, type Halalas } from '../money';
import type { CoaSegment, ExpenseCategory, LimitAction } from '../reference';
import type { PolicyLevel } from '../status';

export const POLICY_RULES = [
  'DETAILS',
  'DATE',
  'FX_RATE',
  'AMOUNT',
  'LIMIT',
  'RECEIPT',
  'VAT',
  'QR_TOTAL',
  'JUSTIFICATION',
  'ATTENDEES',
  'ACCOUNT',
  'TRIP',
  'DUPLICATE',
] as const;
export type PolicyRule = (typeof POLICY_RULES)[number];

export interface RuleResult {
  rule: PolicyRule;
  level: PolicyLevel;
  message: string;
}

export interface PolicyType {
  name: string;
  category: ExpenseCategory;
  defaultLimitSar: Halalas | null;
  limitAction: LimitAction;
  /** Receipt required above; 0 = always; null = never. */
  receiptOverSar: Halalas | null;
  justificationReq: boolean;
  attendeesReq: boolean;
  vatEligible: boolean;
  /** Mileage rate per km, ≤ 4 decimals. */
  unitRateSar: string | null;
}

export interface PolicyInput {
  /** Riyadh business date. */
  today: string;
  expenseDate: string;
  type: PolicyType;
  currency: string;
  /** Original-currency amount (STANDARD only). */
  amount: Halalas | null;
  /** km for mileage (≤ 2 decimals). */
  quantity: string | null;
  merchant: string | null;
  description: string | null;
  attendees: string | null;
  justification: string | null;
  taxInvoice: boolean;
  receipt: {
    attached: boolean;
    /** ZATCA QR read from the receipt (null = none found). */
    qr: { valid: boolean; total: Halalas | null; vat: Halalas | null } | null;
  };
  trip: {
    startDate: string;
    endDate: string;
    days: number;
    destination: string | null;
  } | null;
  /** Latest corporate rate on or before the date; null when missing (ignored for SAR). */
  rate: { rate: string; rateDate: string } | null;
  /** null = no default account in HCM (prerequisite). */
  account:
    | { segment: CoaSegment; value: string; enabled: boolean | null; description: string | null }[]
    | null;
  duplicates: { sameDetails: number; sameReceipt: number };
  options: {
    vatRatePercent: number;
    rateStaleDays: number;
    tripToleranceDays: number;
    /** D-41: VAT is not recovered through ExpenseHub invoices (default on only for old callers). */
    vatRecovery?: boolean;
  };
}

export interface PolicyOutput {
  amountSar: Halalas | null;
  vatSar: Halalas;
  netSar: Halalas | null;
  /** "1.00000000" for SAR. */
  fxRate: string | null;
  fxRateDate: string | null;
  /** Mileage km used for the amount. */
  quantity: string | null;
  /** Mileage SAR/km. */
  unitRateSar: string | null;
  receiptRequired: boolean;
  results: RuleResult[];
  /** Worst level (PASS < WARN < BLOCK). */
  level: PolicyLevel;
}

const RANK: Record<PolicyLevel, number> = { PASS: 0, WARN: 1, BLOCK: 2 };
const sar = (h: Halalas) => formatSarLabel(h);

/** "SAR 1,840.00" */
export function formatSarLabel(h: Halalas): string {
  const [whole, fraction] = formatSar(h).replace('-', '').split('.');
  return `${h < 0 ? '-' : ''}SAR ${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function evaluatePolicy(input: PolicyInput): PolicyOutput {
  const { type, options } = input;
  const results: RuleResult[] = [];
  const add = (rule: PolicyRule, level: PolicyLevel, message: string) =>
    results.push({ rule, level, message });

  // ─── Required details (FR-CAP-01) ───────────────────────────────────────
  const missing: string[] = [];
  if (!input.description?.trim()) missing.push('business purpose');
  if (type.category === 'STANDARD') {
    if (!input.merchant?.trim()) missing.push('merchant');
    if (input.amount === null) missing.push('amount');
  }
  if (type.category === 'MILEAGE' && !input.quantity) missing.push('kilometres');
  if (missing.length) add('DETAILS', 'BLOCK', `Enter the ${missing.join(', ')}.`);

  // ─── Date ───────────────────────────────────────────────────────────────
  if (input.expenseDate > input.today) add('DATE', 'BLOCK', 'The expense date is in the future.');

  // ─── Amount in SAR (FR-CAP-05/06) ───────────────────────────────────────
  let amountSar: Halalas | null = null;
  let fxRate: string | null = null;
  let fxRateDate: string | null = null;
  let quantity: string | null = null;
  let unitRateSar: string | null = null;

  if (type.category === 'MILEAGE') {
    if (input.currency !== 'SAR') add('AMOUNT', 'BLOCK', `${type.name} is paid in SAR.`);
    fxRate = '1.00000000';
  }

  if (type.category === 'STANDARD' && input.amount !== null) {
    if (input.amount <= 0) add('AMOUNT', 'BLOCK', 'The amount must be more than zero.');
    if (input.currency === 'SAR') {
      amountSar = input.amount;
      fxRate = '1.00000000';
    } else if (!input.rate) {
      add(
        'FX_RATE',
        'BLOCK',
        `No ${input.currency} rate from Oracle Fusion on or before ${input.expenseDate}.`,
      );
    } else {
      amountSar = convertToSar(input.amount, input.rate.rate);
      fxRate = input.rate.rate;
      fxRateDate = input.rate.rateDate;
      const age = daysBetween(input.rate.rateDate, input.expenseDate);
      const rateText = `${Number(input.rate.rate)} ${input.currency}→SAR from ${input.rate.rateDate}`;
      if (age > options.rateStaleDays) {
        add(
          'FX_RATE',
          'WARN',
          `The latest rate is ${age} days older than the expense (${rateText}).`,
        );
      } else {
        add('FX_RATE', 'PASS', `Rate ${rateText}.`);
      }
    }
  } else if (type.category === 'MILEAGE' && input.quantity) {
    if (!type.unitRateSar) {
      add('AMOUNT', 'BLOCK', 'No mileage rate is set for this expense type.');
    } else {
      quantity = input.quantity;
      unitRateSar = type.unitRateSar;
      amountSar = multiplyRate(input.quantity, type.unitRateSar);
      if (amountSar <= 0) add('AMOUNT', 'BLOCK', 'Enter the kilometres driven.');
      else
        add(
          'AMOUNT',
          'PASS',
          `${input.quantity} km × SAR ${Number(type.unitRateSar).toFixed(2)} = ${sar(amountSar)}.`,
        );
    }
  }

  // ─── Limit (FR-POL-01/03; D-45: the expense type's limit — no grade limits) ─
  if (amountSar !== null) {
    const limit = type.defaultLimitSar;
    if (limit !== null) {
      const whose = `${type.name} limit`;
      if (amountSar > limit) {
        const block = type.limitAction === 'BLOCK';
        add(
          'LIMIT',
          block ? 'BLOCK' : 'WARN',
          `${whose} is ${sar(limit)} — you entered ${sar(amountSar)} ${block ? '(not allowed)' : '(warning, report will be audited)'}.`,
        );
      } else {
        add(
          'LIMIT',
          'PASS',
          `Within the ${whose.charAt(0).toLowerCase()}${whose.slice(1)} of ${sar(limit)}.`,
        );
      }
    }
  }

  // ─── Receipt (FR-POL-01; missing receipt → audit, FR-AUD-01) ───────────
  const receiptRequired =
    type.receiptOverSar !== null && amountSar !== null && amountSar > type.receiptOverSar;
  if (receiptRequired) {
    if (input.receipt.attached) add('RECEIPT', 'PASS', 'Receipt attached.');
    else {
      const when =
        type.receiptOverSar === 0 ? 'always needed' : `needed above ${sar(type.receiptOverSar!)}`;
      add('RECEIPT', 'WARN', `A receipt is ${when} — attach it, or the report will be audited.`);
    }
  }

  // ─── VAT (FR-CAP-04/07, D-22) — only when VAT recovery is on (D-41: off) ──
  let vatSar = 0 as Halalas;
  if (options.vatRecovery === false) {
    // D-41: no VAT on the invoices. A valid ZATCA QR still guards against a mistyped amount.
    const qr = input.receipt.qr;
    if (
      type.vatEligible &&
      input.taxInvoice &&
      qr?.valid &&
      qr.total !== null &&
      amountSar !== null &&
      input.currency === 'SAR' &&
      !withinTolerance(qr.total, amountSar, 5)
    ) {
      add('QR_TOTAL', 'WARN', `The amount differs from the invoice total of ${sar(qr.total)}.`);
    }
  } else if (
    type.vatEligible &&
    input.taxInvoice &&
    amountSar !== null &&
    input.currency === 'SAR'
  ) {
    const qr = input.receipt.qr;
    if (!qr || !qr.valid) {
      add(
        'VAT',
        'WARN',
        qr
          ? 'The ZATCA QR is invalid — VAT is not recoverable.'
          : 'No ZATCA QR on the receipt — VAT is not recoverable.',
      );
    } else if (qr.total !== null && !withinTolerance(qr.total, amountSar, 5)) {
      vatSar = vatFromGross(amountSar, options.vatRatePercent);
      add('QR_TOTAL', 'WARN', `The amount differs from the invoice total of ${sar(qr.total)}.`);
      add('VAT', 'PASS', `Recoverable VAT ${sar(vatSar)} (calculated).`);
    } else {
      vatSar = qr.vat ?? vatFromGross(amountSar, options.vatRatePercent);
      add('VAT', 'PASS', `Recoverable VAT ${sar(vatSar)} from the ZATCA QR.`);
    }
  }

  // ─── Justification / attendees (FR-POL-01) ─────────────────────────────
  if (type.justificationReq && !input.justification?.trim()) {
    add('JUSTIFICATION', 'BLOCK', `${type.name} needs a justification.`);
  }
  if (type.attendeesReq && !input.attendees?.trim()) {
    add('ATTENDEES', 'BLOCK', `${type.name} needs the attendees.`);
  }

  // ─── Charge account (FR-CAP-08, FR-POL-05) ─────────────────────────────
  if (!input.account) {
    add('ACCOUNT', 'BLOCK', 'Your default expense account is missing in Oracle HCM. Contact HR.');
  } else {
    const bad = input.account.filter((s) => s.enabled !== true);
    if (bad.length) {
      add(
        'ACCOUNT',
        'BLOCK',
        `Charge account: ${bad.map((s) => `${s.segment.toLowerCase().replace('_', ' ')} ${s.value} ${s.enabled === false ? 'is disabled' : 'does not exist'}`).join('; ')}.`,
      );
    } else {
      add('ACCOUNT', 'PASS', `Charged to ${input.account.map((s) => s.value).join('.')}.`);
    }
  }

  // ─── Business trip dates (FR-TRP-02) ───────────────────────────────────
  if (input.trip) {
    const tol = options.tripToleranceDays;
    const before = daysBetween(input.expenseDate, input.trip.startDate);
    const after = daysBetween(input.trip.endDate, input.expenseDate);
    if (before > tol || after > tol) {
      add(
        'TRIP',
        'WARN',
        `The expense date is outside the trip (${input.trip.startDate} – ${input.trip.endDate}).`,
      );
    } else {
      add(
        'TRIP',
        'PASS',
        `Within the trip${input.trip.destination ? ` to ${input.trip.destination}` : ''}.`,
      );
    }
  }

  // ─── Duplicates (FR-CAP-10, D-23) — warn, never block ──────────────────
  if (input.duplicates.sameReceipt > 0) {
    add('DUPLICATE', 'WARN', 'This receipt image is already on another expense.');
  } else if (input.duplicates.sameDetails > 0) {
    add('DUPLICATE', 'WARN', 'An expense with the same merchant, amount and date already exists.');
  }

  const level = results.reduce<PolicyLevel>(
    (worst, r) => (RANK[r.level] > RANK[worst] ? r.level : worst),
    'PASS',
  );
  return {
    amountSar,
    vatSar,
    netSar: amountSar === null ? null : ((amountSar - vatSar) as Halalas),
    fxRate,
    fxRateDate,
    quantity,
    unitRateSar,
    receiptRequired,
    results,
    level,
  };
}
