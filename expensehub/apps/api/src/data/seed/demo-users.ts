// D-35: 16 demo users, one per role and scenario across IPP/FPP/APP. Used by the seed and by
// the dev quick-login picker (M2). All people are fictional.
import type { BusinessUnit } from '@expensehub/shared';

/**
 * Shared password of every demo user (D-33). Shown on the dev quick-login panel only;
 * the Oracle production schema is never seeded with demo users.
 */
export const DEV_PASSWORD = 'ExpenseHub2026';

export interface DemoUser {
  personNumber: string;
  persona: string;
  businessUnit: BusinessUnit;
  /** What this user is for when testing. */
  scenario: string;
}

export const DEMO_USERS: DemoUser[] = [
  {
    personNumber: '1001',
    persona: 'CEO',
    businessUnit: 'IPP',
    scenario: 'CEO approvals; own claims go Finance Manager → HR → Accountant (D-37)',
  },
  {
    personNumber: '1002',
    persona: 'Finance Manager',
    businessUnit: 'IPP',
    scenario: 'Finance Manager step, all BUs; own claim skips to supervisor (D-34)',
  },
  {
    personNumber: '1003',
    persona: 'HR Manager · IPP/FPP',
    businessUnit: 'IPP',
    scenario: 'HR step for IPP and FPP; backup for APP',
  },
  {
    personNumber: '1004',
    persona: 'HR Manager · APP',
    businessUnit: 'APP',
    scenario: 'HR step for APP; backup for IPP and FPP',
  },
  {
    personNumber: '1005',
    persona: 'Accountant · IPP/APP',
    businessUnit: 'IPP',
    scenario: 'Audit step (OQ-03) for IPP and APP',
  },
  {
    personNumber: '1006',
    persona: 'Accountant · FPP',
    businessUnit: 'FPP',
    scenario: 'Audit step for FPP; backup for IPP and APP',
  },
  {
    personNumber: '1007',
    persona: 'Finance AP',
    businessUnit: 'IPP',
    scenario: 'Send to Payables, Quick Pay queue',
  },
  {
    personNumber: '1008',
    persona: 'Petty Cashier',
    businessUnit: 'IPP',
    scenario: 'Cash advances (phase 2)',
  },
  {
    personNumber: '1009',
    persona: 'System Admin',
    businessUnit: 'IPP',
    scenario: 'Setup screens, integration monitor',
  },
  {
    personNumber: '1010',
    persona: 'Line Manager · IPP',
    businessUnit: 'IPP',
    scenario: 'Approves 1011 and 1012',
  },
  {
    personNumber: '1011',
    persona: 'Employee · traveller',
    businessUnit: 'IPP',
    scenario: 'GCC + international trips, foreign currency, > SAR 5,000 claims',
  },
  {
    personNumber: '1012',
    persona: 'Employee · Quick Pay',
    businessUnit: 'IPP',
    scenario: 'Has a Quick Pay waiting to be invoiced',
  },
  {
    personNumber: '1013',
    persona: 'Line Manager · FPP',
    businessUnit: 'FPP',
    scenario: 'Approves 1014; domestic trip',
  },
  {
    personNumber: '1014',
    persona: 'Employee · no bank',
    businessUnit: 'FPP',
    scenario: 'payee_ok = N → submit blocked (FR-SET-02)',
  },
  {
    personNumber: '1015',
    persona: 'Line Manager · APP',
    businessUnit: 'APP',
    scenario: 'Plant manager, APP',
  },
  {
    personNumber: '1016',
    persona: 'Employee · no manager',
    businessUnit: 'APP',
    scenario: 'No supervisor in HCM → submit blocked (FR-APR-08)',
  },
];
