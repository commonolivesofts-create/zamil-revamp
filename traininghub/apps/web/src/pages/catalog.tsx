import { BookOpen, Search, Send, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { Eligibility, Session } from '@traininghub/shared';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { catMap, skillMap, useAction, useGet, useLookups, useMe } from '../lib/data';
import { fmtDate, todayIso } from '../lib/format';
import { EligibilityList, SeatBar, SessionMeta, SessionTags, CAT_TEXT } from '../components/domain';
import {
  Alert,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Modal,
  PageHeader,
  Segmented,
  Select,
  Spinner,
  Textarea,
} from '../components/ui';

type Row = Session & { eligibility: Eligibility | null };

export default function Catalog() {
  const me = useMe().data!;
  const L = useLookups();
  const skills = skillMap(L.data);
  const cats = catMap(L.data);
  const [params] = useSearchParams();
  const list = useGet<Row[]>(['catalog'], `/catalog?from=${todayIso()}`);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [show, setShow] = useState<'all' | 'eligible' | 'gaps'>('all');
  const [req, setReq] = useState<Row | null>(null);
  const focus = Number(params.get('session')) || null;

  if (!list.data) return <Spinner />;
  const rows = list.data.filter((s) => {
    const skill = skills.get(s.skillId);
    if (
      q &&
      !`${s.title} ${s.skillName} ${s.provider} ${s.trainerName ?? ''}`
        .toLowerCase()
        .includes(q.toLowerCase())
    )
      return false;
    if (cat && String(skill?.categoryId) !== cat) return false;
    if (show === 'eligible' && !s.eligibility?.ok) return false;
    if (
      show === 'gaps' &&
      !(s.eligibility?.requirement && s.eligibility.currentLevel < s.eligibility.targetLevel)
    )
      return false;
    return true;
  });

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Training catalog"
        sub="Every scheduled session with your eligibility checked live against your approved position profile and HR's rules."
        actions={
          me.hasTeam && (
            <Link to="/new">
              <Button icon={<UserPlus className="size-4" />}>Nominate team member</Button>
            </Link>
          )
        }
      />
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-fine" />
          <Input
            className="pl-8"
            placeholder="Search title, skill, trainer, provider…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select className="w-auto" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {L.data?.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Segmented
          value={show}
          onChange={setShow}
          options={[
            { value: 'all', label: 'All' },
            { value: 'gaps', label: 'My gaps' },
            { value: 'eligible', label: 'Eligible' },
          ]}
        />
      </Card>
      {!rows.length && (
        <Card>
          <Empty icon={<BookOpen className="size-5" />} title="No sessions match">
            Try another filter.
          </Empty>
        </Card>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 min-[2200px]:grid-cols-5">
        {rows.map((s) => {
          const c = cats.get(skills.get(s.skillId)?.categoryId ?? 0);
          return (
            <Card key={s.id} className={cn('flex flex-col p-4', focus === s.id && 'ring-2 ring-req')}>
              <div
                className={cn(
                  'mb-1 text-[10.5px] font-bold uppercase tracking-wider',
                  CAT_TEXT[(c?.colorIndex ?? 1) - 1],
                )}
              >
                {s.skillName}
              </div>
              <h3 className="text-[14px] font-bold leading-snug">{s.title}</h3>
              <div className="mt-1.5">
                <SessionMeta s={s} />
              </div>
              <div className="mt-2.5">
                <SessionTags s={s} />
              </div>
              <div className="mt-3">
                <SeatBar s={s} />
              </div>
              <div className="mt-3 flex-1 border-t border-line-2 pt-3">
                {s.eligibility ? (
                  <EligibilityList e={s.eligibility} />
                ) : (
                  <small className="text-muted">No position profile — eligibility cannot be checked.</small>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!s.eligibility?.ok}
                  onClick={() => setReq(s)}
                  icon={<Send className="size-3.5" />}
                >
                  {s.eligibility?.willWaitlist ? 'Request (waitlist)' : 'Request'}
                </Button>
                {me.hasTeam && (
                  <Link to={`/new?session=${s.id}`}>
                    <Button size="sm">Nominate</Button>
                  </Link>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {req && (
        <RequestModal
          session={req}
          personId={me.personId}
          personName="yourself"
          onClose={() => setReq(null)}
        />
      )}
    </>
  );
}

export function RequestModal({
  session,
  personId,
  personName,
  onClose,
}: {
  session: Session;
  personId: number;
  personName: string;
  onClose: () => void;
}) {
  const nav = useNavigate();
  const e = useGet<Eligibility>(
    ['elig', session.id, personId],
    `/sessions/${session.id}/eligibility?personId=${personId}`,
  );
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const submit = useAction(
    (v: { reason: string }) =>
      api.post<{
        id: number;
        requestNo: string;
        steps: { approverName: string | null; status: string; label: string }[];
      }>('/requests', { personId, sessionId: session.id, reason: v.reason }),
    {
      success: (r) => {
        const p = r.steps.find((s) => s.status === 'PENDING');
        return `${r.requestNo} submitted${p ? ` · waiting for ${p.approverName ?? p.label}` : ''}`;
      },
      invalidate: [['catalog'], ['requests'], ['sessions']],
      onSuccess: (r) => {
        onClose();
        nav(`/requests/${r.id}`);
      },
      onError: (x) => setErr(x.fields.reason ?? x.message),
    },
  );
  const min = e.data?.minReason ?? 15;
  return (
    <Modal
      open
      onClose={onClose}
      title={`Request: ${session.title}`}
      sub={`For ${personName} · ${fmtDate(session.startDate)} · ${session.skillName}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={submit.isPending}
            disabled={!e.data?.ok || reason.trim().length < min}
            onClick={() => submit.mutate({ reason })}
            icon={<Send className="size-3.5" />}
          >
            Submit request
          </Button>
        </>
      }
    >
      {e.data && (
        <div className="mb-3">
          <EligibilityList e={e.data} />
        </div>
      )}
      {e.data?.willWaitlist && (
        <Alert tone="info" className="mb-3">
          The session is full. After approval you join the waitlist and move up automatically when a seat
          frees.
        </Alert>
      )}
      <Field
        label="Business reason"
        error={err}
        hint={`${reason.trim().length}/${min} characters minimum${session.costSar ? ' (paid session)' : ''}. Say what the training will change in your work.`}
      >
        <Textarea value={reason} onChange={(x) => setReason(x.target.value)} rows={4} autoFocus />
      </Field>
    </Modal>
  );
}
