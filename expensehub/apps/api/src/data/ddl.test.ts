// The Oracle DDL (design deliverable, D-33) must stay in step with the TypeScript model:
// every memory table exists, and every enum CHECK list equals its packages/shared constant.
import {
  ADVANCE_STATUSES,
  APPROVAL_CHAINS,
  ASSIGNABLE_ROLES,
  AUDIT_OUTCOMES,
  AUDIT_RULE_CODES,
  BUSINESS_UNITS,
  CARD_TXN_STATUSES,
  COA_SEGMENTS,
  EXPENSE_CATEGORIES,
  HISTORY_ENTITY_TYPES,
  INTEGRATION_LOG_STATUSES,
  INTERFACE_CODES,
  JOB_RUN_STATUSES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  POLICY_LEVELS,
  QUICK_PAY_INVOICE_STATUSES,
  REPORT_STATUSES,
  STEP_STATUSES,
  VIOLATION_LEVELS,
} from '@expensehub/shared';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../paths';
import { ORACLE_ONLY_TABLES, TABLES } from './memory/state';

const MIGRATIONS = path.join(REPO_ROOT, 'db', 'migrations');
const sql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(path.join(MIGRATIONS, f), 'utf8'))
  .join('\n');

const createdTables = new Set(
  [...sql.matchAll(/CREATE TABLE (\w+)/gi)].map((m) => m[1]!.toUpperCase()),
);

function checkList(constraint: string): string[] {
  const match = new RegExp(`CONSTRAINT ${constraint} CHECK \\(\\w+ IN \\(([^)]*)\\)\\)`, 'i').exec(
    sql,
  );
  if (!match) throw new Error(`CHECK constraint ${constraint} not found in db/migrations`);
  return match[1]!.split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
}

describe('Oracle DDL ↔ TypeScript model', () => {
  it('has migration files numbered in order', () => {
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThanOrEqual(6);
    files.forEach((f, i) => expect(f.startsWith(String(i + 1).padStart(3, '0'))).toBe(true));
  });

  it('creates a table for every memory collection', () => {
    for (const table of [...Object.values(TABLES), ...ORACLE_ONLY_TABLES]) {
      expect(createdTables.has(table), table).toBe(true);
    }
  });

  it('creates no table the memory store does not know about', () => {
    const known = new Set<string>([...Object.values(TABLES), ...ORACLE_ONLY_TABLES]);
    for (const table of createdTables) expect(known.has(table), table).toBe(true);
  });

  it.each([
    ['eh_employees_bu_ck', BUSINESS_UNITS],
    ['eh_coa_values_segment_ck', COA_SEGMENTS],
    ['eh_role_assignments_role_ck', ASSIGNABLE_ROLES],
    ['eh_expense_types_category_ck', EXPENSE_CATEGORIES],
    ['eh_approval_rules_chain_ck', APPROVAL_CHAINS],
    ['eh_audit_rules_code_ck', AUDIT_RULE_CODES],
    ['eh_reports_status_ck', REPORT_STATUSES],
    ['eh_expenses_policy_ck', POLICY_LEVELS],
    ['eh_violations_level_ck', VIOLATION_LEVELS],
    ['eh_approval_steps_status_ck', STEP_STATUSES],
    ['eh_audit_outcome_ck', AUDIT_OUTCOMES],
    ['eh_qp_invoices_status_ck', QUICK_PAY_INVOICE_STATUSES],
    ['eh_advances_status_ck', ADVANCE_STATUSES],
    ['eh_card_txn_status_ck', CARD_TXN_STATUSES],
    ['eh_report_history_type_ck', HISTORY_ENTITY_TYPES],
    ['eh_integration_log_interface_ck', INTERFACE_CODES],
    ['eh_integration_log_status_ck', INTEGRATION_LOG_STATUSES],
    ['eh_job_runs_status_ck', JOB_RUN_STATUSES],
    ['eh_notifications_channel_ck', NOTIFICATION_CHANNELS],
    ['eh_notifications_status_ck', NOTIFICATION_STATUSES],
  ] as const)('%s matches the shared list', (constraint, values) => {
    expect(checkList(constraint)).toEqual([...values]);
  });

  it('defines the SoD and history triggers DB-01…DB-06', () => {
    for (const n of ['20001', '20002', '20003', '20004', '20005', '20006']) {
      expect(sql).toContain(`RAISE_APPLICATION_ERROR(-${n}`);
    }
  });
});
