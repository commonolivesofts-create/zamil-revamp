import { ArrowLeft, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { TrainingRequest } from '@traininghub/shared';
import { api } from '../lib/api';
import { useAction, useGet } from '../lib/data';
import { fmtDate, fmtDateTime, sar } from '../lib/format';
import { SessionMeta, SessionTags, StepsTimeline } from '../components/domain';
import {
  Alert,
  Avatar,
  Button,
  Card,
  CardHead,
  Modal,
  PageHeader,
  Spinner,
  StatusChip,
  Textarea,
} from '../components/ui';
import { DecisionBar } from './approvals';

export default function RequestDetail({
  drawer = false,
  onClose = () => {},
}: {
  drawer?: boolean;
  onClose?: () => void;
}) {
  const id = Number(useParams().id);
  const r = useGet<TrainingRequest>(['request', id], `/requests/${id}`);
  const [w, setW] = useState(false);
  const [comment, setComment] = useState('');
  const withdraw = useAction(() => api.post(`/requests/${id}/withdraw`, { comment }), {
    success: 'Request withdrawn',
    invalidate: [['request', id], ['requests'], ['catalog']],
    onSuccess: () => setW(false),
  });
  if (!r.data) {
    const pending = r.error ? <Alert tone="bad">{r.error.message}</Alert> : <Spinner />;
    return drawer ? (
      <Modal open drawer wide onClose={onClose} title="Request details">
        {pending}
      </Modal>
    ) : (
      pending
    );
  }
  const x = r.data;
  if (drawer) {
    return (
      <Modal
        open
        drawer
        wide
        onClose={onClose}
        title="Request details"
        sub={`${x.requestNo} · ${x.session.title}`}
        footer={
          x.canWithdraw && (
            <Button onClick={() => setW(true)} icon={<Undo2 className="size-4" />}>
              Withdraw request
            </Button>
          )
        }
      >
        {x.canDecide && <DecisionBar r={x} className="mb-4" />}
        <div className="th-request-detail-drawer">
          <Card className="th-request-detail-drawer__hero">
            <div className="th-request-detail-drawer__hero-top">
              <span>Training request</span>
              <StatusChip status={x.status} />
            </div>
            <h2>{x.session.title}</h2>
            <div className="th-request-detail-drawer__identity">
              <Avatar name={x.personName} id={x.personId} />
              <div>
                <b>{x.personName}</b>
                <small>{x.positionName || 'Position not listed'}</small>
              </div>
              <span>Submitted {fmtDateTime(x.createdAt)}</span>
            </div>
            <div className="th-request-detail-drawer__facts">
              <div>
                <small>Training date</small>
                <b>
                  {fmtDate(x.session.startDate)}
                  {x.session.endDate !== x.session.startDate ? ` – ${fmtDate(x.session.endDate)}` : ''}
                </b>
              </div>
              <div>
                <small>Provider</small>
                <b>{x.session.provider}</b>
              </div>
              <div>
                <small>Cost</small>
                <b>{sar(x.session.costSar)}</b>
              </div>
            </div>
          </Card>
          <div className="th-request-detail-drawer__grid">
            <Card className="th-request-detail-drawer__panel th-request-detail-drawer__session">
              <header className="th-request-detail-drawer__panel-head">
                <span>01</span>
                <div>
                  <b>Session overview</b>
                  <small>Training and request details</small>
                </div>
              </header>
              <div className="th-request-detail-drawer__body">
                <SessionTags s={x.session} />
                <SessionMeta s={x.session} />
                {x.session.description && (
                  <p className="th-request-detail-drawer__description">{x.session.description}</p>
                )}
                <dl>
                  <div>
                    <dt>Location</dt>
                    <dd>{x.session.location || 'Not specified'}</dd>
                  </div>
                  <div>
                    <dt>Delivery</dt>
                    <dd>{x.session.deliveryMode}</dd>
                  </div>
                  <div>
                    <dt>Raised by</dt>
                    <dd>{x.createdByName}</dd>
                  </div>
                  <div>
                    <dt>Request number</dt>
                    <dd>{x.requestNo}</dd>
                  </div>
                </dl>
                <section className="th-request-detail-drawer__reason">
                  <small>Business reason</small>
                  <p>{x.reason}</p>
                </section>
                {x.status === 'WAITLISTED' && (
                  <Alert tone="info">
                    Approved and waiting for a seat. You move up automatically when one frees.
                  </Alert>
                )}
              </div>
            </Card>
            <Card className="th-request-detail-drawer__panel th-request-detail-drawer__route">
              <header className="th-request-detail-drawer__panel-head">
                <span>02</span>
                <div>
                  <b>Approval route</b>
                  <small>Progress and reviewer decisions</small>
                </div>
              </header>
              <div className="th-request-detail-drawer__body">
                <StepsTimeline steps={x.steps} />
              </div>
            </Card>
          </div>
        </div>
        <Modal
          open={w}
          onClose={() => setW(false)}
          title="Withdraw this request?"
          aboveDrawer
          footer={
            <>
              <Button onClick={() => setW(false)}>Keep it</Button>
              <Button
                variant="danger"
                loading={withdraw.isPending}
                onClick={() => withdraw.mutate(undefined)}
              >
                Withdraw
              </Button>
            </>
          }
        >
          <Textarea
            placeholder="Optional note"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </Modal>
      </Modal>
    );
  }
  return (
    <>
      <Link
        to="/requests"
        className="mb-3 inline-flex items-center gap-1 text-[12px] font-semibold text-muted hover:text-ink"
      >
        <ArrowLeft className="size-3.5" />
        Requests
      </Link>
      <PageHeader
        eyebrow={x.requestNo}
        title={x.session.title}
        sub={`${x.personName}${x.positionName ? ` · ${x.positionName}` : ''} · raised by ${x.createdByName} on ${fmtDateTime(x.createdAt)}`}
        actions={
          <>
            <StatusChip status={x.status} />
            {x.canWithdraw && (
              <Button onClick={() => setW(true)} icon={<Undo2 className="size-4" />}>
                Withdraw
              </Button>
            )}
          </>
        }
      />
      {x.canDecide && <DecisionBar r={x} className="mb-4" />}
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHead title="Session" />
          <div className="space-y-3 p-4">
            <SessionMeta s={x.session} />
            <SessionTags s={x.session} />
            <div>
              <small className="text-[11px] font-semibold text-muted">Business reason</small>
              <p className="mt-1 whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-[12.5px]">{x.reason}</p>
            </div>
            {x.status === 'WAITLISTED' && (
              <Alert tone="info">
                Approved and waiting for a seat. You move up automatically when one frees.
              </Alert>
            )}
          </div>
        </Card>
        <Card>
          <CardHead title="Approval route" sub="Fixed when the request was submitted" />
          <div className="p-4">
            <StepsTimeline steps={x.steps} />
          </div>
        </Card>
      </div>
      <Modal
        open={w}
        onClose={() => setW(false)}
        title="Withdraw this request?"
        footer={
          <>
            <Button onClick={() => setW(false)}>Keep it</Button>
            <Button variant="danger" loading={withdraw.isPending} onClick={() => withdraw.mutate(undefined)}>
              Withdraw
            </Button>
          </>
        }
      >
        <Textarea placeholder="Optional note" value={comment} onChange={(e) => setComment(e.target.value)} />
      </Modal>
    </>
  );
}
