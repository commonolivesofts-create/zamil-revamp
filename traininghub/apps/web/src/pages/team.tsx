import { Save, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { PersonSkills } from '@traininghub/shared';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { skillMap, useAction, useGet, useLookups } from '../lib/data';
import { fmtDateY } from '../lib/format';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHead,
  Empty,
  Input,
  Meter,
  PageHeader,
  ReqChip,
  Spinner,
} from '../components/ui';

interface TeamRow {
  personId: number;
  fullName: string;
  positionName: string | null;
  managerName: string | null;
  readiness: number;
  gaps: { skillId: number; current: number; target: number; critical: boolean }[];
  lastAssessed: string | null;
}

export default function Team() {
  const team = useGet<TeamRow[]>(['team'], '/team');
  const [sel, setSel] = useState<number | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!sel && team.data?.length) setSel(team.data[0]!.personId);
  }, [team.data, sel]);
  if (!team.data) return <Spinner />;
  const list = team.data.filter((p) => !q || p.fullName.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader
        eyebrow="Manage"
        title="Team skills"
        sub="Rate each person against their position profile. Saved ratings drive gap analysis, eligibility and readiness reports."
      />
      {!team.data.length ? (
        <Card>
          <Empty icon={<Users className="size-5" />} title="No team members">
            People who report to you (two levels) appear here.
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Card className="h-fit">
            <div className="border-b border-line-2 p-3">
              <Input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="max-h-[70dvh] overflow-y-auto scroll-thin">
              {list.map((p) => (
                <button
                  key={p.personId}
                  onClick={() => setSel(p.personId)}
                  className={cn(
                    'block w-full border-b border-line-2 px-3 py-2.5 text-left last:border-0',
                    sel === p.personId ? 'bg-accent-soft' : 'hover:bg-hover',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Avatar name={p.fullName} id={p.personId} size="xs" />
                    <b className="flex-1 truncate text-[12.5px]">{p.fullName}</b>
                    <span
                      className={cn(
                        'text-[11px] font-bold tabular',
                        p.readiness < 60 ? 'text-bad' : 'text-req',
                      )}
                    >
                      {p.readiness}%
                    </span>
                  </div>
                  <div className="mt-0.5 pl-8 text-[10.5px] text-muted">
                    {p.positionName ?? 'No position'} · {p.gaps.length} gaps
                  </div>
                  <Meter value={p.readiness} className="ml-8 mt-1.5" />
                </button>
              ))}
            </div>
          </Card>
          {sel && <Assess personId={sel} row={team.data.find((t) => t.personId === sel)!} />}
        </div>
      )}
    </>
  );
}

function Assess({ personId, row }: { personId: number; row: TeamRow }) {
  const d = useGet<PersonSkills>(['skills', personId], `/skills/person/${personId}`);
  const L = useLookups();
  const skills = skillMap(L.data);
  const [draft, setDraft] = useState<Record<number, number>>({});
  useEffect(() => setDraft({}), [personId]);
  const save = useAction(() => api.post<{ changed: number }>('/skills/assess', { personId, levels: draft }), {
    success: (r) => `Saved ${r.changed} rating${r.changed === 1 ? '' : 's'}`,
    invalidate: [['skills', personId], ['team']],
    onSuccess: () => setDraft({}),
  });
  if (!d.data) return <Spinner />;
  const rows = d.data.rows
    .filter((r) => r.requirement === 'R' || r.requirement === 'O')
    .sort(
      (a, b) =>
        Number(b.critical) - Number(a.critical) ||
        (skills.get(a.skillId)?.name ?? '').localeCompare(skills.get(b.skillId)?.name ?? ''),
    );
  const changed = Object.entries(draft).filter(
    ([k, v]) => d.data!.rows.find((r) => r.skillId === Number(k))?.currentLevel !== v,
  ).length;
  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <Avatar name={row.fullName} id={personId} size="lg" />
        <div className="min-w-48 flex-1">
          <h2 className="text-[17px] font-bold">{row.fullName}</h2>
          <div className="text-[12px] text-muted">
            {row.positionName ?? 'No position'} · reports to {row.managerName ?? '—'} · last assessed{' '}
            {fmtDateY(row.lastAssessed)}
          </div>
        </div>
        <Badge tone={changed ? 'warn' : 'ok'} dot>
          {changed ? `${changed} unsaved` : 'Saved'}
        </Badge>
        <Link to={`/new`}>
          <Button icon={<UserPlus className="size-4" />}>Nominate</Button>
        </Link>
        <Button
          variant="primary"
          disabled={!changed}
          loading={save.isPending}
          onClick={() => save.mutate(undefined)}
          icon={<Save className="size-4" />}
        >
          Save ratings
        </Button>
      </Card>
      <Card>
        <CardHead
          title={`Assessment · ${rows.length} skills`}
          sub="0 none · 1 basic · 2 intermediate · 3 advanced · 4 expert"
        />
        {rows.map((r) => {
          const cur = draft[r.skillId] ?? r.currentLevel;
          return (
            <div
              key={r.skillId}
              className="flex flex-wrap items-center gap-3 border-b border-line-2 px-4 py-2.5 last:border-0"
            >
              <div className="min-w-52 flex-1">
                <b className="text-[12.5px]">
                  {r.critical && '★ '}
                  {skills.get(r.skillId)?.name}
                </b>
                <div className="text-[10.5px] text-muted">
                  Target <ReqChip r={r.requirement} level={r.targetLevel} />
                </div>
              </div>
              <div
                className="inline-flex overflow-hidden rounded-lg border border-line"
                role="radiogroup"
                aria-label={skills.get(r.skillId)?.name}
              >
                {[0, 1, 2, 3, 4].map((l) => (
                  <button
                    key={l}
                    role="radio"
                    aria-checked={l === cur}
                    onClick={() => setDraft({ ...draft, [r.skillId]: l })}
                    className={cn(
                      'h-7 w-8 border-r border-line text-[12px] font-bold last:border-0',
                      l === cur
                        ? cur >= r.targetLevel
                          ? 'bg-req text-white'
                          : cur === r.targetLevel - 1
                            ? 'bg-opt text-white'
                            : 'bg-bad text-white'
                        : 'hover:bg-hover',
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <span className="w-20 text-right">
                {cur < r.targetLevel ? (
                  <Badge tone="bad">gap {r.targetLevel - cur}</Badge>
                ) : (
                  <Badge tone="ok">met</Badge>
                )}
              </span>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
