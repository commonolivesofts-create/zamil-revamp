import { useState } from 'react';
import type { AuditRow } from '@traininghub/shared';
import { useGet } from '../lib/data';
import { fmtDateTime } from '../lib/format';
import { Badge, Card, Input, PageHeader, Spinner, Table } from '../components/ui';

export default function Audit() {
  const [q, setQ] = useState('');
  const list = useGet<AuditRow[]>(['audit', q], `/audit?q=${encodeURIComponent(q)}`);
  return (
    <>
      <PageHeader eyebrow="Administration" title="Audit log" sub="Every decision and configuration change, newest first (last 500)." actions={<Input className="w-64" placeholder="Search who, what, reference…" value={q} onChange={(e) => setQ(e.target.value)} />} />
      <Card>
        {!list.data ? <Spinner /> : (
          <Table head={['When', 'Who', 'Action', 'Area', 'Reference']}>
            {list.data.map((a) => (
              <tr key={a.id}><td className="whitespace-nowrap text-muted">{fmtDateTime(a.at)}</td><td><b>{a.byName}</b></td><td>{a.action}</td><td><Badge>{a.entity.toLowerCase()}</Badge></td><td className="text-muted">{a.ref}</td></tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
