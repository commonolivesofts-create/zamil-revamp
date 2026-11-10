import {
  ArrowDownToLine,
  Ban,
  CalendarDays,
  Check,
  FileText,
  Layers,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Session, SessionInput } from '@traininghub/shared';
import { api } from '../lib/api';
import { useAction, useGet, useLookups } from '../lib/data';
import { fmtRange, sar, todayIso } from '../lib/format';
import { downloadCsv, printPdf } from '../lib/report-export';
import { PersonPicker, SeatBar } from '../components/domain';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  Empty,
  Field,
  Input,
  Modal,
  PageHeader,
  Segmented,
  Skeleton,
  Select,
  Table,
  Textarea,
} from '../components/ui';

type Period = 'upcoming' | 'past' | 'all';
type SessionFilters = { skillId: string; type: string; delivery: string; status: string };
const EMPTY_FILTERS: SessionFilters = { skillId: 'all', type: 'all', delivery: 'all', status: 'all' };
const DELIVERY_LABEL: Record<Session['deliveryMode'], string> = {
  IN_PERSON: 'In person',
  ONLINE: 'Online',
  BLENDED: 'Blended',
};

export default function Sessions() {
  const [when, setWhen] = useState<Period>('upcoming');
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<SessionFilters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<SessionFilters>(EMPTY_FILTERS);
  const list = useGet<Session[]>(['sessions', 'all'], '/sessions');
  const lookups = useLookups();
  const [edit, setEdit] = useState<Session | 'new' | null>(null);
  const [cancel, setCancel] = useState<Session | null>(null);
  const today = todayIso();

  const filtered = useMemo(
    () =>
      (list.data ?? []).filter((session) => {
        const inPeriod =
          when === 'all' || (when === 'upcoming' ? session.endDate >= today : session.endDate < today);
        const matchesQuery =
          !query ||
          [session.title, session.skillName, session.trainerName, session.provider, session.location]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(query.trim().toLowerCase());
        return (
          inPeriod &&
          matchesQuery &&
          (filters.skillId === 'all' || String(session.skillId) === filters.skillId) &&
          (filters.type === 'all' || session.sessionType === filters.type) &&
          (filters.delivery === 'all' || session.deliveryMode === filters.delivery) &&
          (filters.status === 'all' || session.status === filters.status)
        );
      }),
    [list.data, when, today, query, filters],
  );

  const exportColumns = [
    { label: 'Session', value: (s: Session) => s.title },
    { label: 'Skill', value: (s: Session) => s.skillName },
    { label: 'Type', value: (s: Session) => (s.sessionType === 'EXTERNAL' ? 'External' : 'Internal') },
    {
      label: 'Schedule',
      value: (s: Session) => `${fmtRange(s.startDate, s.endDate)} · ${s.startTime}–${s.endTime}`,
    },
    { label: 'Trainer / provider', value: (s: Session) => s.trainerName ?? s.provider },
    { label: 'Delivery', value: (s: Session) => DELIVERY_LABEL[s.deliveryMode] },
    { label: 'Location', value: (s: Session) => s.location },
    { label: 'Level band', value: (s: Session) => `L${s.bandFrom}–L${s.bandTo}` },
    { label: 'Cost per seat', value: (s: Session) => sar(s.costSar) },
    {
      label: 'Seats',
      value: (s: Session) => `${s.seatsTaken}/${s.capacity} booked · ${s.waitlist} waitlisted`,
    },
    { label: 'Status', value: (s: Session) => (s.status === 'CANCELLED' ? 'Cancelled' : 'Scheduled') },
  ];
  const exportCsv = () => downloadCsv(filtered, exportColumns, 'training_sessions');
  const exportPdf = () => printPdf(filtered, exportColumns, 'Training Sessions & Schedule');
  const activeFilters = Object.values(filters).filter((value) => value !== 'all').length;
  const updateDraft = (key: keyof SessionFilters, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    setFilters(draft);
    setFiltersOpen(false);
  };
  const resetFilters = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setQuery('');
  };

  if (!list.data && list.isPending) return <SessionsLoading />;

  const sessions = list.data ?? [];
  const upcomingCount = sessions.filter((s) => s.endDate >= today).length;
  const pastCount = sessions.filter((s) => s.endDate < today).length;
  return (
    <div className="th-sessions">
      <PageHeader
        animatedTitle
        breadcrumb="Administration"
        title="Sessions & schedule"
        actions={
          <div className="th-sessions__header-actions">
            <Button
              className="th-sessions__header-action"
              icon={<ArrowDownToLine className="size-3.5" />}
              onClick={exportCsv}
              disabled={!filtered.length}
            >
              CSV
            </Button>
            <Button
              className="th-sessions__header-action"
              icon={<FileText className="size-3.5" />}
              onClick={exportPdf}
              disabled={!filtered.length}
            >
              PDF
            </Button>
            <Button
              className="th-sessions__header-action"
              aria-expanded={filtersOpen}
              aria-controls="session-filters"
              variant={filtersOpen || activeFilters ? 'soft' : 'default'}
              icon={<SlidersHorizontal className="size-3.5" />}
              onClick={() => {
                setDraft(filters);
                setFiltersOpen((open) => !open);
              }}
            >
              Filter{activeFilters > 0 && <span className="th-sessions__filter-count">{activeFilters}</span>}
            </Button>
            <Button
              className="th-sessions__header-action"
              variant="primary"
              onClick={() => setEdit('new')}
              icon={<Plus className="size-4" />}
            >
              New session
            </Button>
          </div>
        }
      />

      {list.error && <Alert tone="bad">{list.error.message}</Alert>}
      {list.data && (
        <Card className="th-sessions__report">
          <CardHead
            title="Training sessions"
            sub="Manage delivery dates, trainers, capacity, and session status."
            actions={
              <span className="th-sessions__result-count">
                {filtered.length} of {sessions.length} sessions
              </span>
            }
          />
          <div className="th-sessions__toolbar">
            <div className="th-sessions__period" role="group" aria-label="Filter by schedule period">
              <Segmented
                value={when}
                onChange={setWhen}
                size="sm"
                options={[
                  { value: 'upcoming', label: `Upcoming · ${upcomingCount}` },
                  { value: 'past', label: `Past · ${pastCount}` },
                  { value: 'all', label: `All · ${sessions.length}` },
                ]}
              />
            </div>
            <label className="th-sessions__search" htmlFor="session-search">
              <Search aria-hidden="true" />
              <Input
                id="session-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search session, skill, trainer, or location"
              />
            </label>
          </div>
          <div
            id="session-filters"
            className={`th-sessions__filter-panel${filtersOpen ? ' is-open' : ''}`}
            aria-hidden={!filtersOpen}
          >
            {filtersOpen && (
              <form
                className="th-sessions__filter-form"
                onSubmit={applyFilters}
                aria-label="Filter training sessions"
              >
                <label>
                  <span>Skill</span>
                  <Select
                    value={draft.skillId}
                    onChange={(event) => updateDraft('skillId', event.target.value)}
                  >
                    <option value="all">All skills</option>
                    {lookups.data?.skills
                      .filter((skill) => skill.active)
                      .map((skill) => (
                        <option key={skill.id} value={skill.id}>
                          {skill.name}
                        </option>
                      ))}
                  </Select>
                </label>
                <label>
                  <span>Session type</span>
                  <Select value={draft.type} onChange={(event) => updateDraft('type', event.target.value)}>
                    <option value="all">All types</option>
                    <option value="INTERNAL">Internal</option>
                    <option value="EXTERNAL">External</option>
                  </Select>
                </label>
                <label>
                  <span>Delivery</span>
                  <Select
                    value={draft.delivery}
                    onChange={(event) => updateDraft('delivery', event.target.value)}
                  >
                    <option value="all">All delivery modes</option>
                    <option value="IN_PERSON">In person</option>
                    <option value="ONLINE">Online</option>
                    <option value="BLENDED">Blended</option>
                  </Select>
                </label>
                <label>
                  <span>Status</span>
                  <Select
                    value={draft.status}
                    onChange={(event) => updateDraft('status', event.target.value)}
                  >
                    <option value="all">All statuses</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="CANCELLED">Cancelled</option>
                  </Select>
                </label>
                <div className="th-sessions__filter-actions">
                  <Button variant="primary" type="submit" icon={<Check className="size-3.5" />}>
                    Apply filters
                  </Button>
                  <Button type="button" onClick={resetFilters} icon={<RotateCcw className="size-3.5" />}>
                    Reset
                  </Button>
                </div>
              </form>
            )}
          </div>
          {filtered.length ? (
            <Table
              className="th-sessions__table"
              pageSize={10}
              pagerLabel="Training session pages"
              head={[
                'Training session',
                'Schedule',
                'Trainer / provider',
                'Delivery & location',
                'Level / cost',
                'Seats',
                '',
              ]}
            >
              {filtered.map((session, index) => (
                <tr key={session.id} style={{ '--th-row-index': index } as React.CSSProperties}>
                  <td>
                    <div className="th-sessions__session-cell">
                      <span className="th-sessions__session-icon">
                        <Layers aria-hidden="true" />
                      </span>
                      <span className="th-sessions__session-copy">
                        <b>{session.title}</b>
                        <small>{session.skillName}</small>
                        <span className="th-sessions__badges">
                          <Badge tone={session.sessionType === 'EXTERNAL' ? 'info' : 'neutral'}>
                            {session.sessionType === 'EXTERNAL' ? 'External' : 'Internal'}
                          </Badge>
                          <Badge tone={session.status === 'CANCELLED' ? 'bad' : 'ok'} dot>
                            {session.status === 'CANCELLED' ? 'Cancelled' : 'Scheduled'}
                          </Badge>
                        </span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="th-sessions__schedule">
                      <b>
                        <CalendarDays aria-hidden="true" />
                        {fmtRange(session.startDate, session.endDate)}
                      </b>
                      <small>
                        {session.startTime}–{session.endTime} · {session.hours} h
                      </small>
                    </div>
                  </td>
                  <td>
                    <span className="th-sessions__trainer">
                      {session.trainerName ?? session.provider ?? 'Not assigned'}
                    </span>
                  </td>
                  <td>
                    <div className="th-sessions__location">
                      <b>{DELIVERY_LABEL[session.deliveryMode]}</b>
                      <small>
                        <MapPin aria-hidden="true" />
                        {session.location}
                      </small>
                    </div>
                  </td>
                  <td>
                    <div className="th-sessions__band">
                      <b>
                        L{session.bandFrom}–L{session.bandTo}
                      </b>
                      <small>{sar(session.costSar)} per seat</small>
                    </div>
                  </td>
                  <td>
                    <div className="th-sessions__seat-cell">
                      <SeatBar s={session} />
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <div className="th-sessions__row-actions">
                      {session.status === 'SCHEDULED' && !session.attendanceLocked ? (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEdit(session)}
                            aria-label={`Edit ${session.title}`}
                            title="Edit session"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCancel(session)}
                            aria-label={`Cancel ${session.title}`}
                            title="Cancel session"
                          >
                            <Ban className="size-3.5 text-bad" />
                          </Button>
                        </>
                      ) : (
                        <span className="th-sessions__locked">
                          {session.attendanceLocked ? 'Locked' : '—'}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty
              icon={<Layers className="size-5" />}
              title={sessions.length ? 'No sessions match these filters' : 'No training sessions yet'}
            >
              {sessions.length
                ? 'Try adjusting your search or clearing one or more filters.'
                : 'Create a session to add it to the training schedule.'}
            </Empty>
          )}
        </Card>
      )}
      {edit && <SessionModal s={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {cancel && <CancelModal s={cancel} onClose={() => setCancel(null)} />}
    </div>
  );
}

function SessionsLoading() {
  return (
    <div className="th-sessions th-sessions__loading" role="status" aria-live="polite">
      <span className="sr-only">Loading training sessions</span>
      <PageHeader animatedTitle breadcrumb="Administration" title="Sessions & schedule" />
      <Card className="th-sessions__report">
        <div className="th-sessions__loading-toolbar">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-9 w-72" />
        </div>
        {Array.from({ length: 6 }, (_, index) => (
          <div className="th-sessions__loading-row" key={index}>
            <Skeleton className="size-9 rounded-xl" />
            <div>
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="mt-2 h-3 w-28" />
            </div>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </Card>
    </div>
  );
}

function SessionModal({ s, onClose }: { s: Session | null; onClose: () => void }) {
  const L = useLookups();
  const [v, setV] = useState<SessionInput>(() =>
    s
      ? {
          title: s.title,
          skillId: s.skillId,
          sessionType: s.sessionType,
          trainerPersonId: s.trainerPersonId,
          provider: s.provider,
          startDate: s.startDate,
          endDate: s.endDate,
          startTime: s.startTime,
          endTime: s.endTime,
          capacity: s.capacity,
          externalSeats: s.externalSeats,
          bandFrom: s.bandFrom,
          bandTo: s.bandTo,
          costSar: s.costSar,
          location: s.location,
          deliveryMode: s.deliveryMode,
          description: s.description,
        }
      : {
          title: '',
          skillId: 0,
          sessionType: 'INTERNAL',
          trainerPersonId: null,
          provider: '',
          startDate: '',
          endDate: '',
          startTime: '09:00',
          endTime: '13:00',
          capacity: 12,
          externalSeats: 0,
          bandFrom: 0,
          bandTo: 2,
          costSar: 0,
          location: '',
          deliveryMode: 'IN_PERSON',
          description: '',
        },
  );
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (p: Partial<SessionInput>) => setV({ ...v, ...p });
  const save = useAction(
    () => (s ? api.put(`/sessions/${s.id}`, v) : api.post<{ notified: number }>('/sessions', v)),
    {
      success: (r) =>
        s
          ? 'Session updated'
          : `Published · ${(r as { notified: number }).notified} matching employees notified`,
      invalidate: [['sessions'], ['catalog'], ['trainer-sessions']],
      onSuccess: onClose,
      onError: (e) => setErr({ ...e.fields, _: e.message }),
    },
  );
  const ext = v.sessionType === 'EXTERNAL';
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={s ? `Edit ${s.title}` : 'New session'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>
            {s ? 'Save' : 'Publish'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Title" error={err.title} className="sm:col-span-4">
          <Input value={v.title} onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Skill it builds" error={err.skillId} className="sm:col-span-2">
          <Select value={v.skillId} onChange={(e) => set({ skillId: Number(e.target.value) })}>
            <option value={0}>Choose…</option>
            {L.data?.categories.map((c) => (
              <optgroup key={c.id} label={c.name}>
                {L.data!.skills.filter((x) => x.categoryId === c.id && x.active).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select
            value={v.sessionType}
            onChange={(e) => set({ sessionType: e.target.value as SessionInput['sessionType'] })}
          >
            <option value="INTERNAL">Internal</option>
            <option value="EXTERNAL">External</option>
          </Select>
        </Field>
        <Field label="Delivery">
          <Select
            value={v.deliveryMode}
            onChange={(e) => set({ deliveryMode: e.target.value as SessionInput['deliveryMode'] })}
          >
            <option value="IN_PERSON">In person</option>
            <option value="ONLINE">Online</option>
            <option value="BLENDED">Blended</option>
          </Select>
        </Field>
        {ext ? (
          <Field label="Provider" error={err.provider} className="sm:col-span-2">
            <Input value={v.provider} onChange={(e) => set({ provider: e.target.value })} />
          </Field>
        ) : (
          <Field label="Internal trainer" error={err.trainerPersonId} className="sm:col-span-2">
            <PersonPicker value={v.trainerPersonId} onChange={(id) => set({ trainerPersonId: id })} />
          </Field>
        )}
        <Field label="Location / link" error={err.location} className="sm:col-span-2">
          <Input value={v.location} onChange={(e) => set({ location: e.target.value })} />
        </Field>
        <Field label="Start date" error={err.startDate}>
          <Input
            type="date"
            value={v.startDate}
            onChange={(e) => set({ startDate: e.target.value, endDate: v.endDate || e.target.value })}
          />
        </Field>
        <Field label="End date" error={err.endDate}>
          <Input type="date" value={v.endDate} onChange={(e) => set({ endDate: e.target.value })} />
        </Field>
        <Field label="Start time" error={err.startTime}>
          <Input type="time" value={v.startTime} onChange={(e) => set({ startTime: e.target.value })} />
        </Field>
        <Field label="End time" error={err.endTime}>
          <Input type="time" value={v.endTime} onChange={(e) => set({ endTime: e.target.value })} />
        </Field>
        <Field label="Capacity" error={err.capacity}>
          <Input
            type="number"
            min={1}
            value={v.capacity}
            onChange={(e) => set({ capacity: Number(e.target.value) })}
          />
        </Field>
        <Field label="Seats held outside" error={err.externalSeats} hint="e.g. other departments">
          <Input
            type="number"
            min={0}
            value={v.externalSeats}
            onChange={(e) => set({ externalSeats: Number(e.target.value) })}
          />
        </Field>
        <Field label="Level band from" error={err.bandFrom}>
          <Select value={v.bandFrom} onChange={(e) => set({ bandFrom: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4].map((l) => (
              <option key={l} value={l}>
                L{l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="to" error={err.bandTo}>
          <Select value={v.bandTo} onChange={(e) => set({ bandTo: Number(e.target.value) })}>
            {[0, 1, 2, 3, 4].map((l) => (
              <option key={l} value={l}>
                L{l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Cost per seat (SAR)" error={err.costSar}>
          <Input
            type="number"
            min={0}
            value={v.costSar}
            onChange={(e) => set({ costSar: Number(e.target.value) })}
          />
        </Field>
        <Field label="Description" className="sm:col-span-3">
          <Textarea rows={2} value={v.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
      </div>
      {err._ && Object.keys(err).length === 1 && (
        <Alert tone="bad" className="mt-3">
          {err._}
        </Alert>
      )}
    </Modal>
  );
}

function CancelModal({ s, onClose }: { s: Session; onClose: () => void }) {
  const [c, setC] = useState('');
  const go = useAction(() => api.post<{ withdrawn: number }>(`/sessions/${s.id}/cancel`, { comment: c }), {
    success: (r) => `Cancelled · ${r.withdrawn} request(s) withdrawn and notified`,
    invalidate: [['sessions'], ['catalog']],
    onSuccess: onClose,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title={`Cancel ${s.title}?`}
      sub="Open requests are withdrawn and the learners are notified."
      footer={
        <>
          <Button onClick={onClose}>Keep</Button>
          <Button
            variant="danger"
            disabled={c.trim().length < 5}
            loading={go.isPending}
            onClick={() => go.mutate(undefined)}
          >
            Cancel session
          </Button>
        </>
      }
    >
      <Field label="Reason">
        <Textarea value={c} onChange={(e) => setC(e.target.value)} />
      </Field>
    </Modal>
  );
}
