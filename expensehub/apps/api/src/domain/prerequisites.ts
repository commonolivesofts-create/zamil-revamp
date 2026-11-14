// Implements: FR-SET-02 prerequisite check, FR-POL-06 (clear message + who to contact),
// FR-APR-08 (no line manager blocks submit). D-37: the CEO's chain has no line-manager step.
import type { PrerequisiteCheck } from '@expensehub/shared';
import type { EmployeeRow } from '../data/entities';

export interface PrerequisiteResult {
  ok: boolean;
  checks: PrerequisiteCheck[];
}

export function checkPrerequisites(
  employee: Pick<EmployeeRow, 'active' | 'supervisorId' | 'defaultExpenseAccount' | 'payeeOk'>,
  options: { needsLineManager: boolean },
): PrerequisiteResult {
  const checks: PrerequisiteCheck[] = [
    employee.active === 'Y'
      ? {
          code: 'ACTIVE_ASSIGNMENT',
          ok: true,
          message: 'Active assignment in Oracle HCM',
          contact: null,
        }
      : {
          code: 'ACTIVE_ASSIGNMENT',
          ok: false,
          message: 'Your assignment is not active in Oracle HCM. Contact HR.',
          contact: 'HR',
        },
    !options.needsLineManager || employee.supervisorId !== null
      ? {
          code: 'LINE_MANAGER',
          ok: true,
          message: options.needsLineManager
            ? 'Line manager set in Oracle HCM'
            : 'No line-manager step for your claims',
          contact: null,
        }
      : {
          code: 'LINE_MANAGER',
          ok: false,
          message: 'Your line manager is missing in Oracle HCM. Ask HR to set your supervisor.',
          contact: 'HR',
        },
    employee.defaultExpenseAccount
      ? { code: 'DEFAULT_ACCOUNT', ok: true, message: 'Default expense account set', contact: null }
      : {
          code: 'DEFAULT_ACCOUNT',
          ok: false,
          message: 'Your default expense account is missing in Oracle HCM. Contact HR.',
          contact: 'HR',
        },
    employee.payeeOk === 'Y'
      ? { code: 'PAYEE', ok: true, message: 'Bank details ready for reimbursement', contact: null }
      : {
          code: 'PAYEE',
          ok: false,
          message:
            'You are not yet set up for reimbursement in Oracle Payables (supplier or bank account). Contact Finance (AP).',
          contact: 'FINANCE',
        },
  ];
  return { ok: checks.every((c) => c.ok), checks };
}
