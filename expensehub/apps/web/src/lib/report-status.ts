// UI-UX §5.3 / §6: one colour per report status, defined once; the 5-step progress
// Submitted → Approved → Audited → Invoiced → Paid (PRD §4.1).
import type { ReportStatus } from '@expensehub/shared';
import type { Tone } from '../components/ui/Tag';

export const STATUS_TONE: Record<ReportStatus, Tone> = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'info',
  PENDING_AUDIT: 'info',
  READY_FOR_PAYMENT: 'pass',
  INVOICED: 'pass',
  PAID: 'pass',
  SETTLED: 'pass',
  REJECTED: 'block',
};

export const STAGES = ['submitted', 'approved', 'audited', 'invoiced', 'paid'] as const;
export type Stage = (typeof STAGES)[number];

/**
 * How many stages are complete, and which stage is in progress (null = none: a draft, or
 * finished). REJECTED shows where it stopped.
 */
export function stageOf(status: ReportStatus): {
  done: number;
  current: number | null;
  failed: boolean;
} {
  switch (status) {
    case 'DRAFT':
      return { done: 0, current: null, failed: false };
    case 'PENDING_APPROVAL':
      return { done: 1, current: 1, failed: false };
    case 'PENDING_AUDIT':
      return { done: 2, current: 2, failed: false };
    case 'READY_FOR_PAYMENT':
      return { done: 3, current: 3, failed: false };
    case 'INVOICED':
      return { done: 4, current: 4, failed: false };
    case 'PAID':
    case 'SETTLED':
      return { done: 5, current: null, failed: false };
    case 'REJECTED':
      return { done: 1, current: 1, failed: true };
  }
}

/** Status filter chips on My reports (FR-REP-06). */
export const REPORT_FILTERS = {
  all: null,
  drafts: ['DRAFT'],
  inApproval: ['PENDING_APPROVAL', 'PENDING_AUDIT'],
  rejected: ['REJECTED'],
  approved: ['READY_FOR_PAYMENT', 'INVOICED'],
  paid: ['PAID', 'SETTLED'],
} as const satisfies Record<string, readonly ReportStatus[] | null>;
export type ReportFilter = keyof typeof REPORT_FILTERS;
