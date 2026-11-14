import { Award, CheckCheck, ClipboardCheck, Lock, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { AttendanceMark, Exam, RosterRow, Session } from '@traininghub/shared';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { useAction, useGet } from '../lib/data';
import { fmtDate, todayIso } from '../lib/format';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHead,
  Empty,
  Input,
  Modal,
  PageHeader,
  Spinner,
  StatusChip,
  Skeleton,
  Table,
} from '../components/ui';

type TS = Session & { learners: number };

export function SessionStrip({
  list,
  sel,
  onSelect,
  status,
}: {
  list: TS[];
  sel: number | null;
  onSelect: (id: number) => void;
  status: (s: TS) => string;
}) {
  return (
    <div className="th-attendance__sessions" role="group" aria-label="Training sessions">
      {list.map((s) => (
        <button
          key={s.id}
          type="button"
          aria-pressed={sel === s.id}
          onClick={() => onSelect(s.id)}
          className={cn(
            'th-attendance__session rounded-xl border px-3 py-2 text-left',
            sel === s.id ? 'border-req bg-accent-soft' : 'border-line bg-surface hover:bg-hover',
          )}
        >
          <small className="text-[10px] font-bold uppercase tracking-wider text-fine">
            {fmtDate(s.startDate)}
          </small>
          <b className="block truncate text-[12.5px]">{s.title}</b>
          <em className="text-[11px] not-italic text-muted">{status(s)}</em>
        </button>
      ))}
    </div>
  );
}

export default function Attendance() {
  const [params, setParams] = useSearchParams();
  const list = useGet<TS[]>(['trainer-sessions'], '/trainer/sessions');
  const withLearners = (list.data ?? []).filter((s) => s.learners);
  const t = todayIso();
  const sel =
    Number(params.get('session')) ||
    withLearners.find((s) => s.startDate <= t && !s.resultsReleased)?.id ||
    withLearners[0]?.id ||
    null;
  if (!list.data && list.isPending) return <AttendanceLoading />;
  return (
    <div className="th-attendance">
      <PageHeader animatedTitle breadcrumb="Trainer" title="Attendance & marks" />
      {list.error && <Alert tone="bad">{list.error.message}</Alert>}
      {list.data && !withLearners.length ? (
        <Card className="th-attendance__empty">
          <Empty
            icon={<ClipboardCheck className="size-5" />}
            title="No sessions with confirmed learners yet"
          />
        </Card>
      ) : (
        list.data && (
          <>
            <SessionStrip
              list={withLearners}
              sel={sel}
              onSelect={(id) => setParams({ session: String(id) })}
              status={(s) =>
                s.resultsReleased
                  ? 'Results released'
                  : s.attendanceLocked
                    ? 'Attendance locked'
                    : s.startDate <= t
                      ? 'Mark attendance'
                      : 'Upcoming'
              }
            />
            {sel && <Roster id={sel} />}
          </>
        )
      )}
    </div>
  );
}

function AttendanceLoading() {
  return (
    <div className="th-attendance">
      <PageHeader animatedTitle breadcrumb="Trainer" title="Attendance & marks" />
      <div className="th-attendance__loading-sessions">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[74px] rounded-xl" />
        ))}
      </div>
      <Card className="th-attendance__loading-panel">
        <div className="th-attendance__loading-head">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-56" />
        </div>
        {Array.from({ length: 5 }, (_, i) => (
          <div className="th-attendance__loading-row" key={i}>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-36" />
          </div>
        ))}
      </Card>
    </div>
  );
}

function Roster({ id }: { id: number }) {
  const r = useGet<{ session: Session; rows: RosterRow[]; canMark: boolean }>(
    ['roster', id],
    `/trainer/sessions/${id}/roster`,
  );
  const exam = useGet<Exam | null>(['exam', id], `/trainer/sessions/${id}/exam`);
  const [marks, setMarks] = useState<Record<number, AttendanceMark>>({});
  const [prac, setPrac] = useState<Record<number, string>>({});
  const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => {
    setMarks({});
    setPrac({});
  }, [id]);
  const inv = [['roster', id], ['trainer-sessions'], ['exam', id]];
  const saveAtt = useAction(
    (m: Record<number, AttendanceMark>) => api.put(`/trainer/sessions/${id}/attendance`, { marks: m }),
    { success: 'Attendance saved', invalidate: inv, onSuccess: () => setMarks({}) },
  );
  const lock = useAction(
    () => api.post<{ attended: number; total: number }>(`/trainer/sessions/${id}/lock`),
    { success: (x) => `Attendance locked · ${x.attended}/${x.total} attended`, invalidate: inv },
  );
  const savePrac = useAction(
    () =>
      api.put(`/trainer/sessions/${id}/practical`, {
        marks: Object.fromEntries(Object.entries(prac).map(([k, v]) => [k, v === '' ? null : Number(v)])),
      }),
    { success: 'Practical marks saved', invalidate: inv, onSuccess: () => setPrac({}) },
  );
  const release = useAction(
    (force: boolean) =>
      api.post<{ passed: number; total: number }>(`/trainer/sessions/${id}/release`, { force }),
    {
      success: (x) => `Results released · ${x.passed}/${x.total} passed · skill levels updated`,
      invalidate: inv,
      onSuccess: () => setConfirm(null),
      onError: (e) =>
        (e.details as { confirm?: boolean })?.confirm ? setConfirm(e.message) : alertErr(e.message),
    },
  );
  const [errMsg, alertErr] = useState('');
  if (!r.data && r.isPending)
    return (
      <div className="th-attendance__loading-roster">
        <Spinner />
      </div>
    );
  if (!r.data) return <Alert tone="bad">{r.error?.message ?? 'Unable to load this session roster.'}</Alert>;
  const { session: s, rows, canMark } = r.data;
  const pending = rows.filter((x) => x.status === 'APPROVED');
  const unmarked = pending.filter((x) => !(marks[x.personId] ?? x.mark));
  const attendees = rows.filter((x) => ['ATTENDED', 'COMPLETED', 'NOT_PASSED'].includes(x.status));
  return (
    <div className="th-attendance__roster">
      {!canMark && !s.attendanceLocked && (
        <Alert tone="info">Attendance opens on {fmtDate(s.startDate)}. You can review the roster now.</Alert>
      )}
      <Card className="th-attendance__panel th-attendance__attendance-panel">
        <CardHead
          title={`1 · Attendance · ${rows.length} learners`}
          sub={s.attendanceLocked ? 'Locked' : `${pending.length - unmarked.length}/${pending.length} marked`}
          actions={
            canMark && (
              <>
                <Button
                  size="sm"
                  onClick={() => setMarks(Object.fromEntries(pending.map((x) => [x.personId, 'PRESENT'])))}
                  icon={<CheckCheck className="size-3.5" />}
                >
                  All present
                </Button>
                <Button
                  size="sm"
                  disabled={!Object.keys(marks).length}
                  loading={saveAtt.isPending}
                  onClick={() => saveAtt.mutate(marks)}
                  icon={<Save className="size-3.5" />}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={unmarked.length > 0 || Object.keys(marks).length > 0}
                  loading={lock.isPending}
                  onClick={() => lock.mutate(undefined)}
                  icon={<Lock className="size-3.5" />}
                >
                  Lock attendance
                </Button>
              </>
            )
          }
        />
        <Table
          pageSize={10}
          pagerLabel="Attendance roster pages"
          head={['Learner', 'Position', 'Request', 'Attendance', 'Status']}
        >
          {rows.map((x) => {
            const m = marks[x.personId] ?? x.mark;
            return (
              <tr key={x.requestId}>
                <td>
                  <div className="flex items-center gap-2">
                    <Avatar name={x.personName} id={x.personId} size="xs" />
                    <b>{x.personName}</b>
                  </div>
                </td>
                <td className="text-muted">{x.positionName}</td>
                <td className="text-[11px] text-fine">{x.requestNo}</td>
                <td>
                  <div className="th-attendance__mark-group inline-flex overflow-hidden rounded-lg border border-line">
                    {(['PRESENT', 'LATE', 'ABSENT'] as const).map((k) => (
                      <button
                        key={k}
                        disabled={!canMark || x.status !== 'APPROVED'}
                        type="button"
                        aria-pressed={m === k}
                        aria-label={`${x.personName}: ${k.toLowerCase()}`}
                        onClick={() => setMarks({ ...marks, [x.personId]: k })}
                        className={cn(
                          'th-attendance__mark-option',
                          'h-7 border-r border-line px-2.5 text-[11px] font-semibold last:border-0 disabled:cursor-default',
                          m === k
                            ? k === 'ABSENT'
                              ? 'bg-bad text-white'
                              : k === 'LATE'
                                ? 'bg-opt text-white'
                                : 'bg-req text-white'
                            : 'enabled:hover:bg-hover',
                        )}
                      >
                        {k[0] + k.slice(1).toLowerCase()}
                      </button>
                    ))}
                  </div>
                </td>
                <td>
                  <StatusChip status={x.status} />
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
      {s.attendanceLocked && (
        <Card className="th-attendance__panel th-attendance__results-panel">
          <CardHead
            title="Theory test, practical marks and release"
            sub={
              exam.data
                ? `Pass: theory ≥ ${exam.data.passTheory}%${exam.data.hasPractical ? `, practical ≥ ${exam.data.passPractical}/10` : ''} · exam ${exam.data.status.toLowerCase()}`
                : exam.isPending
                  ? 'Loading this session’s assessment…'
                  : exam.error
                    ? 'Assessment details could not be loaded.'
                    : 'No exam for this session — attendance completed it.'
            }
            actions={
              exam.data &&
              !exam.data.released && (
                <>
                  {exam.data.hasPractical && (
                    <Button
                      size="sm"
                      disabled={!Object.keys(prac).length}
                      loading={savePrac.isPending}
                      onClick={() => savePrac.mutate(undefined)}
                      icon={<Save className="size-3.5" />}
                    >
                      Save marks
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={Object.keys(prac).length > 0}
                    loading={release.isPending}
                    onClick={() => release.mutate(false)}
                    icon={<Award className="size-3.5" />}
                  >
                    Release results
                  </Button>
                </>
              )
            }
          />
          {errMsg && (
            <Alert tone="bad" className="m-4">
              {errMsg}
            </Alert>
          )}
          {exam.data && (
            <Table
              pageSize={10}
              pagerLabel="Exam result pages"
              head={['Learner', 'Theory', 'Practical (0–10)', 'Result']}
            >
              {attendees.map((x) => (
                <tr key={x.requestId}>
                  <td>
                    <b>{x.personName}</b>
                  </td>
                  <td className="tabular">
                    {x.submittedAt ? <b>{x.theory}%</b> : <Badge tone="warn">not submitted</Badge>}
                  </td>
                  <td>
                    {exam.data!.hasPractical ? (
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        className="h-8 w-20 py-1"
                        disabled={exam.data!.released}
                        value={prac[x.personId] ?? x.practical ?? ''}
                        onChange={(e) => setPrac({ ...prac, [x.personId]: e.target.value })}
                        aria-label={`Practical mark for ${x.personName}`}
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {x.passed == null ? (
                      <span className="text-fine">—</span>
                    ) : (
                      <Badge tone={x.passed ? 'ok' : 'bad'}>{x.passed ? 'Passed' : 'Not passed'}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}
      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Release results now?"
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Wait</Button>
            <Button variant="danger" loading={release.isPending} onClick={() => release.mutate(true)}>
              Release anyway
            </Button>
          </>
        }
      >
        <p className="text-[12.5px]">{confirm}</p>
      </Modal>
    </div>
  );
}
