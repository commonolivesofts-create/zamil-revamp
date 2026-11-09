import { Ban, Layers, Pencil, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Session, SessionInput } from '@traininghub/shared';
import { api } from '../lib/api';
import { useAction, useGet, useLookups } from '../lib/data';
import { fmtRange, sar, todayIso } from '../lib/format';
import { PersonPicker, SeatBar } from '../components/domain';
import { Alert, Badge, Button, Card, Empty, Field, Input, Modal, PageHeader, Segmented, Select, Spinner, Table, Textarea } from '../components/ui';

export default function Sessions() {
  const [when, setWhen] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const list = useGet<Session[]>(['sessions', 'all'], '/sessions');
  const [edit, setEdit] = useState<Session | 'new' | null>(null);
  const [cancel, setCancel] = useState<Session | null>(null);
  const t = todayIso();
  if (!list.data) return <Spinner />;
  const rows = list.data.filter((s) => when === 'all' || (when === 'upcoming' ? s.endDate >= t : s.endDate < t));
  return (
    <>
      <PageHeader eyebrow="Administration" title="Sessions & schedule" sub="Publishing a session notifies every employee whose approved profile needs the skill and whose level is inside the band." actions={<Button variant="primary" onClick={() => setEdit('new')} icon={<Plus className="size-4" />}>New session</Button>} />
      <div className="mb-3"><Segmented value={when} onChange={setWhen} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }, { value: 'all', label: 'All' }]} /></div>
      <Card>
        {rows.length ? (
          <Table head={['Session', 'Dates', 'Trainer / provider', 'Band', 'Cost', 'Seats', '']}>
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="max-w-80"><b className="block truncate">{s.title}</b><span className="text-[10.5px] text-muted">{s.skillName} · {s.sessionType === 'EXTERNAL' ? 'External' : 'Internal'} · {s.location}</span>{s.status === 'CANCELLED' && <Badge tone="bad" className="ml-1">Cancelled</Badge>}</td>
                <td className="whitespace-nowrap">{fmtRange(s.startDate, s.endDate)}<div className="text-[10.5px] text-muted">{s.startTime}–{s.endTime} · {s.hours} h</div></td>
                <td>{s.trainerName ?? s.provider}</td>
                <td>L{s.bandFrom}–L{s.bandTo}</td>
                <td className="whitespace-nowrap tabular">{sar(s.costSar)}</td>
                <td className="w-48"><SeatBar s={s} /></td>
                <td className="whitespace-nowrap text-right">
                  {s.status === 'SCHEDULED' && !s.attendanceLocked && <><Button size="sm" variant="ghost" onClick={() => setEdit(s)} aria-label="Edit"><Pencil className="size-3.5" /></Button><Button size="sm" variant="ghost" onClick={() => setCancel(s)} aria-label="Cancel session"><Ban className="size-3.5 text-bad" /></Button></>}
                </td>
              </tr>
            ))}
          </Table>
        ) : <Empty icon={<Layers className="size-5" />} title="No sessions" />}
      </Card>
      {edit && <SessionModal s={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {cancel && <CancelModal s={cancel} onClose={() => setCancel(null)} />}
    </>
  );
}

function SessionModal({ s, onClose }: { s: Session | null; onClose: () => void }) {
  const L = useLookups();
  const [v, setV] = useState<SessionInput>(() => s ? {
    title: s.title, skillId: s.skillId, sessionType: s.sessionType, trainerPersonId: s.trainerPersonId, provider: s.provider, startDate: s.startDate, endDate: s.endDate,
    startTime: s.startTime, endTime: s.endTime, capacity: s.capacity, externalSeats: s.externalSeats, bandFrom: s.bandFrom, bandTo: s.bandTo, costSar: s.costSar,
    location: s.location, deliveryMode: s.deliveryMode, description: s.description,
  } : { title: '', skillId: 0, sessionType: 'INTERNAL', trainerPersonId: null, provider: '', startDate: '', endDate: '', startTime: '09:00', endTime: '13:00', capacity: 12, externalSeats: 0, bandFrom: 0, bandTo: 2, costSar: 0, location: '', deliveryMode: 'IN_PERSON', description: '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (p: Partial<SessionInput>) => setV({ ...v, ...p });
  const save = useAction(() => (s ? api.put(`/sessions/${s.id}`, v) : api.post<{ notified: number }>('/sessions', v)), {
    success: (r) => (s ? 'Session updated' : `Published · ${(r as { notified: number }).notified} matching employees notified`),
    invalidate: [['sessions'], ['catalog'], ['trainer-sessions']],
    onSuccess: onClose,
    onError: (e) => setErr({ ...e.fields, _: e.message }),
  });
  const ext = v.sessionType === 'EXTERNAL';
  return (
    <Modal open wide onClose={onClose} title={s ? `Edit ${s.title}` : 'New session'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>{s ? 'Save' : 'Publish'}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Title" error={err.title} className="sm:col-span-4"><Input value={v.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Skill it builds" error={err.skillId} className="sm:col-span-2"><Select value={v.skillId} onChange={(e) => set({ skillId: Number(e.target.value) })}><option value={0}>Choose…</option>{L.data?.categories.map((c) => <optgroup key={c.id} label={c.name}>{L.data!.skills.filter((x) => x.categoryId === c.id && x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>)}</Select></Field>
        <Field label="Type"><Select value={v.sessionType} onChange={(e) => set({ sessionType: e.target.value as SessionInput['sessionType'] })}><option value="INTERNAL">Internal</option><option value="EXTERNAL">External</option></Select></Field>
        <Field label="Delivery"><Select value={v.deliveryMode} onChange={(e) => set({ deliveryMode: e.target.value as SessionInput['deliveryMode'] })}><option value="IN_PERSON">In person</option><option value="ONLINE">Online</option><option value="BLENDED">Blended</option></Select></Field>
        {ext ? <Field label="Provider" error={err.provider} className="sm:col-span-2"><Input value={v.provider} onChange={(e) => set({ provider: e.target.value })} /></Field>
          : <Field label="Internal trainer" error={err.trainerPersonId} className="sm:col-span-2"><PersonPicker value={v.trainerPersonId} onChange={(id) => set({ trainerPersonId: id })} /></Field>}
        <Field label="Location / link" error={err.location} className="sm:col-span-2"><Input value={v.location} onChange={(e) => set({ location: e.target.value })} /></Field>
        <Field label="Start date" error={err.startDate}><Input type="date" value={v.startDate} onChange={(e) => set({ startDate: e.target.value, endDate: v.endDate || e.target.value })} /></Field>
        <Field label="End date" error={err.endDate}><Input type="date" value={v.endDate} onChange={(e) => set({ endDate: e.target.value })} /></Field>
        <Field label="Start time" error={err.startTime}><Input type="time" value={v.startTime} onChange={(e) => set({ startTime: e.target.value })} /></Field>
        <Field label="End time" error={err.endTime}><Input type="time" value={v.endTime} onChange={(e) => set({ endTime: e.target.value })} /></Field>
        <Field label="Capacity" error={err.capacity}><Input type="number" min={1} value={v.capacity} onChange={(e) => set({ capacity: Number(e.target.value) })} /></Field>
        <Field label="Seats held outside" error={err.externalSeats} hint="e.g. other departments"><Input type="number" min={0} value={v.externalSeats} onChange={(e) => set({ externalSeats: Number(e.target.value) })} /></Field>
        <Field label="Level band from" error={err.bandFrom}><Select value={v.bandFrom} onChange={(e) => set({ bandFrom: Number(e.target.value) })}>{[0, 1, 2, 3, 4].map((l) => <option key={l} value={l}>L{l}</option>)}</Select></Field>
        <Field label="to" error={err.bandTo}><Select value={v.bandTo} onChange={(e) => set({ bandTo: Number(e.target.value) })}>{[0, 1, 2, 3, 4].map((l) => <option key={l} value={l}>L{l}</option>)}</Select></Field>
        <Field label="Cost per seat (SAR)" error={err.costSar}><Input type="number" min={0} value={v.costSar} onChange={(e) => set({ costSar: Number(e.target.value) })} /></Field>
        <Field label="Description" className="sm:col-span-3"><Textarea rows={2} value={v.description} onChange={(e) => set({ description: e.target.value })} /></Field>
      </div>
      {err._ && Object.keys(err).length === 1 && <Alert tone="bad" className="mt-3">{err._}</Alert>}
    </Modal>
  );
}

function CancelModal({ s, onClose }: { s: Session; onClose: () => void }) {
  const [c, setC] = useState('');
  const go = useAction(() => api.post<{ withdrawn: number }>(`/sessions/${s.id}/cancel`, { comment: c }), { success: (r) => `Cancelled · ${r.withdrawn} request(s) withdrawn and notified`, invalidate: [['sessions'], ['catalog']], onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Cancel ${s.title}?`} sub="Open requests are withdrawn and the learners are notified." footer={<><Button onClick={onClose}>Keep</Button><Button variant="danger" disabled={c.trim().length < 5} loading={go.isPending} onClick={() => go.mutate(undefined)}>Cancel session</Button></>}>
      <Field label="Reason"><Textarea value={c} onChange={(e) => setC(e.target.value)} /></Field>
    </Modal>
  );
}
