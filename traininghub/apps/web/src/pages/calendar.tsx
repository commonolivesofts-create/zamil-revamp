import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Session, TrainingRequest } from '@traininghub/shared';
import { cn } from '../lib/cn';
import { catMap, skillMap, useGet, useLookups } from '../lib/data';
import { todayIso } from '../lib/format';
import { CAT_COLORS } from '../components/domain';
import { Button, Card, Empty, PageHeader, Skeleton } from '../components/ui';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Calendar() {
  const today = todayIso();
  const [month, setMonth] = useState(() => new Date(`${today.slice(0, 7)}-01T00:00:00Z`));
  const first = new Date(month);
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return iso(d);
  });
  const sessions = useGet<Session[]>(
    ['sessions', 'cal', days[0], days[41]],
    `/sessions?from=${days[0]}&to=${days[41]}`,
    { staleTime: 30_000 },
  );
  const mine = useGet<TrainingRequest[]>(['requests', 'mine'], '/requests?scope=mine');
  const L = useLookups();
  const skills = skillMap(L.data);
  const cats = catMap(L.data);
  const myIds = new Set(
    (mine.data ?? [])
      .filter((r) => ['APPROVED', 'PENDING', 'WAITLISTED', 'ATTENDED', 'COMPLETED'].includes(r.status))
      .map((r) => r.sessionId),
  );
  const ym = iso(month).slice(0, 7);
  const monthDays = days.filter((d) => d.slice(0, 7) === ym);
  const monthStart = monthDays[0]!;
  const monthEnd = monthDays[monthDays.length - 1]!;
  const daySessions = (d: string) =>
    (sessions.data ?? []).filter((s) => s.startDate <= d && s.endDate >= d && s.status === 'SCHEDULED');
  const monthSessions = (sessions.data ?? []).filter(
    (s) => s.status === 'SCHEDULED' && s.startDate <= monthEnd && s.endDate >= monthStart,
  );
  const agendaDays = monthDays.filter((d) => daySessions(d).length > 0);
  const shift = (n: number) => {
    const d = new Date(month);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d);
  };
  const monthTitle = month.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <div className="th-calendar" aria-busy={sessions.isPending || undefined}>
      <section className="th-calendar__intro">
        <div className="th-calendar__intro-copy">
          <PageHeader animatedTitle breadcrumb="Learning & development" title="Training calendar" />
        </div>
        <div className="th-calendar__controls">
          <Button size="sm" onClick={() => setMonth(new Date(`${today.slice(0, 7)}-01T00:00:00Z`))}>
            Today
          </Button>
          <div className="th-calendar__month-nav">
            <Button size="sm" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeft className="size-4" />
            </Button>
            <b>{monthTitle}</b>
            <Button size="sm" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </section>

      <div className="th-calendar__summary">
        <div className="th-calendar__legend">
          <span>
            <i aria-hidden="true" /> Scheduled sessions
          </span>
          <span>
            <i className="is-mine" aria-hidden="true" /> Your requests
          </span>
        </div>
        <b>
          {sessions.isPending
            ? 'Loading sessions...'
            : `${monthSessions.length} ${monthSessions.length === 1 ? 'session' : 'sessions'} this month`}
        </b>
      </div>

      <Card className="th-calendar__frame">
        <div className="th-calendar__desktop">
          <div className="th-calendar__weekdays">
            {WEEKDAYS.map((day) => (
              <div key={day}>{day}</div>
            ))}
          </div>
          <div className="th-calendar__days">
            {days.map((day, index) => {
              const list = daySessions(day);
              const outside = day.slice(0, 7) !== ym;
              return (
                <div
                  key={day}
                  className={cn('th-calendar__day', outside && 'is-outside', day === today && 'is-today')}
                >
                  <div className="th-calendar__date">
                    <span>{Number(day.slice(8))}</span>
                  </div>
                  <div className="th-calendar__events">
                    {sessions.isPending
                      ? index % 5 === 0 && <Skeleton className="h-5 w-full rounded-md" />
                      : list.map((session) => {
                          const category = cats.get(skills.get(session.skillId)?.categoryId ?? 0);
                          return (
                            <Link
                              key={session.id}
                              to={`/catalog?session=${session.id}`}
                              title={`${session.title} - ${session.startTime} to ${session.endTime}`}
                              className={cn('th-calendar__event', myIds.has(session.id) && 'is-mine')}
                            >
                              <i className={CAT_COLORS[(category?.colorIndex ?? 1) - 1]} />
                              <span>
                                {session.startTime} {session.title}
                              </span>
                            </Link>
                          );
                        })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="th-calendar__agenda">
          {sessions.isPending ? (
            <div className="grid gap-3 p-4" aria-hidden="true">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : agendaDays.length ? (
            agendaDays.map((day) => (
              <section className="th-calendar__agenda-day" key={day}>
                <div className={cn('th-calendar__agenda-date', day === today && 'is-today')}>
                  <b>{Number(day.slice(8))}</b>
                  <span>
                    {new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
                      weekday: 'short',
                      month: 'short',
                    })}
                  </span>
                </div>
                <div className="th-calendar__agenda-events">
                  {daySessions(day).map((session) => (
                    <Link
                      className={cn('th-calendar__agenda-event', myIds.has(session.id) && 'is-mine')}
                      key={session.id}
                      to={`/catalog?session=${session.id}`}
                    >
                      <b>{session.title}</b>
                      <span>
                        {session.startTime} · {session.location} · {session.trainerName ?? session.provider}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            ))
          ) : (
            <Empty icon={<CalendarDays className="size-5" />} title="No sessions this month">
              Try another month to see upcoming training.
            </Empty>
          )}
        </div>
      </Card>
    </div>
  );
}
