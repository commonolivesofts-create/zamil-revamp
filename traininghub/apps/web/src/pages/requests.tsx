import { ListChecks } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { TrainingRequest } from '@traininghub/shared';
import { hasRole, useGet, useMe } from '../lib/data';
import { fmtDate, fmtDateY, sar } from '../lib/format';
import { Card, Empty, PageHeader, Spinner, StatusChip, Table, Tabs } from '../components/ui';

export default function MyRequests() {
  const me = useMe().data!;
  const scopes = [{ value: 'mine' as const, label: 'Mine' }, ...(me.hasTeam ? [{ value: 'team' as const, label: 'My team' }] : []), ...(hasRole(me, 'HR_ADMIN', 'HR_LEAD', 'FINANCE') ? [{ value: 'all' as const, label: 'All requests' }] : [])];
  const [scope, setScope] = useState<'mine' | 'team' | 'all'>('mine');
  const [status, setStatus] = useState('open');
  const list = useGet<TrainingRequest[]>(['requests', scope], `/requests?scope=${scope}`);
  const OPEN = ['PENDING', 'APPROVED', 'WAITLISTED'];
  const rows = (list.data ?? []).filter((r) => status === 'all' || (status === 'open' ? OPEN.includes(r.status) : !OPEN.includes(r.status)));
  return (
    <>
      <PageHeader eyebrow="My learning" title="Requests" sub="Track every request from submission to result. Open a request to see its approval route." actions={<Link to="/new" className="inline-flex h-9 items-center rounded-[10px] bg-brand px-3.5 text-[12.5px] font-semibold text-white">New request</Link>} />
      {scopes.length > 1 && <Tabs value={scope} onChange={setScope} tabs={scopes} />}
      <div className="mb-3 flex gap-1.5">
        {[['open', 'Open'], ['closed', 'Closed'], ['all', 'All']].map(([v, l]) => (
          <button key={v} onClick={() => setStatus(v!)} className={`rounded-full px-3 py-1 text-[12px] font-semibold ${status === v ? 'bg-brand text-white' : 'bg-surface-2 text-muted'}`}>{l}</button>
        ))}
      </div>
      <Card>
        {!list.data ? <Spinner /> : rows.length ? (
          <Table head={['Request', ...(scope !== 'mine' ? ['Employee'] : []), 'Session', 'Dates', 'Cost', 'Step', 'Status']}>
            {rows.map((r) => {
              const cur = r.steps.find((s) => s.status === 'PENDING');
              return (
                <tr key={r.id} className="hover:bg-hover">
                  <td><Link to={`/requests/${r.id}`} className="font-semibold text-req">{r.requestNo}</Link><div className="text-[10.5px] text-fine">{fmtDateY(r.createdAt)}</div></td>
                  {scope !== 'mine' && <td><b>{r.personName}</b><div className="text-[10.5px] text-muted">{r.positionName}</div></td>}
                  <td className="max-w-72"><b className="block truncate">{r.session.title}</b><span className="text-[10.5px] text-muted">{r.session.skillName}</span></td>
                  <td className="whitespace-nowrap">{fmtDate(r.session.startDate)}</td>
                  <td className="whitespace-nowrap tabular">{sar(r.session.costSar)}</td>
                  <td className="text-[11.5px] text-muted">{cur ? `${cur.label} · ${cur.approverName ?? 'pool'}` : '—'}</td>
                  <td><StatusChip status={r.status} /></td>
                </tr>
              );
            })}
          </Table>
        ) : <Empty icon={<ListChecks className="size-5" />} title="No requests here" />}
      </Card>
    </>
  );
}
