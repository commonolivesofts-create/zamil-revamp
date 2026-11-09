// Read-only views: dashboard tasks, matrix, team readiness, gaps and reports.
import { ACTIVE_STATUSES, SEATED_STATUSES, type Me, type PositionSkill, type RequestStatus } from '@traininghub/shared';
import type { R } from '../db/tables';
import { daysBetween } from '../lib/dates';
import { forbidden } from '../lib/errors';
import { directory, hasRole, nameOf, settingInt, settings, teamOf, today, type Ctx } from './ctx';
import { canEditAnyJsm } from './positions';
import { effectiveProfile, personRef, readiness, toPositionSkill } from './profiles';
import { countInbox } from './requests';
import { activeDelegation } from './workflow';
import { myAssessments } from './training';
import { sar, sessionHours } from './sessions';

export async function me(ctx: Ctx, mustChangePassword: boolean): Promise<Me> {
  const dir = await directory(ctx);
  const id = ctx.actor!;
  const p = dir.people.get(id)!;
  const pos = p.positionId ? dir.positions.get(p.positionId) : undefined;
  const team = teamOf(dir, id);
  const [approvals, myOpen, assessments, unread, deleg, trainer] = await Promise.all([
    countInbox(ctx),
    ctx.store.count('requests', { personId: id, statusCode: 'PENDING' }),
    myAssessments(ctx),
    ctx.store.count('notifications', { personId: id, readFlag: false }),
    activeDelegation(ctx, id, today(ctx)),
    ctx.store.count('sessions', { trainerPersonId: id }),
  ]);
  return {
    personId: id,
    personNumber: p.personNumber,
    fullName: p.fullName,
    email: p.email,
    jobName: p.jobName,
    department: p.department,
    positionId: p.positionId,
    positionName: pos?.name ?? null,
    managerName: nameOf(dir, p.managerId),
    roles: p.roles,
    isManager: (dir.reports.get(id) ?? []).length > 0,
    hasTeam: team.length > 0,
    isTrainer: trainer > 0 || p.roles.includes('TRAINER'),
    canEditJsm: canEditAnyJsm(dir, id),
    mustChangePassword,
    delegatedTo: deleg ? { name: nameOf(dir, deleg.toPersonId) ?? '', until: deleg.endDate } : null,
    counts: {
      approvals,
      myOpen,
      examsOpen: assessments.filter((a) => a.state === 'open').length,
      unread,
      profilesPending: hasRole(dir, id, 'HR_ADMIN') ? [...dir.positions.values()].filter((x) => x.statusCode === 'PENDING').length : 0,
    },
  };
}

/** Position × skill grid of the draft profiles (what the JSM page edits). */
export async function matrix(ctx: Ctx) {
  const [positions, rows] = await Promise.all([
    ctx.store.find('positions', {}, { orderBy: ['name'] }),
    ctx.store.find('positionSkills'),
  ]);
  const cells: Record<number, Record<number, PositionSkill>> = {};
  for (const r of rows) (cells[r.positionId] ??= {})[r.skillId] = toPositionSkill(r);
  return { positions: positions.map((p) => ({ id: p.id, name: p.name, grade: p.grade, status: p.statusCode, versionNo: p.versionNo })), cells };
}

async function profilesFor(ctx: Ctx, positions: R<'positions'>[]) {
  const map = new Map<number, Map<number, PositionSkill>>();
  for (const p of positions) map.set(p.id, await effectiveProfile(ctx, p));
  return map;
}

/** Readiness and gaps for a set of people. */
async function peopleView(ctx: Ctx, ids: number[]) {
  const dir = await directory(ctx);
  const positions = [...new Set(ids.map((i) => dir.people.get(i)?.positionId).filter((x): x is number => !!x))]
    .map((id) => dir.positions.get(id))
    .filter((x): x is R<'positions'> => !!x);
  const profiles = await profilesFor(ctx, positions);
  const levels = ids.length ? await ctx.store.find('employeeSkills', { personId: ids }) : [];
  return ids.map((id) => {
    const ref = personRef(dir, id);
    const prof = ref.positionId ? (profiles.get(ref.positionId) ?? new Map()) : new Map<number, PositionSkill>();
    const mine = new Map(levels.filter((l) => l.personId === id).map((l) => [l.skillId, l]));
    const gaps = [...prof.values()]
      .filter((p) => p.requirement !== 'U' && (mine.get(p.skillId)?.skillLevel ?? 0) < p.targetLevel)
      .map((p) => ({ skillId: p.skillId, current: mine.get(p.skillId)?.skillLevel ?? 0, target: p.targetLevel, critical: p.critical, requirement: p.requirement }));
    const lastAssessed = [...mine.values()].map((l) => l.assessedAt).sort().at(-1) ?? null;
    return { ...ref, managerName: nameOf(dir, dir.people.get(id)?.managerId), readiness: Math.round(readiness(prof, mine) * 100), gaps, lastAssessed };
  });
}

export async function team(ctx: Ctx) {
  const dir = await directory(ctx);
  const ids = hasRole(dir, ctx.actor!, 'HR_ADMIN') && !teamOf(dir, ctx.actor!).length
    ? [...dir.people.values()].filter((p) => p.active && p.positionId).map((p) => p.personId)
    : teamOf(dir, ctx.actor!);
  return peopleView(ctx, ids);
}

/** Gap analysis across a position (HR / owner) — who needs what. */
export async function gaps(ctx: Ctx, positionId?: number) {
  const dir = await directory(ctx);
  const actor = ctx.actor!;
  const allowed = hasRole(dir, actor, 'HR_ADMIN', 'HR_LEAD') || canEditAnyJsm(dir, actor);
  if (!allowed && !teamOf(dir, actor).length) throw forbidden();
  const scope = allowed ? [...dir.people.values()].filter((p) => p.active && p.positionId) : teamOf(dir, actor).map((i) => dir.people.get(i)!);
  const ids = scope.filter((p) => !positionId || p.positionId === positionId).map((p) => p.personId);
  return peopleView(ctx, ids);
}

export async function reports(ctx: Ctx) {
  const dir = await directory(ctx);
  const actor = ctx.actor!;
  const hr = hasRole(dir, actor, 'HR_ADMIN', 'HR_LEAD', 'FINANCE');
  const scope = hr ? null : new Set([...teamOf(dir, actor), actor]);
  if (!hr && scope!.size <= 1) throw forbidden();
  const [allReqs, sessions, skills] = await Promise.all([ctx.store.find('requests'), ctx.store.find('sessions'), ctx.store.find('skills')]);
  const reqs = scope ? allReqs.filter((r) => scope.has(r.personId)) : allReqs;
  const ses = new Map(sessions.map((s) => [s.id, s]));
  const st = (r: R<'requests'>) => r.statusCode as RequestStatus;
  const committed = reqs.filter((r) => [...SEATED_STATUSES, 'PENDING', 'WAITLISTED'].includes(st(r)));
  const spend = committed.reduce((a, r) => a + sar(ses.get(r.sessionId)?.costHalalas ?? 0), 0);
  const budget = settingInt(await settings(ctx), 'ANNUAL_BUDGET_SAR');
  const status: Record<string, number> = {};
  for (const r of reqs) status[r.statusCode] = (status[r.statusCode] ?? 0) + 1;
  const done = reqs.filter((r) => ['COMPLETED', 'NOT_PASSED'].includes(st(r)));
  const completion = done.length ? Math.round((done.filter((r) => st(r) === 'COMPLETED').length / done.length) * 100) : 0;
  const decided = reqs.filter((r) => r.decidedAt);
  const avgApproval = decided.length
    ? Math.round((decided.reduce((a, r) => a + daysBetween(r.createdAt, r.decidedAt!), 0) / decided.length) * 10) / 10
    : 0;

  const byPosition = new Map<string, { delivered: number; pipeline: number }>();
  for (const r of reqs) {
    const pos = personRef(dir, r.personId).positionName ?? 'Unmapped';
    const s = ses.get(r.sessionId);
    if (!s) continue;
    const h = sessionHours(s);
    const row = byPosition.get(pos) ?? { delivered: 0, pipeline: 0 };
    if (['ATTENDED', 'COMPLETED', 'NOT_PASSED'].includes(st(r))) row.delivered += h;
    else if (ACTIVE_STATUSES.includes(st(r))) row.pipeline += h;
    else continue;
    byPosition.set(pos, row);
  }

  const people = await peopleView(ctx, scope ? [...scope] : [...dir.people.values()].filter((p) => p.active && p.positionId).map((p) => p.personId));
  const t = today(ctx);
  const demand = skills
    .map((s) => ({
      skillId: s.id,
      skillName: s.name,
      people: people.filter((p) => p.gaps.some((g) => g.skillId === s.id)).length,
      critical: people.filter((p) => p.gaps.some((g) => g.skillId === s.id && g.critical)).length,
      seats: sessions
        .filter((x) => x.skillId === s.id && x.startDate > t && x.statusCode === 'SCHEDULED')
        .reduce((a, x) => a + Math.max(0, x.capacity - x.externalSeats - allReqs.filter((r) => r.sessionId === x.id && SEATED_STATUSES.includes(st(r))).length), 0),
    }))
    .filter((d) => d.people)
    .sort((a, b) => b.critical - a.critical || b.people - a.people)
    .slice(0, 12);

  const readinessByPosition = new Map<string, { sum: number; n: number }>();
  for (const p of people) {
    if (!p.positionName) continue;
    const x = readinessByPosition.get(p.positionName) ?? { sum: 0, n: 0 };
    x.sum += p.readiness;
    x.n++;
    readinessByPosition.set(p.positionName, x);
  }
  const months: Record<string, number> = {};
  for (const r of committed) {
    const s = ses.get(r.sessionId);
    if (s && s.costHalalas) months[s.startDate.slice(0, 7)] = (months[s.startDate.slice(0, 7)] ?? 0) + sar(s.costHalalas);
  }
  return {
    scope: hr ? 'All employees' : 'Your team',
    kpis: { spend, budget, requests: reqs.length, pending: status.PENDING ?? 0, completion, avgApproval },
    status,
    hoursByPosition: [...byPosition.entries()].map(([position, v]) => ({ position, ...v })).sort((a, b) => b.delivered + b.pipeline - (a.delivered + a.pipeline)),
    demand,
    readiness: [...readinessByPosition.entries()].map(([position, v]) => ({ position, readiness: Math.round(v.sum / v.n), people: v.n })).sort((a, b) => a.readiness - b.readiness),
    spendByMonth: Object.entries(months).sort().map(([month, amount]) => ({ month, amount })),
  };
}

export async function requestsCsv(ctx: Ctx) {
  const dir = await directory(ctx);
  if (!hasRole(dir, ctx.actor!, 'HR_ADMIN', 'HR_LEAD', 'FINANCE')) throw forbidden();
  const [reqs, sessions] = await Promise.all([ctx.store.find('requests', {}, { orderBy: ['-createdAt'] }), ctx.store.find('sessions')]);
  const ses = new Map(sessions.map((s) => [s.id, s]));
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Request', 'Person number', 'Employee', 'Position', 'Session', 'Type', 'Start', 'End', 'Cost SAR', 'Status', 'Created', 'Decided'].map(esc).join(',')];
  for (const r of reqs) {
    const s = ses.get(r.sessionId);
    const p = dir.people.get(r.personId);
    lines.push(
      [r.requestNo, p?.personNumber, p?.fullName, personRef(dir, r.personId).positionName, s?.title, s?.sessionType, s?.startDate, s?.endDate, sar(s?.costHalalas ?? 0), r.statusCode, r.createdAt.slice(0, 10), r.decidedAt?.slice(0, 10)]
        .map(esc)
        .join(','),
    );
  }
  return lines.join('\r\n');
}
