// Implements: TRD §4.7 / §5 authorisation — route guards (default deny) and row-level checks.
// API §1 access column: Own = claimant · Step = current assignee · Fin = FINANCE_AP/ACCOUNTANT
// for that BU · Adm = SYS_ADMIN.
import {
  BUSINESS_UNITS,
  FINANCE_ROLES,
  hasAnyCapability,
  isApprover,
  type AssignableRole,
  type BusinessUnit,
  type Capability,
} from '@expensehub/shared';
import type { RequestHandler } from 'express';
import type { ApprovalStepRow, ReceiptRow, ReportRow } from '../data/entities';
import { AppError } from '../lib/errors';
import type { AuthContext } from './context';

// ─── Route guards ───────────────────────────────────────────────────────────

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(new AppError('UNAUTHENTICATED', 'Please sign in.'));
    return;
  }
  next();
};

/** Signed in and holding at least one of the capabilities. */
export function requireCapability(...required: Capability[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new AppError('UNAUTHENTICATED', 'Please sign in.'));
      return;
    }
    if (!hasAnyCapability(req.auth.capabilities, required)) {
      next(new AppError('FORBIDDEN', 'You do not have access to this.', { required }));
      return;
    }
    next();
  };
}

/** Line managers and approval-step role holders (approval inbox). */
export const requireApprover: RequestHandler = (req, _res, next) => {
  if (!req.auth) {
    next(new AppError('UNAUTHENTICATED', 'Please sign in.'));
    return;
  }
  if (!isApprover(req.auth.capabilities)) {
    next(new AppError('FORBIDDEN', 'You do not approve claims.'));
    return;
  }
  next();
};

/** The signed-in context inside a guarded route. */
export function authOf(req: { auth?: AuthContext }): AuthContext {
  if (!req.auth) throw new AppError('UNAUTHENTICATED', 'Please sign in.');
  return req.auth;
}

// ─── Row-level checks ───────────────────────────────────────────────────────

/** Role held for a BU; a grant with businessUnit null covers all BUs. */
export function hasRole(
  auth: AuthContext,
  role: AssignableRole,
  businessUnit?: BusinessUnit,
): boolean {
  return auth.roles.some(
    (g) =>
      g.role === role &&
      (businessUnit === undefined || g.businessUnit === null || g.businessUnit === businessUnit),
  );
}

/** BUs whose claims this Finance user may see (API §1 "Fin"). */
export function financeBusinessUnits(auth: AuthContext): BusinessUnit[] {
  const units = new Set<BusinessUnit>();
  for (const grant of auth.roles) {
    if (!(FINANCE_ROLES as readonly string[]).includes(grant.role)) continue;
    if (grant.businessUnit === null) BUSINESS_UNITS.forEach((bu) => units.add(bu));
    else units.add(grant.businessUnit);
  }
  return BUSINESS_UNITS.filter((bu) => units.has(bu));
}

/** Own · any step assignee or actor (past or current) · Finance for the report's BU. */
export function canViewReport(
  auth: AuthContext,
  report: Pick<ReportRow, 'personId' | 'businessUnit'>,
  steps: readonly Pick<ApprovalStepRow, 'assignedTo' | 'actedBy' | 'originalAssignee'>[],
): boolean {
  if (report.personId === auth.personId) return true;
  if (
    steps.some(
      (s) =>
        s.assignedTo === auth.personId ||
        s.actedBy === auth.personId ||
        s.originalAssignee === auth.personId,
    )
  ) {
    return true;
  }
  return financeBusinessUnits(auth).includes(report.businessUnit);
}

/** Only the current assignee of a PENDING step acts on it (delegation arrives in phase 2). */
export function canActOnStep(
  auth: AuthContext,
  step: Pick<ApprovalStepRow, 'status' | 'assignedTo'>,
): boolean {
  return step.status === 'PENDING' && step.assignedTo === auth.personId;
}

/** Own receipt, or a receipt on a report the user may view. */
export function canViewReceipt(
  auth: AuthContext,
  receipt: Pick<ReceiptRow, 'personId'>,
  report?: Pick<ReportRow, 'personId' | 'businessUnit'>,
  steps: readonly Pick<ApprovalStepRow, 'assignedTo' | 'actedBy' | 'originalAssignee'>[] = [],
): boolean {
  if (receipt.personId === auth.personId) return true;
  return report !== undefined && canViewReport(auth, report, steps);
}
