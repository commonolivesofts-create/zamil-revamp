import {
  ArrowRight,
  ClipboardCheck,
  GraduationCap,
  Grid3x3,
  Inbox,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import type { PersonSkills, Session, TrainingRequest } from '@traininghub/shared';
import { Card, CardHead, Empty, Kpi, Meter, PageHeader, StatusChip } from '../components/ui';
import { SessionMeta } from '../components/domain';
import { hasRole, skillMap, useGet, useLookups, useMe } from '../lib/data';
import { fmtDate, sar, todayIso } from '../lib/format';

export default function Dashboard() {
  const me = useMe().data!;
  const L = useLookups();
  const skills = skillMap(L.data);
  const mine = useGet<TrainingRequest[]>(['requests', 'mine'], '/requests?scope=mine');
  const sk = useGet<PersonSkills>(['skills', 'me'], me.positionId ? '/skills/me' : null);
  const upcoming = useGet<Session[]>(['sessions', 'upcoming'], `/sessions?from=${todayIso()}`);
  const trainer = useGet<(Session & { learners: number })[]>(
    ['trainer-sessions'],
    me.isTrainer ? '/trainer/sessions' : null,
  );
  const today = todayIso();

  const gaps = (sk.data?.rows ?? [])
    .filter((r) => r.requirement && r.requirement !== 'U' && r.currentLevel < r.targetLevel)
    .sort((a, b) => Number(b.critical) - Number(a.critical));
  const tasks: { icon: LucideIcon; title: string; sub: string; to: string; tone: string }[] = [];
  if (me.counts.approvals)
    tasks.push({
      icon: Inbox,
      title: `${me.counts.approvals} request${me.counts.approvals > 1 ? 's' : ''} waiting for your decision`,
      sub: 'Oldest first in your inbox',
      to: '/approvals',
      tone: 'text-opt',
    });
  if (me.counts.examsOpen)
    tasks.push({
      icon: GraduationCap,
      title: `${me.counts.examsOpen} assessment${me.counts.examsOpen > 1 ? 's' : ''} open`,
      sub: 'You attended — take the theory test',
      to: '/assessments',
      tone: 'text-und',
    });
  for (const s of trainer.data ?? []) {
    if (s.startDate <= today && !s.attendanceLocked && s.learners)
      tasks.push({
        icon: ClipboardCheck,
        title: `Mark attendance: ${s.title}`,
        sub: `${fmtDate(s.startDate)} · ${s.learners} learners`,
        to: `/attendance?session=${s.id}`,
        tone: 'text-opt',
      });
    else if (s.attendanceLocked && s.examStatus && !s.resultsReleased)
      tasks.push({
        icon: ClipboardCheck,
        title: `Add practical marks & release: ${s.title}`,
        sub: 'Results update skill levels',
        to: `/attendance?session=${s.id}`,
        tone: 'text-und',
      });
  }
  if (me.counts.profilesPending)
    tasks.push({
      icon: Grid3x3,
      title: `${me.counts.profilesPending} skill profile${me.counts.profilesPending > 1 ? 's' : ''} pending HR approval`,
      sub: 'Job Skills Matrix',
      to: '/jsm',
      tone: 'text-und',
    });
  const crit = gaps.filter((g) => g.critical);
  if (crit.length)
    tasks.push({
      icon: Target,
      title: `${crit.length} critical skill gap${crit.length > 1 ? 's' : ''}`,
      sub: crit
        .slice(0, 2)
        .map((g) => skills.get(g.skillId)?.name)
        .join(', '),
      to: '/skills',
      tone: 'text-bad',
    });

  const next = (mine.data ?? [])
    .filter((r) => r.status === 'APPROVED' && r.session.startDate >= today)
    .sort((a, b) => a.session.startDate.localeCompare(b.session.startDate))[0];
  const first = me.fullName.split(' ')[0];

  return (
    <>
      <PageHeader
        eyebrow={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`Good ${new Date().getHours() < 12 ? 'morning' : 'afternoon'}, ${first}`}
        sub={
          me.positionName
            ? `${me.positionName} · reports to ${me.managerName ?? '—'}`
            : 'Your position is not mapped in the Job Skills Matrix yet.'
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Readiness"
          value={sk.data ? `${sk.data.readiness}%` : '—'}
          sub="against your approved profile"
          tone={sk.data && sk.data.readiness < 60 ? 'bad' : 'ok'}
        />
        <Kpi
          label="Open gaps"
          value={gaps.length}
          sub={`${crit.length} critical`}
          tone={crit.length ? 'bad' : undefined}
        />
        <Kpi label="My open requests" value={me.counts.myOpen} sub="in approval" />
        <Kpi
          label="Waiting for me"
          value={me.counts.approvals}
          sub={hasRole(me, 'HR_LEAD') ? 'incl. HR Lead pool' : 'approvals'}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHead title="Your tasks" sub="Everything that needs you, in one place" />
            {tasks.length ? (
              tasks.map((t, i) => (
                <Link
                  key={i}
                  to={t.to}
                  className="flex items-center gap-3 border-b border-line-2 px-4 py-3 last:border-0 hover:bg-hover"
                >
                  <span className={`grid size-9 place-items-center rounded-xl bg-surface-2 ${t.tone}`}>
                    <t.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block text-[12.5px]">{t.title}</b>
                    <small className="text-[11.5px] text-muted">{t.sub}</small>
                  </span>
                  <ArrowRight className="size-4 text-fine" />
                </Link>
              ))
            ) : (
              <Empty title="Nothing waiting for you">Browse the catalog to plan your next session.</Empty>
            )}
          </Card>
          <Card>
            <CardHead
              title="My recent requests"
              actions={
                <Link to="/requests" className="text-[12px] font-semibold text-req">
                  All requests
                </Link>
              }
            />
            {(mine.data ?? []).slice(0, 5).map((r) => (
              <Link
                key={r.id}
                to={`/requests/${r.id}`}
                className="flex items-center gap-3 border-b border-line-2 px-4 py-2.5 last:border-0 hover:bg-hover"
              >
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[12.5px]">{r.session.title}</b>
                  <small className="text-[11px] text-muted">
                    {r.requestNo} · {fmtDate(r.session.startDate)}
                  </small>
                </span>
                <StatusChip status={r.status} />
              </Link>
            ))}
            {mine.data && !mine.data.length && <Empty title="No requests yet" />}
          </Card>
        </div>
        <div className="space-y-4">
          {next && (
            <Card className="overflow-hidden">
              <div className="bg-brand-2 px-4 py-4 text-[#d7efe3]">
                <small className="text-[10.5px] font-bold uppercase tracking-widest text-mint">
                  Your next session
                </small>
                <h3 className="mt-1 text-[16px] font-bold text-white">{next.session.title}</h3>
                <div className="mt-1 text-[12px]">
                  {fmtDate(next.session.startDate)} · {next.session.startTime}–{next.session.endTime} ·{' '}
                  {next.session.location}
                </div>
              </div>
            </Card>
          )}
          <Card>
            <CardHead
              title="Top gaps"
              sub="Against your approved position profile"
              actions={
                <Link to="/skills" className="text-[12px] font-semibold text-req">
                  My skills
                </Link>
              }
            />
            {gaps.slice(0, 6).map((g) => (
              <div
                key={g.skillId}
                className="flex items-center gap-3 border-b border-line-2 px-4 py-2.5 last:border-0"
              >
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
                  {g.critical && '★ '}
                  {skills.get(g.skillId)?.name}
                </span>
                <span className="text-[11px] tabular text-muted">
                  L{g.currentLevel} → L{g.targetLevel}
                </span>
                <Meter value={(g.currentLevel / g.targetLevel) * 100} className="w-16" />
              </div>
            ))}
            {sk.data && !gaps.length && <Empty title="No gaps — you meet your profile" />}
            {!me.positionId && (
              <Empty title="No position profile">Ask HR to map your Fusion job to a position.</Empty>
            )}
          </Card>
          <Card>
            <CardHead
              title="Coming up"
              actions={
                <Link to="/catalog" className="text-[12px] font-semibold text-req">
                  Catalog
                </Link>
              }
            />
            {(upcoming.data ?? [])
              .filter((s) => s.status === 'SCHEDULED')
              .slice(0, 4)
              .map((s) => (
                <div key={s.id} className="border-b border-line-2 px-4 py-2.5 last:border-0">
                  <b className="text-[12.5px]">{s.title}</b>
                  <SessionMeta s={s} compact />
                  <small className="text-[11px] text-fine">
                    {sar(s.costSar)} · {s.seatsLeft} seats left
                  </small>
                </div>
              ))}
          </Card>
        </div>
      </div>
    </>
  );
}
