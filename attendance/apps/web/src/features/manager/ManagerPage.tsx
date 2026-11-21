// Manager View (CI3 /manager): the signed-in manager's direct reports with today's status and this
// period's figures, the approval queue (now with working Approve / Deny) and CI3's access model card.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type CSSProperties } from 'react';
import {
  managerViewSchema,
  mutationResultSchema,
  phpNumberFormat,
  type ManagerApproval,
  type ManagerEmployee,
} from '@attendance/shared';
import { Badge, type Tone } from '../../components/Badge';
import { ContentSkeleton } from '../../components/Feedback';
import { useToast } from '../../components/toastContext';
import { api, errorMessage } from '../../lib/api';
import { display } from '../../lib/format';

const TODAY_TONE: Record<string, Tone> = {
  present: 'good',
  late: 'warn',
  absent: 'bad',
  leave: 'neutral',
};
const n = (v: number) => phpNumberFormat(v);

/** CI3 "This Period" cell: absences first, then late days, then overtime, else 0. */
function periodText(e: ManagerEmployee) {
  if (Math.trunc(e.periodAbsenceDays) > 0) {
    const days = Math.trunc(e.periodAbsenceDays);
    return `${n(days)} ${days === 1 ? 'absence' : 'absences'}`;
  }
  if (e.periodLateDays > 0) return `${n(e.periodLateDays)} late days`;
  if (parseFloat(e.periodOvertimeHours || '0') > 0) return `${e.periodOvertimeHours} OT hrs`;
  return '0';
}

const initials = (name: string | null) =>
  (name ?? '')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .join('')
    .slice(0, 2);

function ApprovalRow({
  approval,
  onDone,
}: {
  approval: ManagerApproval;
  onDone: () => Promise<void>;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const decide = async (decision: 'APPROVE' | 'DENY') => {
    setPending(true);
    try {
      const result = await api('/manager/decision', mutationResultSchema, {
        method: 'POST',
        body: {
          empNo: approval.empNo,
          leaveStartDate: approval.leaveStartDate,
          leaveEndDate: approval.leaveEndDate,
          decision,
        },
      });
      toast.success(result.message);
      await onDone();
    } catch (error) {
      toast.error(errorMessage(error));
      setPending(false);
    }
  };
  return (
    <li className="zat-approval">
      <div>
        <strong>
          {approval.fullName || approval.empNo} - {approval.leaveType || 'Leave'}
        </strong>
        <small>
          {approval.leaveStartDate} to {approval.leaveEndDate}
          {approval.totalDays ? ` | ${approval.totalDays} day(s)` : ''}
        </small>
      </div>
      <Badge tone="warn">{display(approval.approvalStatus)}</Badge>
      <span className="zat-approval__actions">
        <button
          type="button"
          className="btn-primary"
          disabled={pending}
          onClick={() => void decide('APPROVE')}
        >
          Approve
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={pending}
          onClick={() => void decide('DENY')}
        >
          Deny
        </button>
      </span>
    </li>
  );
}

const ACCESS_MODEL: [string, string, string][] = [
  [
    'Line Manager',
    'Own department / direct reports (via existing "Department" field)',
    'Approve leave & OT, view timesheet, flag exceptions',
  ],
  [
    'Department Head',
    'All employees under their department tree',
    'Above + reassign shifts, view payroll summary (no salary detail)',
  ],
  ['HR Officer', 'All employees', 'Full attendance admin, no payroll amount edit'],
  ['Payroll Admin', 'All employees', 'Full access incl. Payroll File export to Oracle Fusion'],
];

export default function ManagerPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['manager'],
    queryFn: ({ signal }) => api('/manager', managerViewSchema, { signal }),
  });
  const data = query.data;

  return (
    <div className="zrv-hr zrv-hr--manager zrv-hr--compact zrv-ir zrv-ir--fitted zrv-ir--responsive zat-report">
      <header className="zrv-ir-head">
        <div className="zrv-ir-head__title">
          <nav aria-label="Breadcrumb">
            <ol className="zrv-ir-crumb">
              <li>Attendance</li>
              <li>Main</li>
              <li>Manager View</li>
            </ol>
          </nav>
          <h1 className="zrv-hr-title">Manager View</h1>
          {data && (
            <p className="zrv-hr-sub">
              Payroll period {data.period.fromLabel} – {data.period.toLabel} · Today:{' '}
              {data.period.todayLabel}
            </p>
          )}
        </div>
      </header>

      {query.isPending ? (
        <ContentSkeleton label="Loading manager view" />
      ) : query.isError ? (
        <div className="zrv-admin-state zrv-admin-state--error" role="alert">
          <p>The manager view could not be loaded. {errorMessage(query.error)}</p>
          <button type="button" className="btn-secondary" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <div className="zat-dashboard">
          {!query.data.ebsAvailable && (
            <p className="zrv-admin-feedback zrv-admin-feedback--error" role="alert">
              {query.data.ebsMessage} Today&apos;s status and this period&apos;s late days and
              overtime are not shown.
            </p>
          )}
          <section className="zrv-hr-rp-kpis zat-kpis-5" aria-label="Team summary">
            {(
              [
                ['Team Size', query.data.summary.teamSize],
                ['Present Today', query.data.summary.presentToday],
                ['Late Today', query.data.summary.lateToday],
                ['Absent Today', query.data.summary.absentToday],
                ['Pending Approvals', query.data.summary.pendingApprovals],
              ] as const
            ).map(([label, value], index) => (
              <div key={label} className="zrv-hr-rp-kpi" style={{ '--i': index } as CSSProperties}>
                <small>{label}</small>
                <b>{n(value)}</b>
              </div>
            ))}
          </section>

          <div className="zat-grid-2">
            <section className="zrv-ir-card" aria-labelledby="mgr-team">
              <header className="zrv-ir-card__head">
                <h2 id="mgr-team">My Team</h2>
              </header>
              <p className="zat-muted zat-card-note">
                Today&apos;s status and this period&apos;s rollups, pulled from Timesheet.
              </p>
              {query.data.employees.length === 0 ? (
                <p className="zrv-admin-state">No employees found for this department.</p>
              ) : (
                <div className="zrv-ir-tablewrap">
                  <table className="zrv-ir-table zrv-report-table">
                    <thead>
                      <tr>
                        <th scope="col">Employee</th>
                        <th scope="col">Today</th>
                        <th scope="col">This Period</th>
                        <th scope="col">Pending</th>
                      </tr>
                    </thead>
                    <tbody>
                      {query.data.employees.map((e) => (
                        <tr key={e.empNo}>
                          <td data-label="Employee">
                            <span className="zat-person zat-person--row">
                              <span className="zat-avatar" aria-hidden="true">
                                {initials(e.fullName)}
                              </span>
                              {e.fullName ?? e.empNo}
                            </span>
                          </td>
                          <td data-label="Today">
                            <Badge tone={TODAY_TONE[e.todayStatus.key] ?? 'neutral'}>
                              {e.todayStatus.label}
                            </Badge>
                          </td>
                          <td data-label="This Period">{periodText(e)}</td>
                          <td data-label="Pending">
                            {e.pendingCount > 0 ? (
                              <Badge tone="warn">{`${n(e.pendingCount)} pending`}</Badge>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="zrv-ir-card" aria-labelledby="mgr-approvals">
              <header className="zrv-ir-card__head">
                <h2 id="mgr-approvals">Approval Queue</h2>
              </header>
              <p className="zat-muted zat-card-note">
                Pending leave requests submitted by your team members.
              </p>
              {query.data.approvals.length === 0 ? (
                <p className="zrv-admin-state">No pending requests for this team.</p>
              ) : (
                <ul className="zat-approvals">
                  {query.data.approvals.map((a) => (
                    <ApprovalRow
                      key={`${a.empNo}|${a.leaveStartDate}|${a.leaveEndDate}`}
                      approval={a}
                      onDone={() => queryClient.invalidateQueries({ queryKey: ['manager'] })}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="zrv-ir-card" aria-labelledby="mgr-access">
            <header className="zrv-ir-card__head">
              <h2 id="mgr-access">Access Model</h2>
            </header>
            <p className="zat-muted zat-card-note">
              How the scoping would work against the existing Employee Details table
            </p>
            <div className="zrv-ir-tablewrap">
              <table className="zrv-ir-table zrv-report-table">
                <thead>
                  <tr>
                    <th scope="col">Role</th>
                    <th scope="col">Sees</th>
                    <th scope="col">Can Do</th>
                  </tr>
                </thead>
                <tbody>
                  {ACCESS_MODEL.map(([role, sees, can]) => (
                    <tr key={role}>
                      <td data-label="Role">
                        <Badge tone="neutral">{role}</Badge>
                      </td>
                      <td data-label="Sees">{sees}</td>
                      <td data-label="Can Do">{can}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
