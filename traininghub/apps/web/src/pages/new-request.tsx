import { ArrowLeft, ArrowRight, Check, CheckCircle2, Send } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { Eligibility, Session } from '@traininghub/shared';
import { cn } from '../lib/cn';
import { api } from '../lib/api';
import { hasRole, useAction, useGet, useLookups, useMe } from '../lib/data';
import { fmtDate, todayIso } from '../lib/format';
import { EligibilityList, PersonPicker, SeatBar, SessionMeta, SessionTags } from '../components/domain';
import { Avatar, Button, Card, Empty, PageHeader, Segmented, Skeleton } from '../components/ui';

type Row = Session & { eligibility: Eligibility | null };
interface TeamRow {
  personId: number;
  fullName: string;
  positionName: string | null;
  readiness: number;
  gaps: { skillId: number }[];
}

export default function NewRequest() {
  const me = useMe().data!;
  const navigate = useNavigate();
  const L = useLookups();
  const [params] = useSearchParams();
  const canOthers = me.hasTeam || hasRole(me, 'HR_ADMIN');
  const [step, setStep] = useState(canOthers ? 0 : 1);
  const [who, setWho] = useState<number>(me.personId);
  const [sessionId, setSessionId] = useState<number | null>(Number(params.get('session')) || null);
  const [filter, setFilter] = useState<'eligible' | 'all'>('eligible');
  const [reason, setReason] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);
  const [reasonError, setReasonError] = useState('');
  const team = useGet<TeamRow[]>(['team'], me.hasTeam ? '/team' : null);
  const list = useGet<Row[]>(
    ['catalog', who],
    step >= 1 ? `/catalog?from=${todayIso()}&personId=${who}` : null,
  );
  const person = L.data?.people.find((p) => p.personId === who);
  const chosen = list.data?.find((s) => s.id === sessionId);
  const steps = ['Who', 'Session', 'Reason & submit'];
  const minReason = chosen?.eligibility?.minReason ?? 15;
  const reasonLength = reason.trim().length;
  const reasonInvalid = reasonLength < minReason || reasonLength > 1000;
  const reasonMessage =
    reasonLength > 1000
      ? 'Keep the reason to 1,000 characters or fewer.'
      : reasonLength === 0 && reasonTouched
        ? 'Enter a business reason to continue.'
        : reasonLength > 0 && reasonLength < minReason
          ? `Add ${minReason - reasonLength} more characters to meet the minimum.`
          : '';
  const submit = useAction(
    (value: { reason: string }) =>
      api.post<{
        id: number;
        requestNo: string;
        steps: { approverName: string | null; status: string; label: string }[];
      }>('/requests', { personId: who, sessionId: chosen!.id, reason: value.reason.trim() }),
    {
      success: (result) => {
        const pending = result.steps.find((item) => item.status === 'PENDING');
        return `${result.requestNo} submitted${pending ? ` · waiting for ${pending.approverName ?? pending.label}` : ''}`;
      },
      invalidate: [['catalog'], ['requests'], ['sessions']],
      onSuccess: (result) => navigate(`/requests/${result.id}`),
      onError: (error) => setReasonError(error.fields.reason ?? error.message),
    },
  );

  return (
    <div className="th-new-request">
      <PageHeader
        animatedTitle
        breadcrumb="Learning & development"
        title={canOthers ? 'New request or nomination' : 'New request'}
      />
      <nav
        className="th-request-track"
        aria-label="Request steps"
        style={{ '--step': step, '--n': steps.length } as React.CSSProperties}
      >
        <span className="th-request-track__fill" aria-hidden="true" />
        {steps.map((label, index) => {
          const done = index < step;
          const disabled = index > step || (index === 0 && !canOthers);
          return (
            <button
              key={label}
              type="button"
              className={cn('th-request-track__step', done && 'is-done')}
              aria-current={index === step ? 'step' : undefined}
              disabled={disabled}
              onClick={() => setStep(index)}
            >
              <span className="th-request-track__number">
                {done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className="th-request-track__label">
                <b>{label}</b>
                <small>
                  {index === 0
                    ? 'Choose a person'
                    : index === 1
                      ? 'Select eligible training'
                      : 'Add a reason'}
                </small>
              </span>
            </button>
          );
        })}
      </nav>
      <div className="th-new-request__layout">
        <div className="th-new-request__workspace">
          <div className="min-w-0">
            {step === 0 && (
              <Card className="p-4">
                <h3 className="mb-3 text-[14px] font-bold">Who is this request for?</h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    {
                      personId: me.personId,
                      fullName: `${me.fullName} (me)`,
                      positionName: me.positionName,
                      readiness: -1,
                      gaps: [] as { skillId: number }[],
                    },
                    ...(team.data ?? []),
                  ].map((p) => (
                    <button
                      key={p.personId}
                      onClick={() => setWho(p.personId)}
                      className={cn(
                        'flex items-center gap-2.5 rounded-xl border p-3 text-left transition',
                        who === p.personId ? 'border-req bg-accent-soft' : 'border-line hover:bg-hover',
                      )}
                    >
                      <Avatar name={p.fullName} id={p.personId} />
                      <span className="min-w-0">
                        <b className="block truncate text-[12.5px]">{p.fullName}</b>
                        <small className="text-[11px] text-muted">
                          {p.positionName ?? 'No position'}
                          {p.readiness >= 0 ? ` · ${p.gaps.length} gaps` : ''}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
                {hasRole(me, 'HR_ADMIN') && (
                  <div className="mt-4 max-w-md">
                    <small className="mb-1 block text-[11.5px] font-semibold text-muted">
                      HR: nominate any employee
                    </small>
                    <PersonPicker
                      value={who === me.personId ? null : who}
                      onChange={(id) => setWho(id ?? me.personId)}
                    />
                  </div>
                )}
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="primary"
                    onClick={() => setStep(1)}
                    icon={<ArrowRight className="size-4" />}
                  >
                    Continue
                  </Button>
                </div>
              </Card>
            )}
            {step === 1 && (
              <Card className="th-request-sessions">
                <div className="th-request-sessions__header">
                  <div>
                    <small>Step 2 · Learning plan</small>
                    <b>Choose a session</b>
                    <span>Sessions for {who === me.personId ? 'you' : person?.fullName}</span>
                  </div>
                  <Segmented
                    value={filter}
                    onChange={setFilter}
                    options={[
                      { value: 'eligible', label: 'Eligible' },
                      { value: 'all', label: 'All' },
                    ]}
                  />
                </div>
                {!list.data ? (
                  <div className="th-request-sessions__loading" role="status" aria-live="polite">
                    <span className="sr-only">Loading available sessions</span>
                    {[0, 1, 2].map((item) => (
                      <div className="th-request-session-skeleton" key={item}>
                        <div>
                          <Skeleton className="h-9 w-9 rounded-xl" />
                          <Skeleton className="h-4 w-2/3" />
                          <Skeleton className="h-5 w-16 rounded-full" />
                        </div>
                        <Skeleton className="h-3.5 w-1/2" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-2 w-2/3 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="divide-y divide-line-2">
                    {list.data
                      .filter((s) => filter === 'all' || s.eligibility?.ok)
                      .map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => s.eligibility?.ok && setSessionId(s.id)}
                          aria-pressed={sessionId === s.id}
                          className={cn(
                            'th-request-session',
                            !s.eligibility?.ok && 'is-ineligible',
                            sessionId === s.id && 'is-selected',
                          )}
                        >
                          <span className="th-request-session__mark" aria-hidden="true">
                            {sessionId === s.id ? <CheckCircle2 /> : <span />}
                          </span>
                          <div className="th-request-session__content">
                            <b className="text-[13px]">{s.title}</b>
                            <div className="th-request-session__tags">
                              <SessionTags s={s} />
                            </div>
                            <div className="th-request-session__meta">
                              <SessionMeta s={s} />
                            </div>
                            {s.eligibility && (
                              <div className="th-request-session__eligibility">
                                <EligibilityList e={s.eligibility} />
                              </div>
                            )}
                            <div className="th-request-session__seats">
                              <SeatBar s={s} />
                            </div>
                          </div>
                          <span className="th-request-session__price">
                            {s.costSar ? `SAR ${s.costSar.toLocaleString()}` : 'No fee'}
                          </span>
                        </button>
                      ))}
                    {!list.data.filter((s) => filter === 'all' || s.eligibility?.ok).length && (
                      <Empty title="No eligible sessions right now">Switch to “All” to see why.</Empty>
                    )}
                  </div>
                )}
                <div className="th-request-sessions__footer">
                  <span>
                    {chosen ? `Selected · ${chosen.title}` : 'Select an eligible session to continue'}
                  </span>
                  <div>
                    <Button
                      onClick={() => setStep(0)}
                      disabled={!canOthers}
                      icon={<ArrowLeft className="size-4" />}
                    >
                      Back
                    </Button>
                    <Button
                      variant="primary"
                      disabled={!chosen?.eligibility?.ok}
                      onClick={() => {
                        setStep(2);
                      }}
                      icon={<ArrowRight className="size-4" />}
                    >
                      Continue
                    </Button>
                  </div>
                </div>
              </Card>
            )}
            {step === 2 && chosen && (
              <Card className="th-request-reason-card">
                <header className="th-request-reason-card__head">
                  <span>Step 3 · Approval details</span>
                  <h2>Reason & submit</h2>
                  <p>Explain how this training supports the employee’s work and development.</p>
                </header>
                <div className="th-request-reason-card__selected">
                  <b>{chosen.title}</b>
                  <SessionMeta s={chosen} compact />
                </div>
                {chosen.eligibility && (
                  <div className="th-request-reason-card__eligibility">
                    <EligibilityList e={chosen.eligibility} />
                  </div>
                )}
                {chosen.eligibility?.willWaitlist && (
                  <p className="th-request-reason-card__waitlist">
                    This session is full. An approved request will join the waitlist.
                  </p>
                )}
                <label className="th-request-reason" htmlFor="request-reason">
                  <span>
                    Business reason <b>Required</b>
                  </span>
                  <textarea
                    id="request-reason"
                    value={reason}
                    maxLength={1000}
                    rows={5}
                    aria-invalid={Boolean(reasonError || (reasonTouched && reasonMessage))}
                    aria-describedby="request-reason-hint"
                    onBlur={() => setReasonTouched(true)}
                    onChange={(event) => {
                      setReason(event.target.value);
                      setReasonTouched(true);
                      setReasonError('');
                    }}
                    placeholder="Describe what the employee will learn and how they will apply it in their role."
                  />
                  <small
                    id="request-reason-hint"
                    className={reasonError || (reasonTouched && reasonMessage) ? 'is-error' : ''}
                  >
                    {reasonError ||
                      (reasonTouched && reasonMessage) ||
                      `At least ${minReason} characters. ${reasonLength}/${minReason} characters${chosen.costSar ? ' · Paid session' : ''}.`}
                  </small>
                </label>
                <footer className="th-request-reason-card__footer">
                  <Button onClick={() => setStep(1)} icon={<ArrowLeft className="size-4" />}>
                    Back to sessions
                  </Button>
                  <Button
                    variant="primary"
                    loading={submit.isPending}
                    disabled={!chosen.eligibility?.ok || reasonInvalid || submit.isPending}
                    onClick={() => {
                      setReasonTouched(true);
                      setReasonError('');
                      if (!reasonInvalid) submit.mutate({ reason });
                    }}
                    icon={<Send className="size-3.5" />}
                  >
                    Submit request
                  </Button>
                </footer>
              </Card>
            )}
          </div>
        </div>
        <aside className="th-request-summary" aria-label="Request summary">
          <div className="th-request-summary__top">
            <span>Training request</span>
            <b>{step === 2 ? 'In progress' : 'Draft'}</b>
          </div>
          <div className="th-request-summary__person">
            <Avatar name={person?.fullName ?? me.fullName} id={who} />
            <div>
              <small>For</small>
              <h2>
                {person?.fullName ?? me.fullName}
                {who === me.personId ? ' (you)' : ''}
              </h2>
              <p>{person?.jobName ?? me.positionName ?? 'Position not listed'}</p>
            </div>
          </div>
          <div className="th-request-summary__session">
            <small>Selected session</small>
            <h3>{chosen?.title ?? 'Choose a training session'}</h3>
            {chosen ? (
              <>
                <p>
                  {chosen.skillName} · {chosen.provider}
                </p>
                <dl>
                  <div>
                    <dt>Dates</dt>
                    <dd>
                      {fmtDate(chosen.startDate)}
                      {chosen.endDate !== chosen.startDate ? ` – ${fmtDate(chosen.endDate)}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd>{chosen.location || chosen.deliveryMode}</dd>
                  </div>
                  <div>
                    <dt>Eligibility</dt>
                    <dd>{chosen.eligibility?.ok ? 'Eligible' : 'Not checked yet'}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p>Eligible sessions will appear here when selected.</p>
            )}
          </div>
          <p className="th-request-summary__note">
            Eligibility is checked for the selected employee before a request can be submitted.
          </p>
        </aside>
      </div>
    </div>
  );
}
