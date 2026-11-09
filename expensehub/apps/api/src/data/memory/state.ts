// Memory-store state: one plain JSON-serialisable object, persisted to storage/dev-data.json.

export const SCHEMA_VERSION = 1;

/** Memory table → Oracle table (DRD). The DDL coverage test checks every name exists. */
export const TABLES = {
  employees: 'EH_EMPLOYEES',
  coaValues: 'EH_COA_VALUES',
  businessTrips: 'EH_BUSINESS_TRIPS',
  quickPays: 'EH_QUICK_PAYS',
  rates: 'EH_RATES',
  users: 'EH_USERS',
  roleAssignments: 'EH_ROLE_ASSIGNMENTS',
  expenseTypes: 'EH_EXPENSE_TYPES',
  systemOptions: 'EH_SYSTEM_OPTIONS',
  approvalRules: 'EH_APPROVAL_RULES',
  auditRules: 'EH_AUDIT_RULES',
  delegations: 'EH_DELEGATIONS',
  reports: 'EH_REPORTS',
  expenses: 'EH_EXPENSES',
  policyViolations: 'EH_POLICY_VIOLATIONS',
  receipts: 'EH_RECEIPTS',
  approvalSteps: 'EH_APPROVAL_STEPS',
  audits: 'EH_AUDIT',
  quickPayInvoices: 'EH_QUICK_PAY_INVOICES',
  advances: 'EH_ADVANCES',
  advanceApplications: 'EH_ADVANCE_APPLICATIONS',
  cardTransactions: 'EH_CARD_TRANSACTIONS',
  reportHistory: 'EH_REPORT_HISTORY',
  setupHistory: 'EH_SETUP_HISTORY',
  integrationLog: 'EH_INTEGRATION_LOG',
  jobRuns: 'EH_JOB_RUNS',
  notifications: 'EH_NOTIFICATIONS',
} as const;
export type TableName = keyof typeof TABLES;

/** Oracle tables with no memory collection (sequences live in `sequences`). */
export const ORACLE_ONLY_TABLES = ['EH_DOC_SEQUENCES', 'EH_SCHEMA_MIGRATIONS'] as const;

export interface MemoryState {
  schemaVersion: number;
  createdAt: string;
  /** Identity counters ("identity:<table>") and document sequences ("doc:<name>"). */
  sequences: Record<string, number>;
  tables: Record<TableName, Record<string, unknown>>;
}

export function emptyState(createdAt: string): MemoryState {
  const tables = Object.fromEntries(Object.keys(TABLES).map((name) => [name, {}])) as Record<
    TableName,
    Record<string, unknown>
  >;
  return { schemaVersion: SCHEMA_VERSION, createdAt, sequences: {}, tables };
}
