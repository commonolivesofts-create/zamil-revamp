import { ArrowUpRight, CheckCircle2, Clock3, ListChecks, Search, Send } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import type { TrainingRequest } from '@traininghub/shared';
import { hasRole, useGet, useMe } from '../lib/data';
import { fmtDate, fmtDateY, sar } from '../lib/format';
import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  PageHeader,
  Skeleton,
  StatusChip,
  Table,
  Tabs,
} from '../components/ui';

export default function MyRequests() {
  const me = useMe().data!;
  const location = useLocation();
  const navigate = useNavigate();
  const openRequest = (id: number) =>
    navigate(`/requests/${id}`, { state: { backgroundLocation: location } });
  const scopes = [
    { value: 'mine' as const, label: 'Mine' },
    ...(me.hasTeam ? [{ value: 'team' as const, label: 'My team' }] : []),
    ...(hasRole(me, 'HR_ADMIN', 'HR_LEAD', 'FINANCE')
      ? [{ value: 'all' as const, label: 'All requests' }]
      : []),
  ];
  const [scope, setScope] = useState<'mine' | 'team' | 'all'>('mine');
  const [status, setStatus] = useState('open');
  const [query, setQuery] = useState('');
  const list = useGet<TrainingRequest[]>(['requests', scope], `/requests?scope=${scope}`);
  const openStatuses = ['PENDING', 'APPROVED', 'WAITLISTED'];
  const allRows = list.data ?? [];
  const rows = allRows.filter((r) => {
    const matchesStatus =
      status === 'all' ||
      (status === 'open' ? openStatuses.includes(r.status) : !openStatuses.includes(r.status));
    const matchesQuery =
      !query ||
      `${r.requestNo} ${r.session.title} ${r.session.skillName} ${r.personName}`
        .toLowerCase()
        .includes(query.toLowerCase());
    return matchesStatus && matchesQuery;
  });
  const stats = [
    { label: 'Total requests', value: allRows.length, icon: <ListChecks />, tone: 'total' },
    {
      label: 'Open',
      value: allRows.filter((r) => openStatuses.includes(r.status)).length,
      icon: <Clock3 />,
      tone: 'open',
    },
    {
      label: 'Awaiting review',
      value: allRows.filter((r) => r.status === 'PENDING').length,
      icon: <Send />,
      tone: 'review',
    },
    {
      label: 'Completed',
      value: allRows.filter((r) => ['COMPLETED', 'ATTENDED'].includes(r.status)).length,
      icon: <CheckCircle2 />,
      tone: 'done',
    },
  ];

  return (
    <div className="th-requests">
      <PageHeader
        animatedTitle
        breadcrumb="Learning & development"
        title="My requests"
        actions={
          <Link to="/new">
            <Button variant="primary" icon={<Send className="size-3.5" />}>
              New request
            </Button>
          </Link>
        }
      />

      <div className="th-requests__stats">
        {stats.map((stat) => (
          <Card className={`th-requests__stat is-${stat.tone}`} key={stat.label}>
            <span>{stat.icon}</span>
            <div>
              <small>{stat.label}</small>
              {list.isPending ? <Skeleton className="h-6 w-12" /> : <b>{stat.value}</b>}
            </div>
          </Card>
        ))}
      </div>

      <Card className="th-requests__panel">
        <div className="th-requests__toolbar">
          <div className="th-requests__scope">
            {scopes.length > 1 && <Tabs value={scope} onChange={setScope} tabs={scopes} />}
          </div>
          <div className="th-requests__tools">
            <label className="th-requests__search">
              <Search aria-hidden="true" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search requests"
                aria-label="Search by request, employee, or session"
              />
            </label>
            <div className="th-requests__status" role="group" aria-label="Filter requests by status">
              {[
                ['open', 'Open'],
                ['closed', 'Closed'],
                ['all', 'All'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={status === value}
                  onClick={() => setStatus(value!)}
                >
                  {label}
                  {value === 'open' && list.data && (
                    <small>{allRows.filter((r) => openStatuses.includes(r.status)).length}</small>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {list.error ? (
          <Alert tone="bad" className="m-4">
            {list.error.message}
          </Alert>
        ) : !list.data ? (
          <div className="th-requests__loading" role="status" aria-live="polite">
            <span className="sr-only">Loading requests</span>
            <div className="th-requests__loading-head">
              {Array.from({ length: 7 }, (_, i) => (
                <Skeleton key={i} className="h-3 w-20" />
              ))}
            </div>
            {Array.from({ length: 5 }, (_, i) => (
              <div className="th-requests__loading-row" key={i}>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : rows.length ? (
          <Table
            className="th-requests__table"
            pageSize={10}
            pagerLabel="Training request pages"
            head={[
              'Request',
              ...(scope !== 'mine' ? ['Employee'] : []),
              'Session',
              'Training date',
              'Cost',
              'Current step',
              'Status',
              '',
            ]}
          >
            {rows.map((r) => {
              const current = r.steps.find((s) => s.status === 'PENDING');
              return (
                <tr
                  key={r.id}
                  className={`th-requests__row is-${r.status.toLowerCase()}`}
                  role="link"
                  tabIndex={0}
                  aria-label={`View request ${r.requestNo}`}
                  onClick={() => openRequest(r.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openRequest(r.id);
                    }
                  }}
                >
                  <td>
                    <Link
                      to={`/requests/${r.id}`}
                      state={{ backgroundLocation: location }}
                      onClick={(event) => event.stopPropagation()}
                      className="th-requests__number"
                    >
                      {r.requestNo}
                    </Link>
                    <small>{fmtDateY(r.createdAt)}</small>
                  </td>
                  {scope !== 'mine' && (
                    <td>
                      <b>{r.personName}</b>
                      <small>{r.positionName || 'Position not listed'}</small>
                    </td>
                  )}
                  <td className="th-requests__session">
                    <b>{r.session.title}</b>
                    <small>
                      {r.session.skillName} · {r.session.provider}
                    </small>
                  </td>
                  <td className="whitespace-nowrap">
                    {fmtDate(r.session.startDate)}
                    {r.session.endDate !== r.session.startDate && (
                      <small>to {fmtDate(r.session.endDate)}</small>
                    )}
                  </td>
                  <td className="whitespace-nowrap tabular">{sar(r.session.costSar)}</td>
                  <td>
                    {current ? (
                      <>
                        <b>{current.label}</b>
                        <small>{current.approverName ?? 'Approval pool'}</small>
                      </>
                    ) : (
                      <span className="text-fine">Complete</span>
                    )}
                  </td>
                  <td>
                    <StatusChip status={r.status} />
                  </td>
                  <td>
                    <Link
                      to={`/requests/${r.id}`}
                      state={{ backgroundLocation: location }}
                      onClick={(event) => event.stopPropagation()}
                      className="th-requests__open"
                      aria-label={`Open request ${r.requestNo}`}
                    >
                      <ArrowUpRight />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty
            icon={<ListChecks className="size-5" />}
            title={query ? 'No matching requests' : 'No requests here'}
          >
            {query
              ? 'Try a different request number, employee, or session.'
              : 'New learning requests and nominations will appear here.'}
          </Empty>
        )}
      </Card>
    </div>
  );
}
