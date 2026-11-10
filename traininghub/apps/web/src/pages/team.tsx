import { Save, Search, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { REQUIREMENT_LABEL, type PersonSkills } from '@traininghub/shared';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { skillMap, useAction, useGet, useLookups } from '../lib/data';
import { fmtDateY } from '../lib/format';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Meter,
  PageHeader,
  ReqChip,
  Skeleton,
  Table,
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

const LEVEL_NAMES = ['None', 'Basic', 'Intermediate', 'Advanced', 'Expert'];

export default function Team() {
  const team = useGet<TeamRow[]>(['team'], '/team');
  const [sel, setSel] = useState<number | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!sel && team.data?.length) setSel(team.data[0]!.personId);
  }, [team.data, sel]);

  if (!team.data && team.isPending) return <TeamLoading />;

  return (
    <div className="th-team">
      <PageHeader animatedTitle breadcrumb="Manage" title="Team skills" />
      {team.error && <Alert tone="bad">{team.error.message}</Alert>}
      {team.data && team.data.length === 0 ? (
        <Card className="th-team__empty">
          <Empty icon={<Users className="size-5" />} title="No team members">
            People who report to you (two levels) appear here.
          </Empty>
        </Card>
      ) : team.data ? (
        <div className="th-team__workspace">
          <aside className="th-team__roster" aria-label="Team members">
            <div className="th-team__roster-head">
              <div>
                <h2>
                  My team <span>{team.data.length}</span>
                </h2>
                <p>Select a person to review their skills.</p>
              </div>
            </div>
            <label className="th-team__search">
              <Search aria-hidden="true" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search team members"
                aria-label="Search team members"
              />
            </label>
            <div className="th-team__members">
              {team.data
                .filter((p) => !q || p.fullName.toLowerCase().includes(q.toLowerCase()))
                .map((p) => (
                  <button
                    key={p.personId}
                    type="button"
                    aria-pressed={sel === p.personId}
                    onClick={() => setSel(p.personId)}
                    className={cn('th-team__member', sel === p.personId && 'is-selected')}
                  >
                    <Avatar name={p.fullName} id={p.personId} size="sm" />
                    <span className="th-team__member-info">
                      <span className="th-team__member-name">{p.fullName}</span>
                      <span className="th-team__member-position">
                        {p.positionName ?? 'No position assigned'}
                      </span>
                      <span className="th-team__member-foot">
                        <span>{p.gaps.length} skill gaps</span>
                        <b className={p.readiness < 60 ? 'is-low' : ''}>{p.readiness}%</b>
                      </span>
                      <Meter value={p.readiness} />
                    </span>
                  </button>
                ))}
              {!team.data.some((p) => !q || p.fullName.toLowerCase().includes(q.toLowerCase())) && (
                <p className="th-team__no-match">No team members match that search.</p>
              )}
            </div>
          </aside>
          {sel && team.data.find((t) => t.personId === sel) ? (
            <Assess personId={sel} row={team.data.find((t) => t.personId === sel)!} />
          ) : (
            <section className="th-team__select-prompt">
              <Users aria-hidden="true" />
              <b>Select a team member</b>
              <span>Choose someone from your team to review their position skills.</span>
            </section>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TeamLoading() {
  return (
    <div className="th-team">
      <PageHeader animatedTitle breadcrumb="Manage" title="Team skills" />
      <div className="th-team__workspace th-team__workspace--loading" aria-label="Loading team skills">
        <div className="th-team__loading-roster">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 5 }, (_, i) => (
            <div className="th-team__loading-person" key={i}>
              <Skeleton className="size-8 rounded-full" />
              <span>
                <Skeleton className="h-3 w-32" />
                <Skeleton className="mt-2 h-2.5 w-20" />
              </span>
            </div>
          ))}
        </div>
        <div className="th-team__loading-detail">
          <Skeleton className="h-12 w-12 rounded-full" />
          <span>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="mt-2 h-3 w-72" />
          </span>
          <Skeleton className="h-9 w-28" />
          <div className="th-team__loading-table">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton className="h-12 w-full" key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
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

  if (!d.data && d.isPending) return <AssessmentLoading />;
  if (!d.data) return <Alert tone="bad">{d.error?.message ?? 'Unable to load this person’s skills.'}</Alert>;

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
  const gaps = rows.filter((r) => (draft[r.skillId] ?? r.currentLevel) < r.targetLevel).length;

  return (
    <section className="th-team__detail" aria-label={`Skills assessment for ${row.fullName}`}>
      <header className="th-team__person-head">
        <Avatar name={row.fullName} id={personId} size="lg" />
        <div className="th-team__person-copy">
          <h2>{row.fullName}</h2>
          <p>
            {row.positionName ?? 'No position assigned'}
            <i />
            Reports to {row.managerName ?? '—'}
          </p>
          <div className="th-team__metrics">
            <span>
              Readiness <b>{row.readiness}%</b>
            </span>
            <span>{gaps} current gaps</span>
            <span>Assessed {fmtDateY(row.lastAssessed) || 'not yet'}</span>
          </div>
        </div>
        <div className="th-team__person-actions">
          <Badge tone={changed ? 'warn' : 'ok'} dot>
            {changed ? `${changed} unsaved` : 'Saved'}
          </Badge>
          <Link to="/new" className="th-team__nominate">
            <UserPlus aria-hidden="true" />
            Nominate
          </Link>
          <Button
            className="th-team__save"
            variant="primary"
            disabled={!changed}
            loading={save.isPending}
            onClick={() => save.mutate(undefined)}
            icon={<Save className="size-3.5" />}
          >
            Save ratings
          </Button>
        </div>
      </header>

      <div className="th-team__assessment-head">
        <div>
          <h3>
            Position skills <span>{rows.length}</span>
          </h3>
          <p>Rate each skill at the person’s current level.</p>
        </div>
        <div className="th-team__scale" aria-label="Skill levels">
          {LEVEL_NAMES.map((name, i) => (
            <span key={name}>
              <b>{i}</b>
              {name}
            </span>
          ))}
        </div>
      </div>
      {rows.length ? (
        <Table
          className="th-team__table"
          head={['Skill', 'Position target', 'Current level', 'Gap']}
          pageSize={10}
          pagerLabel="Team skills pages"
        >
          {rows.map((r, rowIndex) => {
            const cur = draft[r.skillId] ?? r.currentLevel;
            const gap = Math.max(0, r.targetLevel - cur);
            const name = skills.get(r.skillId)?.name ?? `Skill ${r.skillId}`;
            return (
              <tr key={r.skillId} style={{ '--th-row-index': rowIndex } as React.CSSProperties}>
                <td>
                  <div className="th-team__skill-name">
                    <b>
                      {r.critical && <span aria-label="Critical skill">★ </span>}
                      {name}
                    </b>
                    {r.critical && <Badge tone="bad">Critical</Badge>}
                  </div>
                </td>
                <td>
                  <div className="th-team__target">
                    <ReqChip r={r.requirement} level={r.targetLevel} critical={r.critical} />
                    <small>{r.requirement ? REQUIREMENT_LABEL[r.requirement] : 'Not in profile'}</small>
                  </div>
                </td>
                <td>
                  <div className="th-team__rating" role="radiogroup" aria-label={`Current level for ${name}`}>
                    {LEVEL_NAMES.map((label, level) => (
                      <button
                        key={level}
                        type="button"
                        role="radio"
                        aria-checked={level === cur}
                        aria-label={`${name}: ${label}`}
                        onClick={() => setDraft((current) => ({ ...current, [r.skillId]: level }))}
                        className={cn(
                          level === cur && 'is-selected',
                          level === cur &&
                            (cur >= r.targetLevel
                              ? 'is-met'
                              : cur === r.targetLevel - 1
                                ? 'is-near'
                                : 'is-gap'),
                        )}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                  <small className="th-team__rating-label">{LEVEL_NAMES[cur] ?? `Level ${cur}`}</small>
                </td>
                <td>
                  {gap ? (
                    <Badge tone={r.critical ? 'bad' : 'warn'}>
                      {gap} level{gap === 1 ? '' : 's'} below
                    </Badge>
                  ) : (
                    <Badge tone="ok">Met</Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <Empty icon={<Users className="size-5" />} title="No position skills to assess">
          This person’s approved position profile does not have required or optional skills yet.
        </Empty>
      )}
    </section>
  );
}

function AssessmentLoading() {
  return (
    <section className="th-team__detail th-team__assessment-loading" aria-label="Loading skills assessment">
      <div>
        <Skeleton className="size-12 rounded-full" />
        <span>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-2 h-3 w-64" />
        </span>
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </section>
  );
}
