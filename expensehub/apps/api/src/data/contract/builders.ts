// Row builders for tests. Valid for any store (respect the Oracle FKs: employee, expense type).
import { parseSar, ZERO_SAR, type BusinessUnit } from '@expensehub/shared';
import type { EmployeeRow, PersonId } from '../entities';
import type { NewExpense, NewExpenseType, NewReport, Repos, WriteOptions } from '../ports';

export const SYSTEM: WriteOptions = { actorId: null };
export const SYNCED_AT = '2026-10-18T00:00:00.000Z';

export function employee(personId: PersonId, overrides: Partial<EmployeeRow> = {}): EmployeeRow {
  return {
    personId,
    personNumber: String(personId),
    fullName: `Person ${personId}`,
    fullNameAr: null,
    email: null,
    mobile: null,
    assignmentId: null,
    businessUnit: 'IPP',
    jobName: null,
    locationCode: null,
    costCenter: '127',
    supervisorId: null,
    defaultExpenseAccount: 'IPP.003.127.55251.000.000000',
    payeeOk: 'Y',
    supplierNumber: null,
    supplierSite: null,
    active: 'Y',
    syncedAt: SYNCED_AT,
    ...overrides,
  };
}

export function expenseType(
  typeCode: string,
  overrides: Partial<NewExpenseType> = {},
): NewExpenseType {
  return {
    typeCode,
    name: typeCode,
    nameAr: null,
    category: 'STANDARD',
    naturalAccount: '55290',
    defaultLimitSar: null,
    limitAction: 'WARN',
    receiptOverSar: ZERO_SAR,
    justificationReq: 'N',
    attendeesReq: 'N',
    vatEligible: 'Y',
    unit: null,
    unitRateSar: null,
    icon: 'receipt',
    sortOrder: 0,
    isPlaceholder: 'Y',
    active: 'Y',
    ...overrides,
  };
}

export function report(personId: PersonId, overrides: Partial<NewReport> = {}): NewReport {
  return {
    reportNumber: null,
    personId,
    businessUnit: 'IPP' as BusinessUnit,
    purpose: 'Client visit',
    reportDate: '2026-10-18',
    status: 'DRAFT',
    infoRequested: 'N',
    totalSar: ZERO_SAR,
    cashSar: ZERO_SAR,
    cardSar: ZERO_SAR,
    vatSar: ZERO_SAR,
    advanceAppliedSar: ZERO_SAR,
    netPayableSar: ZERO_SAR,
    auditSelected: 'N',
    submittedAt: null,
    approvedAt: null,
    releasedAt: null,
    fusionInvoiceId: null,
    fusionInvoiceNum: null,
    fusionStatus: null,
    paymentRef: null,
    paidAt: null,
    syncError: null,
    source: 'APP',
    ...overrides,
  };
}

export function expense(
  personId: PersonId,
  typeId: number,
  amount = '100.00',
  overrides: Partial<NewExpense> = {},
): NewExpense {
  const sar = parseSar(amount);
  return {
    personId,
    reportId: null,
    lineNo: null,
    expenseDate: '2026-10-12',
    typeId,
    merchant: 'Al Baik',
    description: 'Lunch with client',
    attendees: null,
    justification: null,
    quantity: null,
    unitRateSar: null,
    amount: sar,
    currency: 'SAR',
    fxRate: '1.00000000',
    fxRateDate: null,
    amountSar: sar,
    vatSar: ZERO_SAR,
    netSar: sar,
    approvedAmountSar: sar,
    adjustmentReason: null,
    taxInvoice: 'N',
    receiptRequired: 'N',
    receiptAttached: 'N',
    chargeAccount: 'IPP.003.127.55210.000.000000',
    costCenter: null,
    tripId: null,
    quickPayId: null,
    source: 'CASH',
    cardTxnId: null,
    receiptHash: null,
    policyLevel: 'PASS',
    ...overrides,
  };
}

/** Claimant 1, approver 2 and one expense type — enough for most tests. */
export async function basics(r: Repos) {
  await r.employees.upsert(employee(1));
  await r.employees.upsert(employee(2));
  const type = await r.expenseTypes.insert(expenseType('MEALS'), SYSTEM);
  return { claimant: 1, approver: 2, typeId: type.typeId };
}
