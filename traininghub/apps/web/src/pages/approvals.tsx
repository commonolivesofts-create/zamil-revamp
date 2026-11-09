import { Check, Clock, Forward, Inbox, Repeat2, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Delegation, TrainingRequest } from '@traininghub/shared';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useAction, useGet, useMe } from '../lib/data';
import { fmtDate, fmtDateY, sar, todayIso } from '../lib/format';
import { PersonPicker } from '../components/domain';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHead,
  Empty,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner,
  StatusChip,
  Textarea,
} from '../components/ui';

export function DecisionBar({
  r,
  className,
  compact,
}: {
  r: TrainingRequest;
  className?: string;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<null | 'reject' | 'forward'>(null);
  const [comment, setComment] = useState('');
  const [to, setTo] = useState<number | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});
  const inv = [['approvals'], ['request', r.id], ['requests']];
  const act = useAction(
    (v: { action: string; comment?: string; forwardTo?: number }) =>
      api.post<TrainingRequest>(`/requests/${r.id}/decision`, v),
    {
      success: (x) =>
        x.status === 'REJECTED'
          ? `${r.requestNo} rejected`
          : x.status === 'PENDING' && mode === 'forward'
            ? 'Forwarded'
            : `${r.requestNo} approved${x.status === 'PENDING' ? ' — moved to the next step' : x.status === 'WAITLISTED' ? ' — waitlisted (full)' : ''}`,
      invalidate: inv,
      onSuccess: () => setMode(null),
      onError: (e) => setErr({ ...e.fields, _: e.message }),
    },
  );
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Button
        variant="primary"
        size={compact ? 'sm' : 'md'}
        loading={act.isPending && !mode}
        onClick={() => act.mutate({ action: 'approve' })}
        icon={<Check className="size-3.5" />}
      >
        Approve
      </Button>
      <Button
        size={compact ? 'sm' : 'md'}
        onClick={() => {
          setMode('reject');
          setErr({});
        }}
        icon={<X className="size-3.5" />}
      >
        Reject
      </Button>
      <Button
        size={compact ? 'sm' : 'md'}
        variant="ghost"
        onClick={() => {
          setMode('forward');
          setErr({});
        }}
        icon={<Forward className="size-3.5" />}
      >
        Forward
      </Button>
      <Modal
        open={!!mode}
        onClose={() => setMode(null)}
        title={mode === 'reject' ? `Reject ${r.requestNo}` : `Forward ${r.requestNo}`}
        sub={`${r.personName} · ${r.session.title}`}
        footer={
          <>
            <Button onClick={() => setMode(null)}>Cancel</Button>
            <Button
              variant={mode === 'reject' ? 'danger' : 'primary'}
              loading={act.isPending}
              onClick={() =>
                act.mutate(
                  mode === 'reject'
                    ? { action: 'reject', comment }
                    : { action: 'forward', comment, forwardTo: to ?? undefined },
                )
              }
            >
              {mode === 'reject' ? 'Reject' : 'Forward'}
            </Button>
          </>
        }
      >
        {mode === 'forward' && (
          <Field label="Forward to" error={err.forwardTo} className="mb-3">
            <PersonPicker value={to} onChange={setTo} exclude={[r.personId]} />
          </Field>
        )}
        <Field
          label={mode === 'reject' ? 'Reason (the employee sees this)' : 'Note (optional)'}
          error={err.comment ?? (err._ && !err.forwardTo ? err._ : undefined)}
        >
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}

export default function Approvals() {
  const me = useMe().data!;
  const inbox = useGet<{ waiting: TrainingRequest[]; decided: TrainingRequest[] }>(
    ['approvals'],
    '/approvals',
  );
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [deleg, setDeleg] = useState(false);
  const bulk = useAction(
    (ids: number[]) =>
      api.post<{ approved: number; skipped: { id: number; reason: string }[] }>('/requests/bulk-approve', {
        ids,
      }),
    {
      success: (r) =>
        `${r.approved} approved${r.skipped.length ? ` · ${r.skipped.length} skipped (${r.skipped[0]!.reason})` : ''}`,
      invalidate: [['approvals'], ['requests']],
      onSuccess: () => setSel(new Set()),
    },
  );
  if (!inbox.data) return <Spinner />;
  const free = inbox.data.waiting.filter((r) => !r.session.costSar);
  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Approvals"
        sub="Approve, reject (with a reason) or forward. Role steps such as HR Lead can be taken by anyone who holds the role. Bulk approve is limited to no-cost sessions."
        actions={
          <Button onClick={() => setDeleg(true)} icon={<Repeat2 className="size-4" />}>
            Delegate while away
          </Button>
        }
      />
      {me.delegatedTo && (
        <Alert
          tone="warn"
          className="mb-3"
          title={`Your approvals are delegated to ${me.delegatedTo.name} until ${fmtDateY(me.delegatedTo.until)}.`}
        >
          New steps assigned to you go to your delegate.
        </Alert>
      )}
      {sel.size > 0 && (
        <Card className="sticky top-16 z-10 mb-3 flex items-center gap-3 px-4 py-2.5">
          <b className="flex-1 text-[12.5px]">{sel.size} selected</b>
          <Button
            variant="primary"
            size="sm"
            loading={bulk.isPending}
            onClick={() => bulk.mutate([...sel])}
            icon={<Check className="size-3.5" />}
          >
            Approve selected
          </Button>
          <Button size="sm" onClick={() => setSel(new Set())}>
            Clear
          </Button>
        </Card>
      )}
      <Card className="mb-4">
        <CardHead
          title={`Waiting for you · ${inbox.data.waiting.length}`}
          sub="Oldest first"
          actions={
            free.length > 1 && (
              <Button size="sm" variant="ghost" onClick={() => setSel(new Set(free.map((r) => r.id)))}>
                Select all no-cost
              </Button>
            )
          }
        />
        {inbox.data.waiting.map((r) => {
          const cur = r.steps.find((s) => s.status === 'PENDING')!;
          return (
            <div
              key={r.id}
              className="grid gap-3 border-b border-line-2 px-4 py-3.5 last:border-0 lg:grid-cols-[24px_1.3fr_1fr_auto] lg:items-center"
            >
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-req)]"
                disabled={!!r.session.costSar}
                checked={sel.has(r.id)}
                onChange={(e) => {
                  const n = new Set(sel);
                  if (e.target.checked) n.add(r.id);
                  else n.delete(r.id);
                  setSel(n);
                }}
                aria-label={`Select ${r.requestNo}`}
                title={r.session.costSar ? 'Paid sessions are approved one by one' : 'Select'}
              />
              <div className="flex min-w-0 gap-2.5">
                <Avatar name={r.personName} id={r.personId} size="md" />
                <div className="min-w-0">
                  <b className="text-[12.5px]">{r.personName}</b>{' '}
                  <small className="text-[11px] text-muted">· {r.positionName ?? '—'}</small>
                  <Link
                    to={`/requests/${r.id}`}
                    className="block truncate text-[12px] font-semibold text-req"
                  >
                    {r.session.title}
                  </Link>
                  <div className="text-[11px] text-muted">
                    {fmtDate(r.session.startDate)} · {sar(r.session.costSar)} · {r.requestNo}
                  </div>
                </div>
              </div>
              <div className="min-w-0 text-[11.5px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="warn">
                    Step {cur.stepNo} of {r.steps.length} · {cur.label}
                  </Badge>
                  {cur.delegatedFromName && <Badge tone="info">for {cur.delegatedFromName}</Badge>}
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-[11px]',
                      r.waitingDays >= 2 ? 'font-semibold text-bad' : 'text-muted',
                    )}
                  >
                    <Clock className="size-3" />
                    {r.waitingDays ? `${r.waitingDays} day${r.waitingDays > 1 ? 's' : ''}` : 'today'}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-muted">“{r.reason}”</p>
                {r.eligibilityNow?.map((e) => (
                  <p key={e.code} className="mt-0.5 text-[11px] font-semibold text-bad">
                    ⚠ {e.message}
                  </p>
                ))}
              </div>
              <DecisionBar r={r} compact />
            </div>
          );
        })}
        {!inbox.data.waiting.length && (
          <Empty icon={<Inbox className="size-5" />} title="Inbox zero">
            Nothing is waiting for your decision.
          </Empty>
        )}
      </Card>
      <Card>
        <CardHead title="Recently decided by you" />
        {inbox.data.decided.map((r) => (
          <Link
            key={r.id}
            to={`/requests/${r.id}`}
            className="flex items-center gap-3 border-b border-line-2 px-4 py-2.5 last:border-0 hover:bg-hover"
          >
            <span className="min-w-0 flex-1">
              <b className="text-[12.5px]">{r.personName}</b>{' '}
              <small className="text-muted">· {r.session.title}</small>
            </span>
            <StatusChip status={r.status} />
          </Link>
        ))}
        {!inbox.data.decided.length && <Empty title="No decisions yet" />}
      </Card>
      {deleg && <DelegationModal onClose={() => setDeleg(false)} />}
    </>
  );
}

export function DelegationModal({ onClose, forOthers }: { onClose: () => void; forOthers?: boolean }) {
  return (
    <Modal
      open
      onClose={onClose}
      wide
      title="Delegations"
      sub="While a delegation is active, new approval steps assigned to the person go to their delegate."
    >
      <DelegationPanel forOthers={forOthers} />
    </Modal>
  );
}

export function DelegationPanel({ forOthers }: { forOthers?: boolean }) {
  const me = useMe().data!;
  const list = useGet<Delegation[]>(['delegations', !!forOthers], `/delegations${forOthers ? '?all=1' : ''}`);
  const [from, setFrom] = useState<number | null>(forOthers ? null : me.personId);
  const [to, setTo] = useState<number | null>(null);
  const [start, setStart] = useState(todayIso());
  const [end, setEnd] = useState(todayIso());
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const save = useAction(
    () =>
      api.post('/delegations', {
        fromPersonId: from ?? undefined,
        toPersonId: to,
        startDate: start,
        endDate: end,
        reason,
      }),
    {
      success: 'Delegation saved',
      invalidate: [['delegations'], ['approvals']],
      onSuccess: () => {
        setTo(null);
        setReason('');
        setErr({});
      },
      onError: (e) => setErr({ ...e.fields, _: e.message }),
    },
  );
  const cancel = useAction((id: number) => api.del(`/delegations/${id}`), {
    success: 'Delegation cancelled',
    invalidate: [['delegations']],
  });
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {forOthers && (
          <Field label="Approver who is away" error={err.fromPersonId}>
            <PersonPicker value={from} onChange={setFrom} />
          </Field>
        )}
        <Field label="Delegate to" error={err.toPersonId}>
          <PersonPicker value={to} onChange={setTo} exclude={from ? [from] : []} />
        </Field>
        <Field label="From" error={err.startDate}>
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="To" error={err.endDate}>
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label="Reason" className="sm:col-span-2">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Annual leave, business trip…"
          />
        </Field>
      </div>
      {err._ && !Object.keys(err).some((k) => k !== '_') && (
        <Alert tone="bad" className="mt-3">
          {err._}
        </Alert>
      )}
      <div className="mt-3 flex justify-end">
        <Button
          variant="primary"
          loading={save.isPending}
          disabled={!to || !from}
          onClick={() => save.mutate(undefined)}
        >
          Add delegation
        </Button>
      </div>
      <div className="mt-4 divide-y divide-line-2 rounded-xl border border-line">
        {(list.data ?? []).map((d) => (
          <div key={d.id} className="flex items-center gap-3 px-3 py-2.5 text-[12px]">
            <span className="flex-1">
              <b>{d.fromName}</b> → <b>{d.toName}</b> · {fmtDate(d.startDate)} – {fmtDate(d.endDate)}{' '}
              {d.reason && <span className="text-muted">· {d.reason}</span>}
            </span>
            {d.active && <Badge tone="ok">Active</Badge>}
            <Button size="sm" variant="ghost" onClick={() => cancel.mutate(d.id)}>
              Cancel
            </Button>
          </div>
        ))}
        {list.data && !list.data.length && (
          <p className="px-3 py-4 text-center text-[12px] text-muted">No delegations.</p>
        )}
      </div>
    </>
  );
}
