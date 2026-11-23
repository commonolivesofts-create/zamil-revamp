// Manager View (CI3 /manager and /manager/approve-absence):
//   GET  /manager           the signed-in manager's team overview
//   POST /manager/decision  approve or deny a pending request of a team member
import { Router } from 'express';
import {
  managerDecisionSchema,
  payrollPeriodEndingThisMonth,
  phpRound,
  toIsoDate,
  type ManagerView,
  type MutationResult,
} from '@attendance/shared';
import { authOf, requireAuth } from '../../auth/middleware';
import { dMY } from '../../lib/csv';
import { AppError } from '../../lib/errors';
import type { ManagerRepository, PeriodPunchRow } from './repository';

/** CI3 format_decimal: 2 decimals, trailing zeros removed ('' for 0). */
const formatDecimal = (value: number) =>
  phpRound(value, 2).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

/** CI3 resolve_today_status: any punch today = Present, otherwise Absent (late is never set). */
const todayStatus = (punch: { punchIn: string | null; punchOut: string | null } | undefined) =>
  punch && ((punch.punchIn ?? '').trim() !== '' || (punch.punchOut ?? '').trim() !== '')
    ? { key: 'present', label: 'Present' }
    : { key: 'absent', label: 'Absent' };

const unavailable = (error: unknown) => error instanceof AppError && error.code === 'UNAVAILABLE';

export async function buildManagerView(
  repo: ManagerRepository,
  userId: number | null,
  now = new Date(),
) {
  const period = payrollPeriodEndingThisMonth(now);
  const today = toIsoDate(now);
  const view: ManagerView = {
    period: { fromLabel: dMY(period.from)!, toLabel: dMY(period.to)!, todayLabel: dMY(today)! },
    summary: {
      teamSize: 0,
      presentToday: 0,
      lateToday: 0,
      absentToday: 0,
      onLeaveToday: 0,
      pendingApprovals: 0,
    },
    employees: [],
    approvals: [],
    ebsAvailable: true,
    ebsMessage: null,
  };
  if (userId === null) return view;

  const team = await repo.team(userId);
  if (team.length === 0) return view;
  const empNos = team.map((m) => m.empNo);

  // EBS figures: when EBS cannot be reached, the ADW part of the page still shows.
  let punches = new Map<string, { punchIn: string | null; punchOut: string | null }>();
  let periodRows: PeriodPunchRow[] = [];
  try {
    [punches, periodRows] = await Promise.all([
      repo.todayPunches(today, empNos),
      repo.periodPunches(period.from, period.to, empNos),
    ]);
  } catch (error) {
    if (!unavailable(error)) throw error;
    view.ebsAvailable = false;
    view.ebsMessage = (error as AppError).message;
  }
  const [leaveDays, approvals] = await Promise.all([
    repo.approvedLeaveDays(userId, period.from, period.to, empNos),
    repo.pendingRequests(userId),
  ]);

  const lateDays = new Map<string, number>();
  const overtime = new Map<string, number>();
  for (const row of periodRows) {
    if (Math.trunc(row.late) > 0) lateDays.set(row.empNo, (lateDays.get(row.empNo) ?? 0) + 1);
    if (row.totalWorked > row.dutyDuration)
      overtime.set(
        row.empNo,
        (overtime.get(row.empNo) ?? 0) + (row.totalWorked - row.dutyDuration) / 3600,
      );
  }
  const pending = new Map<string, number>();
  for (const a of approvals) pending.set(a.empNo, (pending.get(a.empNo) ?? 0) + 1);

  for (const member of team) {
    const status = todayStatus(punches.get(member.empNo));
    if (status.key === 'present') view.summary.presentToday++;
    else view.summary.absentToday++;
    view.employees.push({
      empNo: member.empNo,
      fullName: member.fullName,
      jobTitle: member.jobTitle,
      todayStatus: status,
      periodAbsenceDays: leaveDays.get(member.empNo) ?? 0,
      periodLateDays: lateDays.get(member.empNo) ?? 0,
      periodOvertimeHours: formatDecimal(overtime.get(member.empNo) ?? 0),
      pendingCount: pending.get(member.empNo) ?? 0,
    });
  }
  view.approvals = approvals;
  view.summary.teamSize = view.employees.length;
  view.summary.pendingApprovals = approvals.length;
  return view;
}

export function managerRoutes(deps: { manager: ManagerRepository }): Router {
  const router = Router();

  router.get('/manager', requireAuth, async (req, res) => {
    res.json(await buildManagerView(deps.manager, authOf(req).userId));
  });

  // Fixed: CI3 had this endpoint and the page script, but never rendered the Approve / Deny
  // buttons, and the endpoint accepted any employee. Only the manager's own team can be decided.
  router.post('/manager/decision', requireAuth, async (req, res) => {
    const parsed = managerDecisionSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new AppError('VALIDATION', 'Missing or invalid parameters.');
    const input = parsed.data;
    const userId = authOf(req).userId;
    const team = userId === null ? [] : await deps.manager.team(userId);
    if (!team.some((member) => member.empNo === input.empNo)) {
      throw new AppError('NOT_FOUND', 'Request not found or already actioned.');
    }
    const status = input.decision === 'APPROVE' ? 'APPROVED' : 'DENIED';
    const changed = await deps.manager.decide(
      input.empNo,
      input.leaveStartDate,
      input.leaveEndDate,
      status,
    );
    if (changed === 0) throw new AppError('NOT_FOUND', 'Request not found or already actioned.');
    const result: MutationResult = { message: `Request ${status.toLowerCase()}.` };
    res.json(result);
  });

  return router;
}
