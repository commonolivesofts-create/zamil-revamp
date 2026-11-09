// Implements: FR-APR-01/02/07/08 — the approval chain built at submit from the rule table.
//   D-49 (STANDARD): line-manager hierarchy up to the top → Finance Manager → Accountant.
//   D-37 (CEO_CLAIMANT): the CEO's own claims (no manager above) go Finance Manager → Accountant.
//   D-34: when the resolved approver of ANY step is the claimant, the step goes to the
//         claimant's HCM supervisor — never to the BU backup role holder.
// Pure: the caller resolves role holders and the supervisor chain; this decides the steps.
import type { ApprovalChain, AssignableRole, Halalas, StepNote } from '@expensehub/shared';
import type { ApprovalRuleRow, PersonId } from '../data/entities';

export interface ChainInput {
  claimant: { personId: PersonId; supervisorId: PersonId | null };
  /**
   * D-49: the claimant's line managers, nearest first, up to the top of HCM (the caller stops
   * at a missing supervisor, a loop or the level cap). [] = nobody above the claimant.
   */
  supervisorChain: readonly PersonId[];
  /** Claimant holds APPROVER_CEO today (D-37). */
  claimantIsCeo: boolean;
  totalSar: Halalas;
  /** System option CEO_THRESHOLD_SAR (FR-APR-02). */
  ceoThresholdSar: Halalas;
  /** Active rules of each chain, ordered by seq. */
  rules: Record<ApprovalChain, readonly ApprovalRuleRow[]>;
  /** Primary holder of each role for the claimant's BU, else its backup; null = nobody. */
  roleHolder: (role: AssignableRole) => PersonId | null;
}

export interface PlannedStep {
  seq: number;
  stepName: string;
  ruleId: number;
  isAuditStep: boolean;
  assignedTo: PersonId;
  status: 'PENDING' | 'WAITING' | 'SKIPPED';
  note: StepNote | null;
}

export type ChainProblem =
  | { code: 'NO_SUPERVISOR' }
  | { code: 'NO_ROLE_HOLDER'; stepName: string; role: AssignableRole }
  | { code: 'NO_RULES'; chain: ApprovalChain };

export type ChainPlan =
  | { ok: true; chain: ApprovalChain; steps: PlannedStep[] }
  | { ok: false; chain: ApprovalChain; problem: ChainProblem };

/** "Line Manager", then "Line Manager · level 2", … for the hierarchy steps (D-49). */
export function hierarchyStepName(base: string, level: number): string {
  return level === 1 ? base : `${base} · level ${level}`;
}

export function planChain(input: ChainInput): ChainPlan {
  const chain: ApprovalChain = input.claimantIsCeo ? 'CEO_CLAIMANT' : 'STANDARD';
  const rules = input.rules[chain];
  if (rules.length === 0) return { ok: false, chain, problem: { code: 'NO_RULES', chain } };

  const steps: PlannedStep[] = [];
  for (const rule of rules) {
    const base = {
      seq: rule.seq,
      stepName: rule.stepName,
      ruleId: rule.ruleId,
      isAuditStep: rule.isAuditStep === 'Y',
    };

    // FR-APR-02: a TOTAL_GT step without its own amount uses CEO_THRESHOLD_SAR.
    if (rule.conditionType === 'TOTAL_GT') {
      const limit = rule.conditionAmountSar ?? input.ceoThresholdSar;
      if (input.totalSar <= limit) {
        // Kept as a SKIPPED row so the stepper and history can say why.
        steps.push({
          ...base,
          assignedTo: input.claimant.personId,
          status: 'SKIPPED',
          note: 'BELOW_THRESHOLD',
        });
        continue;
      }
    }

    // D-49: one step per manager above the claimant. FR-APR-08: nobody above → blocked (the
    // CEO's own claims use the CEO_CLAIMANT chain, which has no hierarchy step).
    if (rule.approverSource === 'SUPERVISOR_HIERARCHY') {
      if (input.supervisorChain.length === 0) {
        return { ok: false, chain, problem: { code: 'NO_SUPERVISOR' } };
      }
      input.supervisorChain.forEach((managerId, index) =>
        steps.push({
          ...base,
          stepName: hierarchyStepName(rule.stepName, index + 1),
          assignedTo: managerId,
          status: 'WAITING',
          note: null,
        }),
      );
      continue;
    }

    let approver: PersonId | null;
    if (rule.approverSource === 'SUPERVISOR') {
      approver = input.claimant.supervisorId;
      if (approver === null) return { ok: false, chain, problem: { code: 'NO_SUPERVISOR' } };
    } else {
      const role = rule.roleCode!;
      approver = input.roleHolder(role);
      if (approver === null) {
        return {
          ok: false,
          chain,
          problem: { code: 'NO_ROLE_HOLDER', stepName: rule.stepName, role },
        };
      }
    }

    let note: StepNote | null = null;
    // D-34 / FR-APR-07: never the claimant; always the HCM supervisor, never the backup.
    if (approver === input.claimant.personId) {
      if (input.claimant.supervisorId === null) {
        return { ok: false, chain, problem: { code: 'NO_SUPERVISOR' } };
      }
      approver = input.claimant.supervisorId;
      note = 'SELF_APPROVAL';
    }

    steps.push({ ...base, assignedTo: approver, status: 'WAITING', note });
  }

  // A hierarchy rule can expand into several steps: number the steps 1…n in chain order.
  steps.forEach((step, index) => (step.seq = index + 1));
  const first = steps.find((s) => s.status === 'WAITING');
  if (first) first.status = 'PENDING';
  return { ok: true, chain, steps };
}
