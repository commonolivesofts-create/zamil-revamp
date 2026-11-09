// Training requests: submit / nominate, approval routing, decisions, withdrawal, waitlist.
import {
  ACTIVE_STATUSES,
  type ApprovalStep,
  type ApproverType,
  type RequestStatus,
  type RoleCode,
  type StepStatus,
  type TrainingRequest,
} from '@traininghub/shared';
import type { R } from '../db/tables';
import { daysBetween } from '../lib/dates';
import { AppError, forbidden, invalid, notFound, validation } from '../lib/errors';
import {
  audit,
  directory,
  hasRole,
  nameOf,
  notify,
  nowIso,
  settingFlag,
  settings,
  teamOf,
  today,
  type Ctx,
  type Directory,
} from './ctx';
import { eligibility } from './eligibility';
import { personRef } from './profiles';
import { seatsTaken, sessionLookups, toSession } from './sessions';
import { actingFor, activeDelegation, buildChain } from './workflow';

export const requestNo = (id: number, createdAt: string) =>
  `TR-${createdAt.slice(0, 4)}-${String(id).padStart(5, '0')}`;

/** May the actor raise a request for `personId`? Self, managers (two levels) and HR. */
function canRequestFor(dir: Directory, actor: number, personId: number) {
  return actor === personId || hasRole(dir, actor, 'HR_ADMIN') || teamOf(dir, actor).includes(personId);
}

export async function submitRequest(
  ctx: Ctx,
  input: { personId: number; sessionId: number; reason: string },
) {
  const dir = await directory(ctx);
  const actor = ctx.actor!;
  if (!canRequestFor(dir, actor, input.personId))
    throw forbidden('You can request training for yourself or your team');
  const e = await eligibility(ctx, input.personId, input.sessionId);
  if (!e.ok) throw new AppError('POLICY_BLOCK', e.errors[0]!.message, { errors: e.errors });
  if (input.reason.trim().length < e.minReason)
    throw validation(`Please write at least ${e.minReason} characters`, {
      reason: `At least ${e.minReason} characters`,
    });
  const session = (await ctx.store.one('sessions', { id: input.sessionId }))!;
  const at = nowIso(ctx);
  const req = await ctx.store.tx(async () => {
    const r = await ctx.store.insert('requests', {
      personId: input.personId,
      sessionId: input.sessionId,
      reason: input.reason.trim(),
      statusCode: 'PENDING',
      currentStepNo: null,
      createdBy: actor,
      createdAt: at,
      updatedAt: at,
    });
    const no = requestNo(r.id, at);
    await ctx.store.update('requests', { id: r.id }, { requestNo: no });
    for (const s of await buildChain(ctx, dir, input.personId, session))
      await ctx.store.insert('approvalSteps', { ...s, requestId: r.id });
    await audit(
      ctx,
      actor === input.personId ? 'Submitted request' : `Nominated ${nameOf(dir, input.personId)}`,
      'REQUEST',
      no,
    );
    if (actor !== input.personId)
      await notify(
        ctx,
        input.personId,
        `${nameOf(dir, actor)} nominated you for ${session.title}`,
        `/requests/${r.id}`,
      );
    await advance(ctx, r.id);
    return r;
  });
  return getRequest(ctx, req.id);
}

/** Activates the next waiting step, or finalises the request when none is left. */
async function advance(ctx: Ctx, requestId: number) {
  const dir = await directory(ctx);
  const r = (await ctx.store.one('requests', { id: requestId }))!;
  const session = (await ctx.store.one('sessions', { id: r.sessionId }))!;
  const steps = await ctx.store.find('approvalSteps', { requestId }, { orderBy: ['stepNo'] });
  const next = steps.find((s) => s.statusCode === 'WAITING');
  const at = nowIso(ctx);
  const who = nameOf(dir, r.personId);
  if (next) {
    let approver = next.approverPersonId;
    let delegatedFrom: number | null = null;
    if (approver) {
      const d = await activeDelegation(ctx, approver, today(ctx));
      if (d && d.toPersonId !== r.personId) {
        delegatedFrom = approver;
        approver = d.toPersonId;
      }
    }
    await ctx.store.update(
      'approvalSteps',
      { id: next.id },
      { statusCode: 'PENDING', sinceAt: at, approverPersonId: approver, delegatedFrom },
    );
    await ctx.store.update('requests', { id: requestId }, { currentStepNo: next.stepNo, updatedAt: at });
    const text = `${who} · ${session.title} needs your decision`;
    if (approver) await notify(ctx, approver, text, `/approvals`);
    else if (next.roleCode)
      for (const id of dir.roleHolders.get(next.roleCode as RoleCode) ?? [])
        if (id !== r.personId) await notify(ctx, id, text, `/approvals`);
    return;
  }
  const taken = seatsTaken(session, await ctx.store.find('requests', { sessionId: session.id }));
  const full = taken >= session.capacity;
  await ctx.store.update(
    'requests',
    { id: requestId },
    {
      statusCode: full ? 'WAITLISTED' : 'APPROVED',
      currentStepNo: null,
      decidedAt: at,
      waitlistedAt: full ? at : null,
      updatedAt: at,
    },
  );
  await notify(
    ctx,
    r.personId,
    full
      ? `Approved but full: you are on the waitlist for ${session.title}`
      : `Approved: ${session.title} — your seat is confirmed`,
    `/requests/${requestId}`,
  );
  if (r.createdBy !== r.personId)
    await notify(
      ctx,
      r.createdBy,
      `${who} is ${full ? 'waitlisted' : 'confirmed'} for ${session.title}`,
      `/requests/${requestId}`,
    );
}

/** Can `actor` decide this pending step? Assigned person, their delegate, or a holder of the step's role. */
export async function canDecideStep(
  ctx: Ctx,
  dir: Directory,
  actor: number,
  r: R<'requests'>,
  step: R<'approvalSteps'> | undefined,
) {
  if (!step || step.statusCode !== 'PENDING' || r.statusCode !== 'PENDING' || actor === r.personId)
    return false;
  if (step.approverPersonId != null) return step.approverPersonId === actor;
  if (!step.roleCode) return false;
  // Role steps need the role itself (a system administrator is not automatically an HR Lead).
  const holds = (id: number) => !!dir.people.get(id)?.roles.includes(step.roleCode as RoleCode);
  if (holds(actor)) return true;
  // A delegate acts for an absent role holder.
  return (await actingFor(ctx, actor, today(ctx))).some(holds);
}

async function pendingStep(ctx: Ctx, r: R<'requests'>) {
  if (r.currentStepNo == null) return undefined;
  return ctx.store.one('approvalSteps', { requestId: r.id, stepNo: r.currentStepNo });
}

export async function decide(
  ctx: Ctx,
  id: number,
  input: { action: 'approve' | 'reject' | 'forward'; comment: string; forwardTo?: number },
) {
  const dir = await directory(ctx);
  const actor = ctx.actor!;
  await ctx.store.tx(async () => {
    const r = await ctx.store.one('requests', { id });
    if (!r) throw notFound('Request');
    const step = await pendingStep(ctx, r);
    if (!(await canDecideStep(ctx, dir, actor, r, step)))
      throw invalid('This request is no longer waiting for you');
    const session = (await ctx.store.one('sessions', { id: r.sessionId }))!;
    const at = nowIso(ctx);
    const no = r.requestNo ?? String(id);
    if (input.action === 'approve') {
      await ctx.store.update(
        'approvalSteps',
        { id: step!.id },
        { statusCode: 'APPROVED', actedAt: at, actedBy: actor, comments: input.comment || null },
      );
      await audit(ctx, `Approved (${step!.label})`, 'REQUEST', no);
      await notify(
        ctx,
        r.personId,
        `${nameOf(dir, actor)} approved ${session.title} (${step!.label})`,
        `/requests/${id}`,
      );
      await advance(ctx, id);
    } else if (input.action === 'reject') {
      await ctx.store.update(
        'approvalSteps',
        { id: step!.id },
        { statusCode: 'REJECTED', actedAt: at, actedBy: actor, comments: input.comment },
      );
      await ctx.store.update(
        'approvalSteps',
        { requestId: id, statusCode: 'WAITING' },
        { statusCode: 'CANCELLED' },
      );
      await ctx.store.update(
        'requests',
        { id },
        { statusCode: 'REJECTED', currentStepNo: null, decidedAt: at, updatedAt: at },
      );
      await audit(ctx, `Rejected (${step!.label})`, 'REQUEST', no, { comment: input.comment });
      await notify(ctx, r.personId, `Rejected: ${session.title} — “${input.comment}”`, `/requests/${id}`);
      if (r.createdBy !== r.personId)
        await notify(
          ctx,
          r.createdBy,
          `Rejected: ${nameOf(dir, r.personId)} · ${session.title}`,
          `/requests/${id}`,
        );
    } else {
      const to = input.forwardTo!;
      if (!dir.people.get(to)?.active)
        throw validation('Forward to an active employee', { forwardTo: 'Not active' });
      if (to === r.personId || to === actor)
        throw validation('Choose someone else', { forwardTo: 'Choose someone else' });
      await ctx.store.update(
        'approvalSteps',
        { id: step!.id },
        {
          approverPersonId: to,
          forwardedFrom: actor,
          sinceAt: at,
          comments: input.comment || null,
          delegatedFrom: null,
        },
      );
      await audit(ctx, `Forwarded to ${nameOf(dir, to)}`, 'REQUEST', no);
      await notify(
        ctx,
        to,
        `${nameOf(dir, actor)} forwarded ${nameOf(dir, r.personId)}'s request to you`,
        `/approvals`,
      );
    }
  });
  return getRequest(ctx, id);
}

/** Bulk approve: only internal, no-cost sessions (paid ones need an individual look). */
export async function bulkApprove(ctx: Ctx, ids: number[]) {
  const done: number[] = [];
  const skipped: { id: number; reason: string }[] = [];
  for (const id of ids) {
    const r = await ctx.store.one('requests', { id });
    const s = r && (await ctx.store.one('sessions', { id: r.sessionId }));
    if (!r || !s) {
      skipped.push({ id, reason: 'Not found' });
      continue;
    }
    if (s.costHalalas > 0) {
      skipped.push({ id, reason: 'Paid session — approve individually' });
      continue;
    }
    try {
      await decide(ctx, id, { action: 'approve', comment: '' });
      done.push(id);
    } catch (e) {
      skipped.push({ id, reason: (e as Error).message });
    }
  }
  return { approved: done.length, skipped };
}

export async function withdraw(ctx: Ctx, id: number, comment: string) {
  const dir = await directory(ctx);
  const actor = ctx.actor!;
  const r = await ctx.store.one('requests', { id });
  if (!r) throw notFound('Request');
  if (![r.personId, r.createdBy].includes(actor) && !hasRole(dir, actor, 'HR_ADMIN')) throw forbidden();
  if (!ACTIVE_STATUSES.includes(r.statusCode as RequestStatus))
    throw invalid('Only open requests can be withdrawn');
  const session = (await ctx.store.one('sessions', { id: r.sessionId }))!;
  if (session.startDate <= today(ctx))
    throw invalid('The session has started — ask the trainer to mark attendance instead');
  const wasSeated = r.statusCode === 'APPROVED';
  await ctx.store.tx(async () => {
    const at = nowIso(ctx);
    await ctx.store.update(
      'requests',
      { id },
      { statusCode: 'WITHDRAWN', currentStepNo: null, updatedAt: at },
    );
    await ctx.store.update(
      'approvalSteps',
      { requestId: id, statusCode: ['WAITING', 'PENDING'] },
      { statusCode: 'CANCELLED' },
    );
    await audit(
      ctx,
      'Withdrew request',
      'REQUEST',
      r.requestNo ?? String(id),
      comment ? { comment } : undefined,
    );
    if (actor !== r.personId)
      await notify(ctx, r.personId, `Your request for ${session.title} was withdrawn`, `/requests/${id}`);
  });
  if (wasSeated) await promoteWaitlist(ctx, r.sessionId);
  return getRequest(ctx, id);
}

/** Moves waitlisted requests into free seats, oldest first. */
export async function promoteWaitlist(ctx: Ctx, sessionId: number) {
  const s = await settings(ctx);
  if (!settingFlag(s, 'WAITLIST_AUTO_PROMOTE')) return 0;
  return ctx.store.tx(async () => {
    const session = await ctx.store.one('sessions', { id: sessionId });
    if (!session || session.statusCode !== 'SCHEDULED' || session.attendanceLockedAt) return 0;
    const reqs = await ctx.store.find('requests', { sessionId });
    let free = session.capacity - seatsTaken(session, reqs);
    const queue = reqs
      .filter((r) => r.statusCode === 'WAITLISTED')
      .sort((a, b) => (a.waitlistedAt ?? '').localeCompare(b.waitlistedAt ?? ''));
    let n = 0;
    for (const r of queue) {
      if (free <= 0) break;
      await ctx.store.update('requests', { id: r.id }, { statusCode: 'APPROVED', updatedAt: nowIso(ctx) });
      await notify(
        ctx,
        r.personId,
        `A seat opened up: you are confirmed for ${session.title}`,
        `/requests/${r.id}`,
      );
      await audit(ctx, 'Promoted from waitlist', 'REQUEST', r.requestNo ?? String(r.id));
      free--;
      n++;
    }
    return n;
  });
}

/* ----------------------------- Read models ----------------------------- */

async function toRequests(
  ctx: Ctx,
  rows: R<'requests'>[],
  withEligibility = false,
): Promise<TrainingRequest[]> {
  if (!rows.length) return [];
  const dir = await directory(ctx);
  const actor = ctx.actor;
  const ids = rows.map((r) => r.id);
  const sessionIds = [...new Set(rows.map((r) => r.sessionId))];
  const [steps, sessions, L] = await Promise.all([
    ctx.store.find('approvalSteps', { requestId: ids }, { orderBy: ['stepNo'] }),
    ctx.store.find('sessions', { id: sessionIds }),
    sessionLookups(ctx, sessionIds),
  ]);
  const t = today(ctx);
  const out: TrainingRequest[] = [];
  for (const r of rows) {
    const mine = steps.filter((s) => s.requestId === r.id);
    const cur = mine.find((s) => s.stepNo === r.currentStepNo);
    const s = sessions.find((x) => x.id === r.sessionId)!;
    const canDecide = actor != null && (await canDecideStep(ctx, dir, actor, r, cur));
    const dto: TrainingRequest = {
      id: r.id,
      requestNo: r.requestNo ?? requestNo(r.id, r.createdAt),
      personId: r.personId,
      personName: nameOf(dir, r.personId) ?? '',
      positionName: personRef(dir, r.personId).positionName,
      sessionId: r.sessionId,
      session: toSession(s, L),
      reason: r.reason,
      status: r.statusCode as RequestStatus,
      createdAt: r.createdAt,
      createdByName: nameOf(dir, r.createdBy) ?? '',
      currentStepNo: r.currentStepNo,
      steps: mine.map((x) => toStep(dir, x)),
      canWithdraw:
        actor != null &&
        ACTIVE_STATUSES.includes(r.statusCode as RequestStatus) &&
        s.startDate > t &&
        (actor === r.personId || actor === r.createdBy || hasRole(dir, actor, 'HR_ADMIN')),
      canDecide,
      waitingDays: cur?.sinceAt ? daysBetween(cur.sinceAt, ctx.clock().toISOString()) : 0,
    };
    if (withEligibility && canDecide)
      dto.eligibilityNow = (
        await eligibility(ctx, r.personId, r.sessionId, { ignoreRequestId: r.id })
      ).errors.filter((e) => e.code !== 'CUTOFF_DAYS' && e.code !== 'DUPLICATE_REQUEST');
    out.push(dto);
  }
  return out;
}

function toStep(dir: Directory, s: R<'approvalSteps'>): ApprovalStep {
  return {
    id: s.id,
    stepNo: s.stepNo,
    label: s.label,
    approverType: s.approverType as ApproverType,
    roleCode: s.roleCode as RoleCode | null,
    approverPersonId: s.approverPersonId,
    approverName: nameOf(dir, s.approverPersonId),
    delegatedFromName: nameOf(dir, s.delegatedFrom),
    forwardedFromName: nameOf(dir, s.forwardedFrom),
    status: s.statusCode as StepStatus,
    sinceAt: s.sinceAt,
    actedAt: s.actedAt,
    actedByName: nameOf(dir, s.actedBy),
    comments: s.comments ?? '',
  };
}

export async function getRequest(ctx: Ctx, id: number): Promise<TrainingRequest> {
  const r = await ctx.store.one('requests', { id });
  if (!r) throw notFound('Request');
  const dir = await directory(ctx);
  const actor = ctx.actor;
  if (actor != null) {
    const steps = await ctx.store.find('approvalSteps', { requestId: id });
    const s = await ctx.store.one('sessions', { id: r.sessionId });
    const involved =
      [r.personId, r.createdBy, s?.trainerPersonId].includes(actor) ||
      steps.some((x) =>
        [x.approverPersonId, x.actedBy, x.originalPersonId, x.delegatedFrom].includes(actor),
      ) ||
      teamOf(dir, actor).includes(r.personId) ||
      hasRole(dir, actor, 'HR_ADMIN', 'HR_LEAD', 'FINANCE');
    if (!involved) throw forbidden();
  }
  return (await toRequests(ctx, [r], true))[0]!;
}

export async function listRequests(ctx: Ctx, scope: 'mine' | 'team' | 'all', personId?: number) {
  const dir = await directory(ctx);
  const actor = ctx.actor!;
  let rows: R<'requests'>[];
  if (scope === 'mine')
    rows = await ctx.store.find('requests', { personId: actor }, { orderBy: ['-createdAt'] });
  else if (scope === 'team') {
    const team = teamOf(dir, actor);
    rows = team.length
      ? await ctx.store.find('requests', { personId: team }, { orderBy: ['-createdAt'] })
      : [];
  } else {
    if (!hasRole(dir, actor, 'HR_ADMIN', 'HR_LEAD', 'FINANCE')) throw forbidden();
    rows = await ctx.store.find('requests', personId ? { personId } : {}, {
      orderBy: ['-createdAt'],
      limit: 1000,
    });
  }
  return toRequests(ctx, rows);
}

/** Requests waiting for the actor, oldest first, plus what they decided recently. */
export async function inbox(ctx: Ctx) {
  const dir = await directory(ctx);
  const actor = ctx.actor!;
  const pending = await ctx.store.find('approvalSteps', { statusCode: 'PENDING' });
  const reqs = pending.length
    ? await ctx.store.find('requests', { id: [...new Set(pending.map((p) => p.requestId))] })
    : [];
  const mine: R<'requests'>[] = [];
  for (const r of reqs) {
    const step = pending.find((p) => p.requestId === r.id && p.stepNo === r.currentStepNo);
    if (await canDecideStep(ctx, dir, actor, r, step)) mine.push(r);
  }
  const waiting = await toRequests(ctx, mine, true);
  waiting.sort((a, b) => b.waitingDays - a.waitingDays);
  const decidedSteps = await ctx.store.find(
    'approvalSteps',
    { actedBy: actor },
    { orderBy: ['-actedAt'], limit: 15 },
  );
  const decidedReqs = decidedSteps.length
    ? await ctx.store.find(
        'requests',
        { id: [...new Set(decidedSteps.map((s) => s.requestId))] },
        { orderBy: ['-updatedAt'] },
      )
    : [];
  return { waiting, decided: await toRequests(ctx, decidedReqs) };
}

export async function countInbox(ctx: Ctx): Promise<number> {
  return (await inbox(ctx)).waiting.length;
}

/** Re-notifies approvers whose step has waited longer than REMIND_AFTER_DAYS. */
export async function sendReminders(ctx: Ctx) {
  const dir = await directory(ctx);
  const days = Number((await settings(ctx)).REMIND_AFTER_DAYS) || 2;
  const now = nowIso(ctx);
  let sent = 0;
  for (const st of await ctx.store.find('approvalSteps', { statusCode: 'PENDING' })) {
    const since = st.remindedAt ?? st.sinceAt;
    if (!since || daysBetween(since, now) < days) continue;
    const r = await ctx.store.one('requests', { id: st.requestId });
    if (!r || r.statusCode !== 'PENDING') continue;
    const text = `Reminder: ${nameOf(dir, r.personId)}'s request ${r.requestNo} has waited ${daysBetween(st.sinceAt ?? now, now)} days`;
    if (st.approverPersonId) await notify({ ...ctx, actor: null }, st.approverPersonId, text, '/approvals');
    else
      for (const id of dir.roleHolders.get(st.roleCode as RoleCode) ?? [])
        await notify({ ...ctx, actor: null }, id, text, '/approvals');
    await ctx.store.update('approvalSteps', { id: st.id }, { remindedAt: now });
    sent++;
  }
  return sent;
}
