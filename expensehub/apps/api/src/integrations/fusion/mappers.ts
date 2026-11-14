// Implements: INTEGRATION §4 column mappings — Fusion contract rows → mirror rows (D-07).
// Used by the dev seed now and by the sync jobs from M3, in mock and live mode alike.
import type {
  BusinessTripRow,
  CoaValueRow,
  EmployeeRow,
  IsoTimestamp,
  RateRow,
} from '../../data/entities';
import type { NewQuickPay } from '../../data/ports';
import type {
  ApPayeeCsv,
  BusinessTripCsv,
  CurrencyRatesResponse,
  GlSegmentValueCsv,
  HcmEmployeeCsv,
  QuickPayCsv,
} from './contracts';

/** COST_CENTER is segment 3 of the default account (D-12). */
function costCenterOf(account: string | null): string | null {
  return account?.split('.')[2] ?? null;
}

/**
 * INT-01/02/03 + INT-07. payee_ok = supplier + active site for the employee's BU + active bank.
 */
export function toEmployees(
  employees: HcmEmployeeCsv[],
  payees: ApPayeeCsv[],
  syncedAt: IsoTimestamp,
): EmployeeRow[] {
  return employees.map((e) => {
    const payee = payees.find((p) => p.PERSON_ID === e.PERSON_ID && p.BU_CODE === e.BU_CODE);
    const payeeOk =
      payee !== undefined &&
      payee.SUPPLIER_NUMBER !== null &&
      payee.SITE_ACTIVE_FLAG === 'Y' &&
      payee.HAS_ACTIVE_BANK_FLAG === 'Y';
    return {
      personId: e.PERSON_ID,
      personNumber: e.PERSON_NUMBER,
      fullName: e.FULL_NAME,
      fullNameAr: null,
      email: e.EMAIL,
      mobile: e.MOBILE,
      assignmentId: e.ASSIGNMENT_ID,
      businessUnit: e.BU_CODE,
      jobName: e.JOB_NAME,
      locationCode: e.LOCATION_CODE,
      costCenter: costCenterOf(e.DEFAULT_EXPENSE_ACCOUNT),
      supervisorId: e.SUPERVISOR_PERSON_ID,
      defaultExpenseAccount: e.DEFAULT_EXPENSE_ACCOUNT,
      payeeOk: payeeOk ? 'Y' : 'N',
      supplierNumber: payee?.SUPPLIER_NUMBER ?? null,
      supplierSite: payee?.SUPPLIER_SITE ?? null,
      active: e.ACTIVE_FLAG,
      syncedAt,
    };
  });
}

/** INT-04. */
export function toCoaValues(rows: GlSegmentValueCsv[], syncedAt: IsoTimestamp): CoaValueRow[] {
  return rows.map((r) => ({
    segment: r.SEGMENT,
    value: r.VALUE,
    description: r.DESCRIPTION,
    enabled: r.ENABLED_FLAG,
    startDate: r.START_DATE,
    endDate: r.END_DATE,
    syncedAt,
  }));
}

/** D-46: Business Leave request in the test pod — ATTRIBUTE3 = city, ATTRIBUTE2 = country. */
export const DEFAULT_TRIP_DESTINATION_FIELD = 'ATTRIBUTE3,ATTRIBUTE2';

/**
 * D-46: the trips report returns every field of the business leave request; DESTINATION is
 * built from the field(s) named by TRIP_DESTINATION_FIELD, joined with ", " (e.g.
 * "Riyadh, Saudi Arabia"). A field the report does not have is a setup mistake, so this throws
 * instead of blanking every destination.
 */
export function withDestination(
  rows: Record<string, string>[],
  field: string,
): Record<string, string>[] {
  const fields = field
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);
  if (fields.length === 1 && fields[0] === 'DESTINATION') return rows;
  const missing = rows.length > 0 ? fields.filter((f) => !(f in rows[0]!)) : [];
  if (missing.length > 0) {
    throw new Error(
      `TRIP_DESTINATION_FIELD is ${field}, but EH_HCM_BUSINESS_TRIPS has no column ${missing.join(', ')}.`,
    );
  }
  return rows.map((row) => ({
    ...row,
    DESTINATION: [...new Set(fields.map((f) => row[f]?.trim()).filter(Boolean))].join(', '),
  }));
}

/** INT-05a. */
export function toBusinessTrips(
  rows: BusinessTripCsv[],
  syncedAt: IsoTimestamp,
): BusinessTripRow[] {
  return rows.map((r) => ({
    tripId: r.ABSENCE_ENTRY_ID,
    personId: r.PERSON_ID,
    absenceType: r.ABSENCE_TYPE,
    startDate: r.START_DATE,
    endDate: r.END_DATE,
    days: r.DURATION_DAYS,
    destination: r.DESTINATION,
    approvalStatus: r.APPROVAL_STATUS,
    syncedAt,
  }));
}

/** INT-05b. */
export function toQuickPays(rows: QuickPayCsv[], syncedAt: IsoTimestamp): NewQuickPay[] {
  return rows.map((r) => ({
    payrollActionId: r.PAYROLL_ACTION_ID,
    runResultId: r.RUN_RESULT_ID,
    personId: r.PERSON_ID,
    elementName: r.ELEMENT_NAME,
    amountSar: r.PAY_VALUE,
    effectiveDate: r.EFFECTIVE_DATE,
    businessUnit: r.BU_CODE,
    syncedAt,
  }));
}

/** INT-06. Rates kept as exact 8-decimal strings (NUMBER(18,8)). */
export function toRates(response: CurrencyRatesResponse, syncedAt: IsoTimestamp): RateRow[] {
  return response.items.map((i) => ({
    fromCcy: i.FromCurrency,
    toCcy: i.ToCurrency,
    rateType: i.UserConversionType,
    rateDate: i.ConversionDate,
    rate: i.ConversionRate.toFixed(8),
    syncedAt,
  }));
}
