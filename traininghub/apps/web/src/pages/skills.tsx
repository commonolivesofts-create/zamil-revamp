import { Target } from 'lucide-react';
import { Link } from 'react-router';
import { REQUIREMENT_LABEL, type PersonSkills } from '@traininghub/shared';
import { catMap, skillMap, useGet, useLookups } from '../lib/data';
import { fmtDateY } from '../lib/format';
import { CAT_COLORS, levelName } from '../components/domain';
import { Badge, Card, CardHead, Empty, Kpi, LevelBar, PageHeader, ReqChip, Spinner, Table } from '../components/ui';

export function SkillsView({ data, actions }: { data: PersonSkills; actions?: (skillId: number) => React.ReactNode }) {
  const L = useLookups();
  const skills = skillMap(L.data);
  const cats = catMap(L.data);
  const rows = [...data.rows].sort((a, b) => (skills.get(a.skillId)?.categoryId ?? 0) - (skills.get(b.skillId)?.categoryId ?? 0) || (skills.get(a.skillId)?.name ?? '').localeCompare(skills.get(b.skillId)?.name ?? ''));
  return (
    <Table head={['Skill', 'Requirement', 'Current', '', 'Last assessed', ...(actions ? [''] : [])]}>
      {rows.map((r) => {
        const s = skills.get(r.skillId);
        const c = cats.get(s?.categoryId ?? 0);
        const gap = r.requirement && r.requirement !== 'U' && r.currentLevel < r.targetLevel;
        return (
          <tr key={r.skillId}>
            <td>
              <div className="flex items-center gap-2"><i className={`size-2 rounded-full ${CAT_COLORS[(c?.colorIndex ?? 1) - 1]}`} /><b>{r.critical && '★ '}{s?.name}</b></div>
              <div className="pl-4 text-[10.5px] text-muted">{c?.name}</div>
            </td>
            <td><ReqChip r={r.requirement} level={r.targetLevel} critical={r.critical} /> <span className="text-[10.5px] text-muted">{r.requirement ? REQUIREMENT_LABEL[r.requirement] : 'Not in profile'}</span></td>
            <td className="whitespace-nowrap"><b className="tabular">{levelName(r.currentLevel)}</b></td>
            <td><LevelBar current={r.currentLevel} target={r.targetLevel} /> {gap && <Badge tone={r.critical ? 'bad' : 'warn'}>gap {r.targetLevel - r.currentLevel}</Badge>}</td>
            <td className="text-[11px] text-muted">{r.assessedAt ? `${fmtDateY(r.assessedAt)} · ${r.source?.toLowerCase()}` : '—'}</td>
            {actions && <td>{actions(r.skillId)}</td>}
          </tr>
        );
      })}
    </Table>
  );
}

export default function MySkills() {
  const d = useGet<PersonSkills>(['skills', 'me'], '/skills/me');
  const L = useLookups();
  const skills = skillMap(L.data);
  if (!d.data) return <Spinner />;
  const gaps = d.data.rows.filter((r) => r.requirement && r.requirement !== 'U' && r.currentLevel < r.targetLevel);
  return (
    <>
      <PageHeader eyebrow="My learning" title="My skills" sub={d.data.person.positionName ? `Assessed against the approved ${d.data.person.positionName} profile. Your manager updates levels; passing a session raises them.` : 'You are not mapped to a position yet — ask HR.'} actions={<Link to="/catalog" className="inline-flex h-9 items-center rounded-[10px] bg-brand px-3.5 text-[12.5px] font-semibold text-white">Find training for my gaps</Link>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Readiness" value={`${d.data.readiness}%`} tone={d.data.readiness < 60 ? 'bad' : 'ok'} />
        <Kpi label="Skills in profile" value={d.data.rows.filter((r) => r.requirement).length} />
        <Kpi label="Gaps" value={gaps.length} sub={`${gaps.filter((g) => g.critical).length} critical`} />
        <Kpi label="Manager" value={<span className="text-[15px]">{d.data.managerName ?? '—'}</span>} />
      </div>
      <Card className="mb-4">
        <CardHead title="Skill profile" sub="R Required · O Optional · U Understand · ★ critical" />
        {d.data.rows.length ? <SkillsView data={d.data} /> : <Empty icon={<Target className="size-5" />} title="No skills yet" />}
      </Card>
      <Card>
        <CardHead title="History" />
        {d.data.history.map((h, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line-2 px-4 py-2.5 text-[12px] last:border-0">
            <b className="flex-1">{skills.get(h.skillId)?.name}</b>
            <span className="tabular">L{h.fromLevel} → L{h.toLevel}</span>
            <Badge tone={h.source === 'TRAINING' ? 'ok' : 'info'}>{h.source.toLowerCase()}</Badge>
            <span className="w-40 text-right text-[11px] text-muted">{fmtDateY(h.changedAt)} · {h.byName}</span>
          </div>
        ))}
        {!d.data.history.length && <Empty title="No changes yet" />}
      </Card>
    </>
  );
}
