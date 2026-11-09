// Gathers everything the policy engine needs for one expense line (FR-CAP-06 rate, FR-CAP-08
// account, FR-TRP-02 trip, FR-CAP-10 duplicates). D-45: limits are the expense type's own.
import {
  buildChargeAccount,
  evaluatePolicy,
  formatAccount,
  parseSar,
  segmentList,
  type ExpenseInput,
  type Halalas,
  type PolicyInput,
  type PolicyOutput,
} from '@expensehub/shared';
import type { EmployeeRow, ExpenseTypeRow, ReceiptRow } from '../../data/entities';
import type { Repos } from '../../data/ports';
import { AppError } from '../../lib/errors';
import { storedQr } from '../receipts/service';

function fieldError(path: string, message: string): AppError {
  return new AppError('VALIDATION', message, { issues: [{ path, message }] });
}

async function numberOption(r: Repos, key: string, employee: EmployeeRow, fallback: number) {
  const value = Number((await r.systemOptions.resolve(key, employee.businessUnit))?.optionValue);
  return Number.isFinite(value) ? value : fallback;
}

/** D-41: VAT is not recovered through ExpenseHub invoices unless VAT_RECOVERY = 'Y'. */
export async function vatRecoveryOn(r: Repos, employee: EmployeeRow) {
  return (
    (await r.systemOptions.resolve('VAT_RECOVERY', employee.businessUnit))?.optionValue === 'Y'
  );
}

export interface Evaluated {
  employee: EmployeeRow;
  type: ExpenseTypeRow;
  receipt: ReceiptRow | null;
  output: PolicyOutput;
  chargeAccount: string | null;
  segments: { segment: string; value: string; description: string | null; ok: boolean }[];
  /** D-41: option VAT_RECOVERY. */
  vatRecovery: boolean;
}

/**
 * Runs the shared policy engine with server-side context. `expenseId` = the line being edited
 * (its own receipt and duplicates are excluded).
 */
export async function evaluateExpense(
  r: Repos,
  personId: number,
  input: ExpenseInput,
  options: { today: string; expenseId?: number | null },
): Promise<Evaluated> {
  const employee = await r.employees.get(personId);
  if (!employee || employee.active !== 'Y')
    throw new AppError('FORBIDDEN', 'Your HCM assignment is not active.');

  const type = await r.expenseTypes.get(input.typeId);
  if (!type || type.active !== 'Y') throw fieldError('typeId', 'Choose an active expense type');

  // FR-TRP-02: only the employee's own approved trips.
  const trip = input.tripId ? await r.businessTrips.get(input.tripId) : undefined;
  if (input.tripId && (!trip || trip.personId !== personId || trip.approvalStatus !== 'APPROVED')) {
    throw fieldError('tripId', 'Choose one of your approved business trips');
  }
  if (input.quickPayId) {
    const qp = await r.quickPays.get(input.quickPayId);
    if (!qp || qp.personId !== personId)
      throw fieldError('quickPayId', 'Choose one of your Quick Pays');
  }

  let receipt: ReceiptRow | null = null;
  if (input.receiptId) {
    receipt = (await r.receipts.get(input.receiptId)) ?? null;
    const usable =
      receipt?.personId === personId &&
      (receipt.expenseId === null || receipt.expenseId === (options.expenseId ?? null));
    if (!usable) throw fieldError('receiptId', 'This receipt is not available');
  }

  const rateType =
    (await r.systemOptions.resolve('RATE_TYPE', employee.businessUnit))?.optionValue ?? 'Corporate';
  const rate =
    input.currency !== 'SAR'
      ? await r.rates.findLatest(input.currency, rateType, input.expenseDate)
      : undefined;

  // FR-CAP-08 / OQ-14 proposal.
  const account = buildChargeAccount({
    defaultAccount: employee.defaultExpenseAccount,
    naturalAccount: type.naturalAccount,
    costCenterOverride: input.costCenter,
  });
  const segments = account
    ? await Promise.all(
        segmentList(account).map(async (s) => {
          const value = await r.coaValues.get(s);
          return {
            ...s,
            description: value?.description ?? null,
            enabled: value ? value.enabled === 'Y' : null,
          };
        }),
      )
    : null;

  const qr = receipt ? storedQr(receipt) : null;
  const qrForPolicy = qr
    ? {
        valid: qr.result.valid,
        total: qr.result.fields.total && qr.result.valid ? parseSar(qr.result.fields.total) : null,
        vat: qr.result.fields.vat && qr.result.valid ? parseSar(qr.result.fields.vat) : null,
      }
    : null;

  const policyInput: PolicyInput = {
    today: options.today,
    expenseDate: input.expenseDate,
    type: {
      name: type.name,
      category: type.category,
      defaultLimitSar: type.defaultLimitSar,
      limitAction: type.limitAction,
      receiptOverSar: type.receiptOverSar,
      justificationReq: type.justificationReq === 'Y',
      attendeesReq: type.attendeesReq === 'Y',
      vatEligible: type.vatEligible === 'Y',
      unitRateSar: type.unitRateSar,
    },
    currency: input.currency,
    amount: input.amount ? parseSar(input.amount) : null,
    quantity: input.quantity ?? null,
    merchant: input.merchant ?? null,
    description: input.description ?? null,
    attendees: input.attendees ?? null,
    justification: input.justification ?? null,
    taxInvoice: input.taxInvoice,
    receipt: { attached: receipt !== null, qr: qrForPolicy },
    trip: trip
      ? {
          startDate: trip.startDate,
          endDate: trip.endDate,
          days: trip.days,
          destination: trip.destination,
        }
      : null,
    rate: rate ? { rate: rate.rate, rateDate: rate.rateDate } : null,
    account: segments,
    duplicates: { sameDetails: 0, sameReceipt: 0 },
    options: {
      vatRatePercent: await numberOption(r, 'VAT_RATE', employee, 15),
      rateStaleDays: await numberOption(r, 'RATE_STALE_DAYS', employee, 7),
      tripToleranceDays: await numberOption(r, 'TRIP_DATE_TOLERANCE_DAYS', employee, 1),
      vatRecovery: await vatRecoveryOn(r, employee),
    },
  };

  // FR-CAP-10 / D-23: duplicates need the SAR amount, so evaluate once, look, then finally.
  const first = evaluatePolicy(policyInput);
  const sameDetails =
    first.amountSar !== null && input.merchant
      ? (
          await r.expenses.findPossibleDuplicates({
            personId,
            merchant: input.merchant,
            amountSar: first.amountSar as Halalas,
            expenseDate: input.expenseDate,
            excludeExpenseId: options.expenseId ?? undefined,
          })
        ).length
      : 0;
  const sameReceipt = receipt
    ? (await r.expenses.findByReceiptHash(receipt.sha256)).filter(
        (e) => e.personId === personId && e.expenseId !== options.expenseId,
      ).length
    : 0;
  const output =
    sameDetails || sameReceipt
      ? evaluatePolicy({ ...policyInput, duplicates: { sameDetails, sameReceipt } })
      : first;

  return {
    employee,
    type,
    receipt,
    output,
    chargeAccount: account ? formatAccount(account) : null,
    segments: (segments ?? []).map((s) => ({
      segment: s.segment,
      value: s.value,
      description: s.description,
      ok: s.enabled === true,
    })),
    vatRecovery: policyInput.options.vatRecovery === true,
  };
}
