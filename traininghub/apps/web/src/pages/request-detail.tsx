import { ArrowLeft, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { TrainingRequest } from '@traininghub/shared';
import { api } from '../lib/api';
import { useAction, useGet } from '../lib/data';
import { fmtDateTime } from '../lib/format';
import { SessionMeta, SessionTags, StepsTimeline } from '../components/domain';
import { Alert, Button, Card, CardHead, Modal, PageHeader, Spinner, StatusChip, Textarea } from '../components/ui';
import { DecisionBar } from './approvals';

export default function RequestDetail() {
  const id = Number(useParams().id);
  const r = useGet<TrainingRequest>(['request', id], `/requests/${id}`);
  const [w, setW] = useState(false);
  const [comment, setComment] = useState('');
  const withdraw = useAction(() => api.post(`/requests/${id}/withdraw`, { comment }), { success: 'Request withdrawn', invalidate: [['request', id], ['requests'], ['catalog']], onSuccess: () => setW(false) });
  if (!r.data) return r.error ? <Alert tone="bad">{r.error.message}</Alert> : <Spinner />;
  const x = r.data;
  return (
    <>
      <Link to="/requests" className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-ink"><ArrowLeft className="size-3.5" />Requests</Link>
      <PageHeader eyebrow={x.requestNo} title={x.session.title} sub={`${x.personName}${x.positionName ? ` · ${x.positionName}` : ''} · raised by ${x.createdByName} on ${fmtDateTime(x.createdAt)}`} actions={
        <>
          <StatusChip status={x.status} />
          {x.canWithdraw && <Button onClick={() => setW(true)} icon={<Undo2 className="size-4" />}>Withdraw</Button>}
        </>
      } />
      {x.canDecide && <DecisionBar r={x} className="mb-4" />}
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHead title="Session" />
          <div className="space-y-3 p-4">
            <SessionMeta s={x.session} />
            <SessionTags s={x.session} />
            <div><small className="text-[11px] font-semibold text-muted">Business reason</small><p className="mt-1 whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-[12.5px]">{x.reason}</p></div>
            {x.status === 'WAITLISTED' && <Alert tone="info">Approved and waiting for a seat. You move up automatically when one frees.</Alert>}
          </div>
        </Card>
        <Card>
          <CardHead title="Approval route" sub="Fixed when the request was submitted" />
          <div className="p-4"><StepsTimeline steps={x.steps} /></div>
        </Card>
      </div>
      <Modal open={w} onClose={() => setW(false)} title="Withdraw this request?" footer={<><Button onClick={() => setW(false)}>Keep it</Button><Button variant="danger" loading={withdraw.isPending} onClick={() => withdraw.mutate(undefined)}>Withdraw</Button></>}>
        <Textarea placeholder="Optional note" value={comment} onChange={(e) => setComment(e.target.value)} />
      </Modal>
    </>
  );
}
