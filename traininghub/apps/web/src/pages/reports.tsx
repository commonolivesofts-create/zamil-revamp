import { Download } from 'lucide-react';
import { REQUEST_STATUS_LABEL, type RequestStatus } from '@traininghub/shared';
import { useGet, useMe, hasRole } from '../lib/data';
import { Card, CardHead, Empty, Kpi, Meter, PageHeader, Spinner, StatusChip } from '../components/ui';

interface Rep {
  scope: string;
  kpis: { spend: number; budget: number; requests: number; pending: number; completion: number; avgApproval: number };
  status: Record<string, number>;
  hoursByPosition: { position: string; delivered: number; pipeline: number }[];
  demand: { skillId: number; skillName: string; people: number; critical: number; seats: number }[];
  readiness: { position: string; readiness: number; people: number }[];
  spendByMonth: { month: string; amount: number }[];
}

export default function Reports() {
  const me = useMe().data!;
  const r = useGet<Rep>(['reports'], '/reports');
  if (!r.data) return r.error ? <Empty title={r.error.message} /> : <Spinner />;
  const d = r.data;
  const maxH = Math.max(1, ...d.hoursByPosition.map((x) => x.delivered + x.pipeline));
  const maxM = Math.max(1, ...d.spendByMonth.map((x) => x.amount));
  return (
    <>
      <PageHeader eyebrow="Analytics" title="Reports" sub={`${d.scope} · computed live from requests, attendance, exams and assessments.`} actions={hasRole(me, 'HR_ADMIN', 'HR_LEAD', 'FINANCE') && <a href="/api/v1/reports/requests.csv" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-surface px-3.5 text-[12.5px] font-semibold hover:bg-hover"><Download className="size-4" />Requests (CSV / Excel)</a>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Committed spend" value={`SAR ${d.kpis.spend.toLocaleString()}`} sub={`${d.kpis.budget ? Math.round((d.kpis.spend / d.kpis.budget) * 100) : 0}% of SAR ${d.kpis.budget.toLocaleString()} budget`} />
        <Kpi label="Requests" value={d.kpis.requests} sub={`${d.kpis.pending} in approval`} />
        <Kpi label="Pass rate" value={`${d.kpis.completion}%`} sub="of results released" />
        <Kpi label="Avg. approval time" value={`${d.kpis.avgApproval} d`} sub="submit → final decision" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead title="Training hours by position" sub="Delivered vs in the pipeline" actions={<span className="flex gap-3 text-[11px] text-muted"><span className="flex items-center gap-1"><i className="size-2.5 rounded-sm bg-req" />Delivered</span><span className="flex items-center gap-1"><i className="size-2.5 rounded-sm bg-req/35" />Pipeline</span></span>} />
          <div className="space-y-2.5 p-4">
            {d.hoursByPosition.map((x) => (
              <div key={x.position} className="grid grid-cols-[150px_1fr_60px] items-center gap-2 text-[12px]">
                <span className="truncate">{x.position}</span>
                <div className="flex h-3 overflow-hidden rounded bg-na-bg"><i className="bg-req" style={{ width: `${(x.delivered / maxH) * 100}%` }} /><i className="bg-req/35" style={{ width: `${(x.pipeline / maxH) * 100}%` }} /></div>
                <span className="text-right tabular text-muted">{Math.round(x.delivered + x.pipeline)} h</span>
              </div>
            ))}
            {!d.hoursByPosition.length && <Empty title="No hours yet" />}
          </div>
        </Card>
        <Card>
          <CardHead title="Requests by status" />
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
            {Object.entries(d.status).map(([k, n]) => <div key={k} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2"><StatusChip status={k as RequestStatus} /><b className="tabular">{n}</b></div>)}
          </div>
          <p className="px-4 pb-3 text-[11px] text-fine">{Object.keys(REQUEST_STATUS_LABEL).length} possible statuses</p>
        </Card>
        <Card>
          <CardHead title="Skill demand vs upcoming seats" sub="People with a gap · ★ critical · free seats in scheduled sessions" />
          <div className="divide-y divide-line-2">
            {d.demand.map((x) => (
              <div key={x.skillId} className="flex items-center gap-3 px-4 py-2 text-[12px]">
                <b className="flex-1 truncate">{x.skillName}</b>
                <span className="w-16 tabular">{x.people} people</span>
                <span className="w-10 tabular text-bad">{x.critical ? `★ ${x.critical}` : ''}</span>
                <span className={`w-20 text-right tabular ${x.seats < x.people ? 'font-semibold text-bad' : 'text-req'}`}>{x.seats} seats</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHead title="Readiness by position" sub="Average of employees against the approved profile" />
          <div className="space-y-2.5 p-4">
            {d.readiness.map((x) => (
              <div key={x.position} className="grid grid-cols-[170px_1fr_44px] items-center gap-2 text-[12px]"><span className="truncate">{x.position} <small className="text-fine">({x.people})</small></span><Meter value={x.readiness} /><span className="text-right tabular">{x.readiness}%</span></div>
            ))}
          </div>
        </Card>
        {d.spendByMonth.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHead title="External spend by month" sub="Committed and in approval" />
            <div className="flex h-44 items-end gap-3 px-6 pb-4 pt-6">
              {d.spendByMonth.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                  <small className="tabular text-[10.5px] text-muted">{m.amount.toLocaleString()}</small>
                  <div className="w-full max-w-16 rounded-t-md bg-opt" style={{ height: `${(m.amount / maxM) * 110}px` }} />
                  <small className="text-[10.5px] text-fine">{new Date(`${m.month}-01`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}</small>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
