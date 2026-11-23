// Dashboard (CI3 / home): the CI3 overview figures for the payroll period ending on the latest
// processed date, presented as an "attendance pulse": gradient period hero with a day heat strip,
// KPI cards, attendance-rate area chart, payroll checklist, leave mix, leaderboards and
// department headcount. Every figure comes from the same processed sheet as CI3's overview.
import { useQuery } from '@tanstack/react-query';
import { dashboardSchema, type Dashboard } from '@attendance/shared';
import { ContentSkeleton } from '../../components/Feedback';
import { OrvexaIcon } from '../../components/OrvexaIcon';
import { api, errorMessage } from '../../lib/api';
import {
  Checklist,
  Departments,
  Hero,
  KpiCards,
  LeaveMix,
  Panel,
  Ranking,
  RateChart,
  type Kpi,
} from './widgets';
import { dayRate } from './pulse';

function kpis(d: Dashboard): Kpi[] {
  const days = Math.max(1, d.trend.length);
  const avgPresent = d.trend.reduce((s, r) => s + r.present, 0) / days;
  return [
    {
      label: 'Workforce',
      value: d.totalEmployees,
      note: `Current employees in ${d.departments.length} departments`,
      icon: 'users',
      tone: 'indigo',
    },
    {
      label: 'Present per Day',
      value: avgPresent,
      note: 'Average employees with a punch',
      icon: 'user-check',
      tone: 'teal',
      spark: d.trend.map((r) => r.present),
    },
    {
      label: 'Overtime',
      value: d.overtimeHours,
      decimals: 1,
      suffix: ' h',
      note: `${d.employeesWithOvertime} employees earned overtime`,
      icon: 'timer',
      tone: 'violet',
    },
    {
      label: 'Late Arrivals',
      value: d.exceptions.lateMinutes / 60,
      decimals: 1,
      suffix: ' h',
      note: `${d.exceptions.lateEmployees} employees · ${(d.exceptions.earlyMinutes / 60).toFixed(1)} h early out`,
      icon: 'alarm-clock',
      tone: 'amber',
      spark: d.trend.map((r) => r.late),
    },
    {
      label: 'Unauthorised Absence',
      value: d.exceptions.absentDays,
      suffix: ' days',
      note: `${d.exceptions.absentEmployees} employees absent without permission`,
      icon: 'user-x',
      tone: 'rose',
      spark: d.trend.map((r) => r.absent),
    },
  ];
}

function Overview({ data }: { data: Dashboard }) {
  const p = data.process;
  const ready = p.coverage >= 95;
  const lowDays = data.trend.filter((r) => dayRate(r) < 70).length;
  return (
    <div className="zat-pulse">
      <Hero data={data} ready={ready} />
      <KpiCards items={kpis(data)} />

      <div className="zat-pulse-row zat-pulse-row--wide">
        <Panel
          id="dash-rate"
          icon="activity"
          title="Attendance Rate"
          note="Share of scheduled employees present on each processed day."
        >
          <RateChart rows={data.trend} />
        </Panel>
        <Panel
          id="dash-checklist"
          icon="list-checks"
          title="Payroll Checklist"
          note="Resolve open steps before releasing the payroll file."
        >
          <Checklist
            items={[
              {
                label: 'Attendance processed',
                detail: `${p.processedEmployees} of ${p.assignedEmployees} employees`,
                value: p.coverage,
                href: '/processattendance',
                suffix: '%',
                done: ready,
              },
              {
                label: 'Timetables assigned',
                detail: 'Active employees without a shift',
                value: data.missingTimetableEmployees,
                href: '/timetable',
                done: data.missingTimetableEmployees === 0,
              },
              {
                label: 'Unauthorised absence reviewed',
                detail: 'Days absent without permission',
                value: data.exceptions.absentDays,
                href: '/alerts-exceptions',
                done: data.exceptions.absentDays === 0,
              },
              {
                label: 'Low-attendance days checked',
                detail: 'Days below 70% attendance',
                value: lowDays,
                href: '/report/timesheet',
                done: lowDays === 0,
              },
              {
                label: 'Blank punch employees',
                detail: 'CI3 figure (distinct supervisors)',
                value: data.blankPunchEmployees,
                href: '/report/attendance-card',
                done: data.blankPunchEmployees === 0,
              },
            ]}
          />
        </Panel>
      </div>

      <div className="zat-pulse-row zat-pulse-row--thirds">
        <Panel
          id="dash-leave"
          icon="calendar-x"
          title="Leave & Absence Mix"
          note="Days by type, weekends excluded."
        >
          <LeaveMix rows={data.absenceTypes} />
        </Panel>
        <Panel
          id="dash-overtime"
          icon="trending-up"
          title="Overtime Leaders"
          note="Hours this period."
        >
          <Ranking
            rows={data.topOvertime}
            unit="h"
            tone="violet"
            empty="No overtime recorded this period."
          />
        </Panel>
        <Panel
          id="dash-late"
          icon="clock-alert"
          title="Lateness Watchlist"
          note="Late minutes this period."
        >
          <Ranking
            rows={data.topLate}
            unit="min"
            tone="amber"
            decimals={0}
            empty="No late arrivals this period."
          />
        </Panel>
      </div>

      <Panel
        id="dash-departments"
        icon="building-2"
        title="Department Headcount"
        note="Current employees by department, largest first."
      >
        <Departments rows={data.departments} />
      </Panel>
    </div>
  );
}

export default function DashboardPage() {
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: ({ signal }) => api('/dashboard', dashboardSchema, { signal }),
  });

  return (
    <div className="zrv-hr zrv-hr--dashboard zrv-hr--compact zrv-ir zrv-ir--fitted zrv-ir--responsive zat-report">
      <header className="zrv-ir-head">
        <div className="zrv-ir-head__title">
          <nav aria-label="Breadcrumb">
            <ol className="zrv-ir-crumb">
              <li>Attendance</li>
              <li>Main</li>
              <li>Dashboard</li>
            </ol>
          </nav>
          <h1 className="zrv-hr-title">Attendance &amp; Payroll Overview</h1>
          <p className="zrv-hr-sub">
            Workforce attendance, overtime, absence and payroll readiness for the current payroll
            period.
          </p>
        </div>
        {query.data && (
          <div className="zrv-ir-head__actions">
            <button
              type="button"
              className="zrv-ir-btn"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <OrvexaIcon
                name="refresh-cw"
                size={16}
                className={query.isFetching ? 'zat-pulse-spin' : undefined}
              />
              {query.isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        )}
      </header>

      {query.isPending ? (
        <ContentSkeleton label="Loading dashboard" />
      ) : query.isError ? (
        <div className="zrv-admin-state zrv-admin-state--error" role="alert">
          <p>The dashboard could not be loaded. {errorMessage(query.error)}</p>
          <button type="button" className="btn-secondary" onClick={() => void query.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        <Overview data={query.data} />
      )}
    </div>
  );
}
