import { AlertTriangle, CalendarDays, Check, CircleSlash, Clock, MapPin, Search, User, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { APPROVER_TYPE_LABEL, LEVEL_LABEL, ROLE_LABEL, type ApprovalStep, type Eligibility, type Session } from '@traininghub/shared';
import { cn } from '../lib/cn';
import { useLookups } from '../lib/data';
import { fmtDateTime, fmtRange, sar } from '../lib/format';
import { Badge, Input } from './ui';

export const CAT_COLORS = ['bg-c1', 'bg-c2', 'bg-c3', 'bg-c4', 'bg-c5', 'bg-c6', 'bg-c7', 'bg-c8'];
export const CAT_TEXT = ['text-c1', 'text-c2', 'text-c3', 'text-c4', 'text-c5', 'text-c6', 'text-c7', 'text-c8'];

export function SessionMeta({ s, compact }: { s: Session; compact?: boolean }) {
  return (
    <div className={cn('flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted', compact && 'text-[11px]')}>
      <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" />{fmtRange(s.startDate, s.endDate)} · {s.startTime}–{s.endTime}</span>
      {!compact && <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{s.location}</span>}
      <span className="inline-flex items-center gap-1"><User className="size-3" />{s.trainerName ?? s.provider}</span>
    </div>
  );
}

export function SeatBar({ s }: { s: Session }) {
  const pct = Math.round((s.seatsTaken / s.capacity) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-na-bg">
        <div className={cn('h-full rounded-full', s.seatsLeft === 0 ? 'bg-bad' : pct > 75 ? 'bg-opt' : 'bg-req')} style={{ width: `${pct}%` }} />
      </div>
      <span className="whitespace-nowrap text-[11px] font-semibold tabular text-muted">
        {s.seatsLeft ? `${s.seatsLeft} of ${s.capacity} left` : 'Full'}
        {s.waitlist ? ` · ${s.waitlist} waiting` : ''}
      </span>
    </div>
  );
}

export function SessionTags({ s }: { s: Session }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge tone={s.sessionType === 'EXTERNAL' ? 'warn' : 'info'}>{s.sessionType === 'EXTERNAL' ? 'External' : 'Internal'}</Badge>
      <Badge>{s.deliveryMode === 'ONLINE' ? 'Online' : s.deliveryMode === 'BLENDED' ? 'Blended' : 'In person'}</Badge>
      <Badge>L{s.bandFrom}–L{s.bandTo}</Badge>
      <Badge tone={s.costSar ? 'warn' : 'ok'}>{sar(s.costSar)}</Badge>
      {s.status === 'CANCELLED' && <Badge tone="bad">Cancelled</Badge>}
    </div>
  );
}

export function EligibilityList({ e }: { e: Eligibility }) {
  if (e.ok && !e.warnings.length)
    return (
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-req">
        <Check className="size-3.5" /> Eligible
        {e.requirement && <span className="font-normal text-muted"> · now L{e.currentLevel}, target {e.requirement}{e.targetLevel}</span>}
      </div>
    );
  return (
    <ul className="space-y-1">
      {e.errors.map((x) => (
        <li key={x.code + x.message} className="flex gap-1.5 text-[11.5px] text-bad"><CircleSlash className="mt-0.5 size-3.5 shrink-0" />{x.message}</li>
      ))}
      {e.warnings.map((x) => (
        <li key={x.code + x.message} className="flex gap-1.5 text-[11.5px] text-opt-ink"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{x.message}</li>
      ))}
    </ul>
  );
}

export function StepsTimeline({ steps }: { steps: ApprovalStep[] }) {
  return (
    <ol className="relative space-y-3 pl-6">
      <span className="absolute bottom-2 left-[9px] top-2 w-px bg-line" />
      {steps.map((s) => {
        const tone = {
          APPROVED: 'bg-req text-white',
          REJECTED: 'bg-bad text-white',
          PENDING: 'bg-opt text-white ring-4 ring-opt/20',
          WAITING: 'bg-surface border border-line text-muted',
          SKIPPED: 'bg-na-bg text-na',
          CANCELLED: 'bg-na-bg text-na',
        }[s.status];
        const who = s.approverName ?? (s.roleCode ? `Any ${ROLE_LABEL[s.roleCode]}` : APPROVER_TYPE_LABEL[s.approverType]);
        return (
          <li key={s.id} className="relative">
            <span className={cn('absolute -left-6 top-0.5 grid size-[18px] place-items-center rounded-full text-[9px] font-bold', tone)}>
              {s.status === 'APPROVED' ? <Check className="size-3" /> : s.status === 'REJECTED' ? <X className="size-3" /> : s.status === 'PENDING' ? <Clock className="size-3" /> : s.stepNo}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <b className="text-[12.5px]">{s.label}</b>
              <span className="text-[11.5px] text-muted">{who}</span>
              {s.delegatedFromName && <Badge tone="warn">for {s.delegatedFromName}</Badge>}
              {s.forwardedFromName && <Badge tone="info">forwarded by {s.forwardedFromName}</Badge>}
            </div>
            <div className="text-[11px] text-fine">
              {s.status === 'APPROVED' || s.status === 'REJECTED'
                ? `${s.status === 'APPROVED' ? 'Approved' : 'Rejected'} by ${s.actedByName} · ${fmtDateTime(s.actedAt)}`
                : s.status === 'PENDING'
                  ? `Waiting since ${fmtDateTime(s.sinceAt)}`
                  : s.status === 'SKIPPED'
                    ? `Skipped — ${s.comments}`
                    : s.status === 'CANCELLED'
                      ? 'Not needed'
                      : 'Not started'}
            </div>
            {s.comments && s.status !== 'SKIPPED' && <p className="mt-1 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[11.5px]">“{s.comments}”</p>}
          </li>
        );
      })}
    </ol>
  );
}

/** Searchable person picker over the active employees in lookups. */
export function PersonPicker({ value, onChange, exclude = [], placeholder = 'Search by name or number…', only }: { value: number | null; onChange: (id: number | null) => void; exclude?: number[]; placeholder?: string; only?: number[] }) {
  const L = useLookups();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const people = useMemo(() => (L.data?.people ?? []).filter((p) => !exclude.includes(p.personId) && (!only || only.includes(p.personId))), [L.data, exclude, only]);
  const sel = people.find((p) => p.personId === value) ?? L.data?.people.find((p) => p.personId === value);
  const list = people.filter((p) => !q || `${p.fullName} ${p.personNumber}`.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-fine" />
      <Input
        className="pl-8"
        placeholder={placeholder}
        value={open ? q : sel ? `${sel.fullName} · #${sel.personNumber}` : ''}
        onFocus={() => {
          setOpen(true);
          setQ('');
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-pop scroll-thin">
          {value != null && (
            <button type="button" className="w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] text-muted hover:bg-hover" onMouseDown={() => onChange(null)}>Clear</button>
          )}
          {list.map((p) => (
            <button type="button" key={p.personId} onMouseDown={() => onChange(p.personId)} className="block w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-hover">
              <b className="text-[12px]">{p.fullName}</b> <small className="text-[10.5px] text-muted">#{p.personNumber} · {p.jobName ?? '—'}</small>
            </button>
          ))}
          {!list.length && <p className="px-2.5 py-2 text-[12px] text-muted">No match</p>}
        </div>
      )}
    </div>
  );
}

export const levelName = (l: number) => `L${l} ${LEVEL_LABEL[l] ?? ''}`;
