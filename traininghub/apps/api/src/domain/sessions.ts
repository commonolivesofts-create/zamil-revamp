// Training sessions (catalog / schedule) and seat accounting.
import {
  SEATED_STATUSES,
  type RequestStatus,
  type Session,
  type SessionInput,
} from '@traininghub/shared';
import type { R } from '../db/tables';
import { daysBetween } from '../lib/dates';
import { forbidden, invalid, notFound, validation } from '../lib/errors';
import { audit, directory, hasRole, nameOf, notify, nowIso, today, type Ctx } from './ctx';
import { effectiveProfile } from './profiles';

export const sar = (halalas: number) => halalas / 100;
export const halalas = (sarValue: number) => Math.round(sarValue * 100);

export function sessionHours(s: Pick<R<'sessions'>, 'startDate' | 'endDate' | 'startTime' | 'endTime'>): number {
  const days = daysBetween(s.startDate, s.endDate) + 1;
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return Math.round(((days * (mins(s.endTime) - mins(s.startTime))) / 60) * 10) / 10;
}

export function overlaps(
  a: Pick<R<'sessions'>, 'startDate' | 'endDate' | 'startTime' | 'endTime'>,
  b: Pick<R<'sessions'>, 'startDate' | 'endDate' | 'startTime' | 'endTime'>,
) {
  return a.startDate <= b.endDate && b.startDate <= a.endDate && a.startTime < b.endTime && b.startTime < a.endTime;
}

export interface SessionLookups {
  skills: Map<number, R<'skills'>>;
  requests: R<'requests'>[];
  exams: Map<number, R<'exams'>>;
  trainerName: (id: number | null) => string | null;
}

export async function sessionLookups(ctx: Ctx, sessionIds?: number[]): Promise<SessionLookups> {
  const dir = await directory(ctx);
  const [skills, requests, exams] = await Promise.all([
    ctx.store.find('skills'),
    ctx.store.find('requests', sessionIds ? { sessionId: sessionIds } : {}),
    ctx.store.find('exams', sessionIds ? { sessionId: sessionIds } : {}),
  ]);
  return {
    skills: new Map(skills.map((s) => [s.id, s])),
    requests,
    exams: new Map(exams.map((e) => [e.sessionId, e])),
    trainerName: (id) => nameOf(dir, id),
  };
}

export function seatsTaken(s: R<'sessions'>, requests: R<'requests'>[]): number {
  return (
    s.externalSeats +
    requests.filter((r) => r.sessionId === s.id && SEATED_STATUSES.includes(r.statusCode as RequestStatus)).length
  );
}

export function toSession(s: R<'sessions'>, L: SessionLookups): Session {
  const taken = seatsTaken(s, L.requests);
  const exam = L.exams.get(s.id);
  return {
    id: s.id,
    title: s.title,
    skillId: s.skillId,
    skillName: L.skills.get(s.skillId)?.name ?? '',
    sessionType: s.sessionType as Session['sessionType'],
    trainerPersonId: s.trainerPersonId,
    trainerName: L.trainerName(s.trainerPersonId),
    provider: s.provider ?? '',
    startDate: s.startDate,
    endDate: s.endDate,
    startTime: s.startTime,
    endTime: s.endTime,
    capacity: s.capacity,
    externalSeats: s.externalSeats,
    seatsTaken: taken,
    seatsLeft: Math.max(0, s.capacity - taken),
    waitlist: L.requests.filter((r) => r.sessionId === s.id && r.statusCode === 'WAITLISTED').length,
    bandFrom: s.bandFrom,
    bandTo: s.bandTo,
    costSar: sar(s.costHalalas),
    location: s.location ?? '',
    deliveryMode: s.deliveryMode as Session['deliveryMode'],
    description: s.description ?? '',
    status: s.statusCode as Session['status'],
    attendanceLocked: !!s.attendanceLockedAt,
    examStatus: (exam?.statusCode as Session['examStatus']) ?? null,
    resultsReleased: exam?.releasedFlag ?? false,
    hours: sessionHours(s),
  };
}

export async function listSessions(ctx: Ctx, filter: { from?: string; to?: string; skillId?: number } = {}) {
  let rows = await ctx.store.find('sessions', filter.skillId ? { skillId: filter.skillId } : {}, {
    orderBy: ['startDate', 'startTime'],
  });
  if (filter.from) rows = rows.filter((s) => s.endDate >= filter.from!);
  if (filter.to) rows = rows.filter((s) => s.startDate <= filter.to!);
  const L = await sessionLookups(ctx);
  return rows.map((s) => toSession(s, L));
}

export async function getSession(ctx: Ctx, id: number): Promise<Session> {
  const s = await ctx.store.one('sessions', { id });
  if (!s) throw notFound('Session');
  return toSession(s, await sessionLookups(ctx, [id]));
}

async function checkSession(ctx: Ctx, input: SessionInput, id: number | null) {
  const fields: Record<string, string> = {};
  const skill = await ctx.store.one('skills', { id: input.skillId });
  if (!skill) fields.skillId = 'Choose the skill this session builds';
  if (!id && input.startDate <= today(ctx)) fields.startDate = 'Must be after today';
  const dir = await directory(ctx);
  if (input.sessionType === 'INTERNAL' && input.trainerPersonId) {
    const t = dir.people.get(input.trainerPersonId);
    if (!t?.active) fields.trainerPersonId = 'Trainer must be an active employee';
    const clash = (await ctx.store.find('sessions', { trainerPersonId: input.trainerPersonId, statusCode: 'SCHEDULED' })).find(
      (x) => x.id !== id && overlaps(x, input),
    );
    if (clash) fields.trainerPersonId = `${t?.fullName ?? 'Trainer'} is already training “${clash.title}” at that time`;
  }
  if (id) {
    const reqs = await ctx.store.find('requests', { sessionId: id });
    const confirmed = reqs.filter((r) => SEATED_STATUSES.includes(r.statusCode as RequestStatus)).length;
    if (input.capacity < confirmed + input.externalSeats)
      fields.capacity = `Cannot be below ${confirmed + input.externalSeats} confirmed seats`;
  }
  if (Object.keys(fields).length) throw validation('Check the highlighted fields', fields);
}

function sessionRow(input: SessionInput) {
  return {
    title: input.title,
    skillId: input.skillId,
    sessionType: input.sessionType,
    trainerPersonId: input.sessionType === 'INTERNAL' ? input.trainerPersonId : null,
    provider: input.provider || null,
    startDate: input.startDate,
    endDate: input.endDate,
    startTime: input.startTime,
    endTime: input.endTime,
    capacity: input.capacity,
    externalSeats: input.externalSeats,
    bandFrom: input.bandFrom,
    bandTo: input.bandTo,
    costHalalas: halalas(input.costSar),
    location: input.location,
    deliveryMode: input.deliveryMode,
    description: input.description || null,
  };
}

/** Employees whose approved profile needs this skill and whose level is in the band. */
async function matchingEmployees(ctx: Ctx, s: Pick<R<'sessions'>, 'skillId' | 'bandFrom' | 'bandTo'>) {
  const dir = await directory(ctx);
  const out: number[] = [];
  const levels = new Map(
    (await ctx.store.find('employeeSkills', { skillId: s.skillId })).map((l) => [l.personId, l.skillLevel]),
  );
  const profiles = new Map<number, Awaited<ReturnType<typeof effectiveProfile>>>();
  for (const p of dir.people.values()) {
    if (!p.active || !p.positionId) continue;
    const pos = dir.positions.get(p.positionId);
    if (!pos || pos.versionNo === 0) continue;
    if (!profiles.has(pos.id)) profiles.set(pos.id, await effectiveProfile(ctx, pos));
    const need = profiles.get(pos.id)!.get(s.skillId);
    if (!need || need.requirement === 'U') continue;
    const cur = levels.get(p.personId) ?? 0;
    if (cur < need.targetLevel && cur >= s.bandFrom && cur <= s.bandTo) out.push(p.personId);
  }
  return out;
}

export async function createSession(ctx: Ctx, input: SessionInput) {
  const dir = await directory(ctx);
  if (!hasRole(dir, ctx.actor!, 'HR_ADMIN')) throw forbidden('Only HR schedules sessions');
  await checkSession(ctx, input, null);
  const at = nowIso(ctx);
  const s = await ctx.store.tx(async () => {
    const row = await ctx.store.insert('sessions', {
      ...sessionRow(input),
      statusCode: 'SCHEDULED',
      createdBy: ctx.actor,
      createdAt: at,
      updatedAt: at,
    });
    await audit(ctx, 'Published session', 'SESSION', row.title);
    return row;
  });
  const matches = await matchingEmployees(ctx, s);
  for (const pid of matches) await notify(ctx, pid, `New session matches your skill gap: ${s.title}`, `/catalog?session=${s.id}`);
  if (s.trainerPersonId) await notify(ctx, s.trainerPersonId, `You are the trainer for ${s.title} (${s.startDate})`, '/attendance');
  return { id: s.id, notified: matches.length };
}

export async function updateSession(ctx: Ctx, id: number, input: SessionInput) {
  const dir = await directory(ctx);
  if (!hasRole(dir, ctx.actor!, 'HR_ADMIN')) throw forbidden('Only HR edits sessions');
  const cur = await ctx.store.one('sessions', { id });
  if (!cur) throw notFound('Session');
  if (cur.statusCode === 'CANCELLED') throw invalid('This session is cancelled');
  if (cur.attendanceLockedAt) throw invalid('Attendance is locked — the session can no longer change');
  await checkSession(ctx, input, id);
  await ctx.store.tx(async () => {
    await ctx.store.update('sessions', { id }, { ...sessionRow(input), updatedAt: nowIso(ctx) });
    await audit(ctx, 'Edited session', 'SESSION', input.title);
  });
  const { promoteWaitlist } = await import('./requests');
  await promoteWaitlist(ctx, id);
}

export async function cancelSession(ctx: Ctx, id: number, comment: string) {
  const dir = await directory(ctx);
  if (!hasRole(dir, ctx.actor!, 'HR_ADMIN')) throw forbidden('Only HR cancels sessions');
  const s = await ctx.store.one('sessions', { id });
  if (!s) throw notFound('Session');
  if (s.attendanceLockedAt) throw invalid('Attendance is locked — the session took place');
  if (comment.length < 5) throw validation('Give a reason', { comment: 'At least 5 characters' });
  const reqs = await ctx.store.find('requests', { sessionId: id, statusCode: ['PENDING', 'APPROVED', 'WAITLISTED'] });
  await ctx.store.tx(async () => {
    await ctx.store.update('sessions', { id }, { statusCode: 'CANCELLED', updatedAt: nowIso(ctx) });
    for (const r of reqs) {
      await ctx.store.update('requests', { id: r.id }, { statusCode: 'WITHDRAWN', currentStepNo: null, updatedAt: nowIso(ctx) });
      await ctx.store.update('approvalSteps', { requestId: r.id, statusCode: ['WAITING', 'PENDING'] }, { statusCode: 'CANCELLED' });
      await notify(ctx, r.personId, `${s.title} was cancelled: “${comment}”`, `/requests/${r.id}`);
    }
    await audit(ctx, `Cancelled session (${reqs.length} requests withdrawn)`, 'SESSION', s.title, { comment });
  });
  return { withdrawn: reqs.length };
}
