import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Session, TrainingRequest } from '@traininghub/shared';
import { cn } from '../lib/cn';
import { catMap, skillMap, useGet, useLookups } from '../lib/data';
import { todayIso } from '../lib/format';
import { CAT_COLORS } from '../components/domain';
import { Button, Card, PageHeader } from '../components/ui';

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function Calendar() {
  const t = todayIso();
  const [month, setMonth] = useState(() => new Date(`${t.slice(0, 7)}-01T00:00:00Z`));
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
  const shift = (n: number) => {
    const d = new Date(month);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d);
  };
  const ym = iso(month).slice(0, 7);
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Calendar"
        sub="Scheduled sessions. Yours are outlined."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => shift(-1)} aria-label="Previous month">
              <ChevronLeft className="size-4" />
            </Button>
            <b className="w-36 text-center text-[13px]">
              {month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
            </b>
            <Button size="sm" onClick={() => shift(1)} aria-label="Next month">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        }
      />
      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line bg-surface-2 text-center text-[10.5px] font-bold uppercase tracking-wider text-fine">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const list = (sessions.data ?? []).filter(
              (s) => s.startDate <= d && s.endDate >= d && s.status === 'SCHEDULED',
            );
            return (
              <div
                key={d}
                className={cn(
                  'min-h-28 border-b border-r border-line-2 p-1.5',
                  d.slice(0, 7) !== ym && 'bg-surface-2/60 text-fine',
                )}
              >
                <div
                  className={cn(
                    'mb-1 inline-grid size-6 place-items-center rounded-full text-[11px] font-semibold',
                    d === t && 'bg-brand text-white',
                  )}
                >
                  {Number(d.slice(8))}
                </div>
                <div className="space-y-1">
                  {list.map((s) => {
                    const c = cats.get(skills.get(s.skillId)?.categoryId ?? 0);
                    return (
                      <Link
                        key={s.id}
                        to={`/catalog?session=${s.id}`}
                        title={`${s.title} · ${s.startTime}–${s.endTime}`}
                        className={cn(
                          'flex items-center gap-1 truncate rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-semibold hover:bg-hover',
                          myIds.has(s.id) && 'ring-1 ring-req',
                        )}
                      >
                        <i
                          className={cn(
                            'size-1.5 shrink-0 rounded-full',
                            CAT_COLORS[(c?.colorIndex ?? 1) - 1],
                          )}
                        />
                        <span className="truncate">
                          {s.startTime} {s.title}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
