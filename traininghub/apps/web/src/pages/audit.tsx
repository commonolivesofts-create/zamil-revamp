import { Search, X } from 'lucide-react';
import { useState } from 'react';
import type { AuditRow } from '@traininghub/shared';
import { useGet } from '../lib/data';
import { fmtDateTime } from '../lib/format';
import { Alert, Badge, Card, CardHead, Empty, Input, PageHeader, Skeleton, Table } from '../components/ui';

export default function Audit() {
  const [q, setQ] = useState('');
  const list = useGet<AuditRow[]>(['audit', q], `/audit?q=${encodeURIComponent(q)}`);

  return (
    <div className="th-audit">
      <PageHeader
        animatedTitle
        breadcrumb="Administration"
        title="Audit log"
        sub="Review the latest decisions and configuration changes."
        actions={
          <div className="th-audit__search">
            <Search aria-hidden="true" />
            <Input
              aria-label="Search the audit log"
              placeholder="Search people, actions, references…"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                aria-label="Clear audit search"
                title="Clear search"
              >
                <X aria-hidden="true" />
              </button>
            )}
          </div>
        }
      />

      {list.isError ? (
        <Alert tone="bad">{list.error.message}</Alert>
      ) : !list.data ? (
        <AuditLoading />
      ) : (
        <Card className="th-audit__panel">
          <CardHead
            title="Recent activity"
            sub="Newest first · up to 500 entries"
            actions={
              <Badge tone="info" dot>
                {list.data.length} events
              </Badge>
            }
            className="th-audit__panel-head"
          />
          {list.data.length ? (
            <Table
              pageSize={10}
              pagerLabel="Audit log pages"
              className="th-audit__table"
              head={['When', 'Who', 'Action', 'Area', 'Reference']}
            >
              {list.data.map((entry, index) => (
                <tr
                  className="th-audit__row"
                  key={entry.id}
                  style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
                >
                  <td className="th-audit__when">{fmtDateTime(entry.at)}</td>
                  <td>
                    <b className="th-audit__person">{entry.byName}</b>
                  </td>
                  <td className="th-audit__action" title={entry.action}>
                    {entry.action}
                  </td>
                  <td>
                    <Badge className="th-audit__area" dot>
                      {entry.entity.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="th-audit__reference" title={entry.ref || undefined}>
                    {entry.ref || '—'}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty title={q ? 'No matching audit entries' : 'No audit entries yet'}>
              {q
                ? 'Try a different name, action, or reference.'
                : 'Activity will appear here as decisions and configuration changes are recorded.'}
            </Empty>
          )}
        </Card>
      )}
    </div>
  );
}

function AuditLoading() {
  return (
    <Card className="th-audit__panel th-audit__loading" role="status" aria-live="polite">
      <span className="sr-only">Loading audit entries</span>
      <CardHead title="Recent activity" sub="Loading the latest audit entries" />
      <div className="th-audit__loading-head">
        {['When', 'Who', 'Action', 'Area', 'Reference'].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="th-audit__loading-rows">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="th-audit__loading-row" key={index}>
            <Skeleton className="h-4 w-28 rounded-md" />
            <Skeleton className="h-4 w-32 rounded-md" />
            <Skeleton className="h-4 w-4/5 rounded-md" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-24 rounded-md" />
          </div>
        ))}
      </div>
    </Card>
  );
}
