// Dashboard (CI3 / home): the same figures as the CI3 overview, for the payroll period ending on
// the latest processed date, in the Zamil report design (KPI tiles and bar chart).
import { useQuery } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { dashboardSchema, phpNumberFormat, type Dashboard } from '@attendance/shared';
import { Badge } from '../../components/Badge';
import { ContentSkeleton } from '../../components/Feedback';
import { api, errorMessage } from '../../lib/api';

function Kpis({ data }: { data: Dashboard }) {
  const n = (value: number) => phpNumberFormat(value);
  const tiles: [string, string, string?][] = [
    [
      'Payroll Readiness',
      `${Math.max(0, Math.min(100, data.process.coverage))}%`,
      `${n(data.process.processedEmployees)} of ${n(data.process.assignedEmployees)} assigned employees processed`,
    ],
    ['Total Employees', n(data.totalEmployees)],
    ['Missing Timetable', n(data.missingTimetableEmployees)],
    ['Blank Punch Employees', n(data.blankPunchEmployees)],
    [
      'Overtime Hours',
      phpNumberFormat(data.overtimeHours, 1),
      `${n(data.employeesWithOvertime)} employees with overtime`,
    ],
  ];
  return (
    <section className="zrv-hr-rp-kpis zat-kpis-5" aria-label="Executive KPIs">
      {tiles.map(([label, value, note], index) => (
        <div key={label} className="zrv-hr-rp-kpi" style={{ '--i': index } as CSSProperties}>
          <small>{label}</small>
          <b>{value}</b>
          {note && <span>{note}</span>}
        </div>
      ))}
    </section>
  );
}

function DepartmentBars({ rows }: { rows: Dashboard['departments'] }) {
  if (rows.length === 0) return <p className="zrv-admin-state">No department data available.</p>;
  const max = Math.max(1, ...rows.map((r) => r.employeeCount));
  return (
    <ul className="zrv-hr-rp-bars" aria-label="Employee headcount by department">
      {rows.map((row, index) => (
        <li key={row.department}>
          <button
            type="button"
            disabled
            title={`${row.department}: ${row.employeeCount} employees`}
          >
            <span className="zrv-hr-rp-bars__l">{row.department}</span>
            <span className="zrv-hr-rp-bars__t" aria-hidden="true">
              <i
                style={{
                  transform: `scaleX(${row.employeeCount / max})`,
                  transitionDelay: `${index * 40}ms`,
                }}
              />
            </span>
            <b>{row.employeeCount}</b>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function DashboardPage() {
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: ({ signal }) => api('/dashboard', dashboardSchema, { signal }),
  });
  const data = query.data;
  const ready = data && data.process.coverage >= 95;

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
            Employee coverage, attendance processing, payroll readiness, overtime and exceptions
            requiring action.
          </p>
          {data && (
            <p className="zat-period">
              Payroll Period: {data.period.fromLabel} – {data.period.toLabel}
              <span> · Updated {data.period.generatedAt}</span>
            </p>
          )}
        </div>
        {data && (
          <div className="zrv-ir-head__actions">
            <span role="status">
              <Badge tone={ready ? 'good' : 'warn'}>{data.process.statusText}</Badge>
            </span>
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
        <div className="zat-dashboard">
          <Kpis data={query.data} />
          <section
            className="zrv-hr-rp-card zat-dashboard__card"
            aria-labelledby="dash-departments"
          >
            <h3 id="dash-departments">
              Department Snapshot <small>Employee headcount by department.</small>
            </h3>
            <DepartmentBars rows={query.data.departments} />
          </section>
        </div>
      )}
    </div>
  );
}
