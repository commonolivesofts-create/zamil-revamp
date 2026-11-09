// Approval workflow configuration (Setup → Workflow) and chain resolution.
// Default: Direct manager → HR Lead. HR can add, remove, reorder and condition steps; changes
// apply to new requests, requests in flight keep the route they were given.
import type { ApproverType, RoleCode, StepCondition, WorkflowStep, WorkflowStepInput } from '@traininghub/shared';
import { ROLE_LABEL } from '@traininghub/shared';
import type { R } from '../db/tables';
import { audit, directory, hasRole, nameOf, nowIso, type Ctx, type Directory } from './ctx';
import { forbidden } from '../lib/errors';
import { sar } from './sessions';

export const DEFAULT_WORKFLOW: WorkflowStepInput[] = [
  { label: 'Direct manager', approverType: 'DIRECT_MANAGER', roleCode: null, personId: null, conditionType: 'ALWAYS', conditionValue: null, enabled: true },
  { label: 'HR Lead', approverType: 'ROLE', roleCode: 'HR_LEAD', personId: null, conditionType: 'ALWAYS', conditionValue: null, enabled: true },
];

export async function getWorkflow(ctx: Ctx): Promise<WorkflowStep[]> {
  const dir = await directory(ctx);
  const rows = await ctx.store.find('workflowSteps', {}, { orderBy: ['stepNo'] });
  return rows.map((r) => ({
    id: r.id,
    stepNo: r.stepNo,
    label: r.label,
    approverType: r.approverType as ApproverType,
    roleCode: r.roleCode as RoleCode | null,
    personId: r.personId,
    personName: nameOf(dir, r.personId),
    conditionType: r.conditionType as StepCondition,
    conditionValue: r.conditionValue,
    enabled: r.enabledFlag,
  }));
}

export async function saveWorkflow(ctx: Ctx, steps: WorkflowStepInput[]) {
  const dir = await directory(ctx);
  if (!hasRole(dir, ctx.actor!, 'HR_ADMIN')) throw forbidden('Only HR changes the workflow');
  const at = nowIso(ctx);
  await ctx.store.tx(async () => {
    const old = await ctx.store.find('workflowSteps');
    for (const o of old) await ctx.store.remove('workflowSteps', { id: o.id });
    let n = 1;
    for (const s of steps)
      await ctx.store.insert('workflowSteps', {
        stepNo: n++,
        label: s.label,
        approverType: s.approverType,
        roleCode: s.approverType === 'ROLE' ? s.roleCode : null,
        personId: s.approverType === 'PERSON' ? s.personId : null,
        conditionType: s.conditionType,
        conditionValue: s.conditionType === 'COST_ABOVE' ? s.conditionValue : null,
        enabledFlag: s.enabled,
        updatedBy: ctx.actor,
        updatedAt: at,
      });
    await audit(ctx, 'Updated approval workflow', 'WORKFLOW', steps.filter((s) => s.enabled).map((s) => s.label).join(' → '), steps);
  });
}

/** Problems HR should know about (shown in Setup → Workflow). */
export async function workflowWarnings(ctx: Ctx): Promise<string[]> {
  const dir = await directory(ctx);
  const out: string[] = [];
  for (const s of await getWorkflow(ctx)) {
    if (!s.enabled) continue;
    if (s.approverType === 'ROLE' && s.roleCode && !(dir.roleHolders.get(s.roleCode) ?? []).some((id) => dir.people.get(id)?.active))
      out.push(`Nobody holds the ${ROLE_LABEL[s.roleCode]} role — requests will wait at "${s.label}". Assign it in Setup → Roles.`);
    if (s.approverType === 'PERSON' && s.personId && !dir.people.get(s.personId)?.active)
      out.push(`${s.personName ?? 'The named approver'} for "${s.label}" is not an active employee.`);
  }
  return out;
}

export async function activeDelegation(ctx: Ctx, fromPersonId: number, date: string) {
  const list = await ctx.store.find('delegations', { fromPersonId, cancelledFlag: false });
  return list.find((d) => d.startDate <= date && d.endDate >= date);
}
/** People who currently act for `personId` (delegations to them that are active today). */
export async function actingFor(ctx: Ctx, personId: number, date: string): Promise<number[]> {
  const list = await ctx.store.find('delegations', { toPersonId: personId, cancelledFlag: false });
  return list.filter((d) => d.startDate <= date && d.endDate >= date).map((d) => d.fromPersonId);
}

export type NewStep = Omit<R<'approvalSteps'>, 'id' | 'requestId'>;

function applies(s: WorkflowStep, session: R<'sessions'>): boolean {
  if (!s.enabled) return false;
  if (s.conditionType === 'COST_ABOVE') return sar(session.costHalalas) > Number(s.conditionValue ?? 0);
  if (s.conditionType === 'EXTERNAL_ONLY') return session.sessionType === 'EXTERNAL';
  return true;
}

/** The route for a new request. Steps that cannot apply are kept as SKIPPED with a reason. */
export async function buildChain(ctx: Ctx, dir: Directory, personId: number, session: R<'sessions'>): Promise<NewStep[]> {
  const person = dir.people.get(personId)!;
  const mgr = person.managerId && dir.people.get(person.managerId)?.active ? person.managerId : null;
  const mgr2 = mgr ? dir.people.get(mgr)?.managerId ?? null : null;
  const steps: NewStep[] = [];
  let lastPerson: number | null = null;
  for (const s of await getWorkflow(ctx)) {
    if (!applies(s, session)) continue;
    const base: NewStep = {
      stepNo: steps.length + 1,
      label: s.label,
      approverType: s.approverType,
      roleCode: s.approverType === 'ROLE' ? s.roleCode : null,
      approverPersonId: null,
      originalPersonId: null,
      delegatedFrom: null,
      forwardedFrom: null,
      statusCode: 'WAITING',
      sinceAt: null,
      actedAt: null,
      actedBy: null,
      comments: null,
      remindedAt: null,
    };
    if (s.approverType === 'ROLE') {
      steps.push(base);
      lastPerson = null;
      continue;
    }
    const who = s.approverType === 'DIRECT_MANAGER' ? mgr : s.approverType === 'SECOND_MANAGER' ? mgr2 : s.personId;
    const skip = (why: string) => steps.push({ ...base, statusCode: 'SKIPPED', comments: why, approverPersonId: who, originalPersonId: who });
    if (!who) skip(s.approverType === 'PERSON' ? 'No approver set' : 'No manager in Fusion');
    else if (who === personId) skip('Requester cannot approve their own request');
    else if (!dir.people.get(who)?.active) skip('Approver is not active');
    else if (who === lastPerson) skip('Same approver as the previous step');
    else {
      steps.push({ ...base, approverPersonId: who, originalPersonId: who });
      lastPerson = who;
    }
  }
  return steps;
}
