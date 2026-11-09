import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Eligibility, Session } from '@traininghub/shared';
import { cn } from '../lib/cn';
import { hasRole, useGet, useLookups, useMe } from '../lib/data';
import { todayIso } from '../lib/format';
import { EligibilityList, PersonPicker, SeatBar, SessionMeta, SessionTags } from '../components/domain';
import { Avatar, Button, Card, Empty, PageHeader, Segmented, Spinner } from '../components/ui';
import { RequestModal } from './catalog';

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
  const L = useLookups();
  const [params] = useSearchParams();
  const canOthers = me.hasTeam || hasRole(me, 'HR_ADMIN');
  const [step, setStep] = useState(canOthers ? 0 : 1);
  const [who, setWho] = useState<number>(me.personId);
  const [sessionId, setSessionId] = useState<number | null>(Number(params.get('session')) || null);
  const [filter, setFilter] = useState<'eligible' | 'all'>('eligible');
  const team = useGet<TeamRow[]>(['team'], me.hasTeam ? '/team' : null);
  const list = useGet<Row[]>(['catalog', who], step >= 1 ? `/catalog?from=${todayIso()}&personId=${who}` : null);
  const person = L.data?.people.find((p) => p.personId === who);
  const chosen = list.data?.find((s) => s.id === sessionId);
  const [open, setOpen] = useState(false);
  const steps = ['Who', 'Session', 'Reason & submit'];

  return (
    <>
      <PageHeader eyebrow="Training request" title={canOthers ? 'New request or nomination' : 'New request'} sub="Only eligible sessions can go forward, so requests are right first time." />
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <Card className="h-fit p-2">
          {steps.map((s, i) => (
            <button key={s} disabled={i > step || (i === 0 && !canOthers)} onClick={() => setStep(i)} className={cn('flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left disabled:opacity-50', i === step && 'bg-accent-soft')}>
              <span className={cn('grid size-6 place-items-center rounded-full text-[11px] font-bold', i < step ? 'bg-req text-white' : i === step ? 'bg-brand text-white' : 'bg-na-bg text-muted')}>{i < step ? <Check className="size-3.5" /> : i + 1}</span>
              <b className="text-[12.5px]">{s}</b>
            </button>
          ))}
        </Card>
        <div>
          {step === 0 && (
            <Card className="p-4">
              <h3 className="mb-3 text-[14px] font-bold">Who is this request for?</h3>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {[{ personId: me.personId, fullName: `${me.fullName} (me)`, positionName: me.positionName, readiness: -1, gaps: [] as { skillId: number }[] }, ...(team.data ?? [])].map((p) => (
                  <button key={p.personId} onClick={() => setWho(p.personId)} className={cn('flex items-center gap-2.5 rounded-xl border p-3 text-left transition', who === p.personId ? 'border-req bg-accent-soft' : 'border-line hover:bg-hover')}>
                    <Avatar name={p.fullName} id={p.personId} />
                    <span className="min-w-0"><b className="block truncate text-[12.5px]">{p.fullName}</b><small className="text-[11px] text-muted">{p.positionName ?? 'No position'}{p.readiness >= 0 ? ` · ${p.gaps.length} gaps` : ''}</small></span>
                  </button>
                ))}
              </div>
              {hasRole(me, 'HR_ADMIN') && (
                <div className="mt-4 max-w-md">
                  <small className="mb-1 block text-[11.5px] font-semibold text-muted">HR: nominate any employee</small>
                  <PersonPicker value={who === me.personId ? null : who} onChange={(id) => setWho(id ?? me.personId)} />
                </div>
              )}
              <div className="mt-4 flex justify-end"><Button variant="primary" onClick={() => setStep(1)} icon={<ArrowRight className="size-4" />}>Continue</Button></div>
            </Card>
          )}
          {step === 1 && (
            <Card>
              <div className="flex flex-wrap items-center gap-3 border-b border-line-2 px-4 py-3">
                <b className="flex-1 text-[13px]">Sessions for {who === me.personId ? 'you' : person?.fullName}</b>
                <Segmented value={filter} onChange={setFilter} options={[{ value: 'eligible', label: 'Eligible' }, { value: 'all', label: 'All' }]} />
              </div>
              {!list.data ? <Spinner /> : (
                <div className="divide-y divide-line-2">
                  {list.data.filter((s) => filter === 'all' || s.eligibility?.ok).map((s) => (
                    <button key={s.id} onClick={() => s.eligibility?.ok && setSessionId(s.id)} className={cn('block w-full px-4 py-3 text-left', s.eligibility?.ok ? 'hover:bg-hover' : 'cursor-not-allowed opacity-70', sessionId === s.id && 'bg-accent-soft')}>
                      <div className="flex flex-wrap items-center gap-2"><b className="text-[13px]">{s.title}</b><SessionTags s={s} /></div>
                      <SessionMeta s={s} />
                      <div className="mt-2 grid gap-3 md:grid-cols-[1fr_200px]">{s.eligibility && <EligibilityList e={s.eligibility} />}<SeatBar s={s} /></div>
                    </button>
                  ))}
                  {!list.data.filter((s) => filter === 'all' || s.eligibility?.ok).length && <Empty title="No eligible sessions right now">Switch to “All” to see why.</Empty>}
                </div>
              )}
              <div className="flex justify-between border-t border-line-2 px-4 py-3">
                <Button onClick={() => setStep(0)} disabled={!canOthers} icon={<ArrowLeft className="size-4" />}>Back</Button>
                <Button variant="primary" disabled={!chosen?.eligibility?.ok} onClick={() => { setStep(2); setOpen(true); }} icon={<ArrowRight className="size-4" />}>Continue</Button>
              </div>
            </Card>
          )}
          {step === 2 && chosen && (
            <Card className="p-4">
              <b className="text-[14px]">{chosen.title}</b>
              <SessionMeta s={chosen} />
              <div className="mt-4 flex gap-2"><Button onClick={() => setStep(1)} icon={<ArrowLeft className="size-4" />}>Back</Button><Button variant="primary" onClick={() => setOpen(true)}>Write reason & submit</Button></div>
            </Card>
          )}
        </div>
      </div>
      {open && chosen && <RequestModal session={chosen} personId={who} personName={who === me.personId ? 'yourself' : (person?.fullName ?? '')} onClose={() => setOpen(false)} />}
    </>
  );
}
