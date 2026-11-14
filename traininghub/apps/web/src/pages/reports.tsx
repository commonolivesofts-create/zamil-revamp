import { Download } from 'lucide-react';
import { REQUEST_STATUS_LABEL, type RequestStatus } from '@traininghub/shared';
import { useGet, useMe, hasRole } from '../lib/data';
import { Alert, Card, CardHead, Empty, Kpi, Meter, PageHeader, Skeleton, StatusChip } from '../components/ui';

interface Rep {
  scope: string;
  kpis: {
    spend: number;
    budget: number;
    requests: number;
    pending: number;
    completion: number;
    avgApproval: number;
  };
  status: Record<string, number>;
  hoursByPosition: { position: string; delivered: number; pipeline: number }[];
  demand: { skillId: number; skillName: string; people: number; critical: number; seats: number }[];
  readiness: { position: string; readiness: number; people: number }[];
  spendByMonth: { month: string; amount: number }[];
}

export default function Reports() {
  const me = useMe().data;
  const r = useGet<Rep>(['reports'], '/reports');

  if (!r.data) {
    return (
      <div className="th-reports">
        <PageHeader animatedTitle breadcrumb="Analytics" title="Reports" />
        {r.error ? <Alert tone="bad">{r.error.message}</Alert> : <ReportsLoading />}
      </div>
    );
  }

  const d = r.data;
  const maxH = Math.max(1, ...d.hoursByPosition.map((x) => x.delivered + x.pipeline));
  const maxM = Math.max(1, ...d.spendByMonth.map((x) => x.amount));

  return (
    <div className="th-reports">
      <PageHeader
        animatedTitle
        breadcrumb="Analytics"
        title="Reports"
        sub={`${d.scope} · Live view of requests, attendance, exams and assessments.`}
        actions={
          hasRole(me, 'HR_ADMIN', 'HR_LEAD', 'FINANCE') && (
            <a
              href="/api/v1/reports/requests.csv"
              className="th-reports__export inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3.5 text-[12.5px] font-semibold hover:bg-hover"
            >
              <Download className="size-4" />
              Requests (CSV / Excel)
            </a>
          )
        }
      />

      <div className="th-reports__stats">
        <Kpi
          label="Committed spend"
          value={`SAR ${d.kpis.spend.toLocaleString()}`}
          sub={`${d.kpis.budget ? Math.round((d.kpis.spend / d.kpis.budget) * 100) : 0}% of SAR ${d.kpis.budget.toLocaleString()} budget`}
        />
        <Kpi label="Requests" value={d.kpis.requests} sub={`${d.kpis.pending} in approval`} />
        <Kpi label="Pass rate" value={`${d.kpis.completion}%`} sub="of results released" />
        <Kpi label="Avg. approval time" value={`${d.kpis.avgApproval} d`} sub="From submission to decision" />
      </div>

      <div className="th-reports__grid">
        <Card className="th-reports__panel">
          <CardHead
            title="Training hours by position"
            sub="Delivered and in the pipeline"
            actions={
              <span className="th-reports__legend">
                <span>
                  <i className="is-delivered" />
                  Delivered
                </span>
                <span>
                  <i className="is-pipeline" />
                  Pipeline
                </span>
              </span>
            }
          />
          <div className="th-reports__rows">
            {d.hoursByPosition.map((x, index) => (
              <div
                className="th-reports__hours-row"
                key={x.position}
                style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
              >
                <span className="th-reports__row-name" title={x.position}>
                  {x.position}
                </span>
                <div
                  className="th-reports__hours-track"
                  aria-label={`${x.position}: ${Math.round(x.delivered)} delivered hours, ${Math.round(x.pipeline)} pipeline hours`}
                >
                  <i className="is-delivered" style={{ width: `${(x.delivered / maxH) * 100}%` }} />
                  <i className="is-pipeline" style={{ width: `${(x.pipeline / maxH) * 100}%` }} />
                </div>
                <span className="th-reports__row-total">{Math.round(x.delivered + x.pipeline)} h</span>
              </div>
            ))}
            {!d.hoursByPosition.length && <Empty title="No hours yet" />}
          </div>
        </Card>

        <Card className="th-reports__panel">
          <CardHead title="Requests by status" sub="Current request distribution" />
          <div className="th-reports__status-grid">
            {Object.entries(d.status).map(([key, count], index) => (
              <div
                className="th-reports__status-item"
                key={key}
                style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
              >
                <StatusChip status={key as RequestStatus} />
                <b>{count}</b>
              </div>
            ))}
          </div>
          <p className="th-reports__footnote">{Object.keys(REQUEST_STATUS_LABEL).length} possible statuses</p>
        </Card>

        <Card className="th-reports__panel">
          <CardHead
            title="Skill demand vs upcoming seats"
            sub="Employees with a gap, critical gaps and free seats"
          />
          <div className="th-reports__demand-list">
            {d.demand.map((x, index) => (
              <div
                className="th-reports__demand-row"
                key={x.skillId}
                style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
              >
                <b className="th-reports__row-name" title={x.skillName}>
                  {x.skillName}
                </b>
                <span>{x.people} people</span>
                <span className={x.critical ? 'is-critical' : 'is-empty'}>
                  {x.critical ? `★ ${x.critical} critical` : '—'}
                </span>
                <span className={`th-reports__seats ${x.seats < x.people ? 'is-short' : ''}`}>
                  {x.seats} seats
                </span>
              </div>
            ))}
            {!d.demand.length && <Empty title="No skill demand yet" />}
          </div>
        </Card>

        <Card className="th-reports__panel">
          <CardHead title="Readiness by position" sub="Average against the approved profile" />
          <div className="th-reports__rows">
            {d.readiness.map((x, index) => (
              <div
                className="th-reports__readiness-row"
                key={x.position}
                style={{ animationDelay: `${Math.min(index, 10) * 35}ms` }}
              >
                <span className="th-reports__row-name" title={x.position}>
                  {x.position} <small>({x.people})</small>
                </span>
                <Meter value={x.readiness} className="th-reports__meter" />
                <b className="th-reports__row-total">{x.readiness}%</b>
              </div>
            ))}
            {!d.readiness.length && <Empty title="No readiness data yet" />}
          </div>
        </Card>

        {d.spendByMonth.length > 0 && (
          <Card className="th-reports__panel th-reports__panel--wide">
            <CardHead title="External spend by month" sub="Committed spend and requests in approval" />
            <div className="th-reports__spend-chart" role="list" aria-label="External spend by month">
              {d.spendByMonth.map((month, index) => (
                <div
                  className="th-reports__month"
                  role="listitem"
                  key={month.month}
                  style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
                >
                  <small className="th-reports__month-value">{month.amount.toLocaleString()}</small>
                  <div className="th-reports__month-track">
                    <i style={{ height: `${Math.max(4, (month.amount / maxM) * 112)}px` }} />
                  </div>
                  <small className="th-reports__month-label">
                    {new Date(`${month.month}-01`).toLocaleDateString('en-GB', {
                      month: 'short',
                      year: '2-digit',
                    })}
                  </small>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function ReportsLoading() {
  return (
    <div className="th-reports__loading" role="status" aria-live="polite">
      <span className="sr-only">Loading reports</span>
      <div className="th-reports__stats">
        {['Committed spend', 'Requests', 'Pass rate', 'Avg. approval time'].map((label) => (
          <Kpi key={label} label={label} value="" loading />
        ))}
      </div>
      <div className="th-reports__grid">
        {['Training hours by position', 'Requests by status', 'Skill demand', 'Readiness by position'].map(
          (title) => (
            <Card className="th-reports__panel th-reports__loading-panel" key={title}>
              <CardHead title={title} />
              <div className="th-reports__loading-lines">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton className="h-4 w-full rounded-md" key={index} />
                ))}
              </div>
            </Card>
          ),
        )}
      </div>
    </div>
  );
}
