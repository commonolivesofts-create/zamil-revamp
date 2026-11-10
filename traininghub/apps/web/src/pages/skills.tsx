import { useMemo, useState } from 'react';
import { ArrowDownToLine, Check, FileText, RotateCcw, Search, SlidersHorizontal, Target } from 'lucide-react';
import { Link } from 'react-router';
import { REQUIREMENT_LABEL, type PersonSkills } from '@traininghub/shared';
import { catMap, skillMap, useGet, useLookups } from '../lib/data';
import { fmtDateY } from '../lib/format';
import { downloadCsv, printPdf } from '../lib/report-export';
import { CAT_COLORS, levelName } from '../components/domain';
import { ReportPager } from '../components/ReportPager';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  Empty,
  Input,
  Kpi,
  LevelBar,
  PageHeader,
  ReqChip,
  Select,
  Skeleton,
  Table,
} from '../components/ui';

type SkillRow = PersonSkills['rows'][number];
const PAGE_SIZE = 10;
type SkillFilters = { query: string; category: string; status: string };
const EMPTY_FILTERS: SkillFilters = { query: '', category: 'all', status: 'all' };

function skillColumns(
  skills: Map<number, { name: string; categoryId: number }>,
  cats: Map<number, { name: string }>,
) {
  return [
    { label: 'Skill', value: (row: SkillRow) => skills.get(row.skillId)?.name ?? `Skill ${row.skillId}` },
    {
      label: 'Category',
      value: (row: SkillRow) => cats.get(skills.get(row.skillId)?.categoryId ?? 0)?.name ?? '',
    },
    {
      label: 'Requirement',
      value: (row: SkillRow) =>
        row.requirement
          ? `${REQUIREMENT_LABEL[row.requirement]}${row.critical ? ' · Critical' : ''}`
          : 'Not in profile',
    },
    {
      label: 'Target level',
      value: (row: SkillRow) =>
        row.requirement && row.requirement !== 'U' ? levelName(row.targetLevel) : '—',
    },
    { label: 'Current level', value: (row: SkillRow) => levelName(row.currentLevel) },
    {
      label: 'Gap',
      value: (row: SkillRow) =>
        row.requirement && row.requirement !== 'U' && row.currentLevel < row.targetLevel
          ? row.targetLevel - row.currentLevel
          : '—',
    },
    {
      label: 'Last assessed',
      value: (row: SkillRow) =>
        row.assessedAt ? `${fmtDateY(row.assessedAt)} · ${row.source?.toLowerCase() ?? ''}` : 'Not assessed',
    },
  ];
}

function SkillsTable({
  data,
  rows,
  page,
  setPage,
}: {
  data: PersonSkills;
  rows: SkillRow[];
  page: number;
  setPage: (page: number) => void;
}) {
  const L = useLookups();
  const skills = skillMap(L.data);
  const cats = catMap(L.data);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return (
    <>
      {visible.length ? (
        <Table
          className="th-skills__table"
          head={['Skill', 'Requirement', 'Current level', 'Progress', 'Last assessed']}
        >
          {visible.map((r, rowIndex) => {
            const s = skills.get(r.skillId);
            const c = cats.get(s?.categoryId ?? 0);
            const gap = !!r.requirement && r.requirement !== 'U' && r.currentLevel < r.targetLevel;
            return (
              <tr key={r.skillId} style={{ '--th-row-index': rowIndex } as React.CSSProperties}>
                <td>
                  <div className="th-skills__skill">
                    <i className={CAT_COLORS[(c?.colorIndex ?? 1) - 1]} />
                    <div>
                      <b>
                        {r.critical && <span className="th-skills__star">★ </span>}
                        {s?.name ?? `Skill ${r.skillId}`}
                      </b>
                      <small>{c?.name ?? 'Uncategorized'}</small>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="th-skills__requirement">
                    <ReqChip r={r.requirement} level={r.targetLevel} critical={r.critical} />
                    <span>{r.requirement ? REQUIREMENT_LABEL[r.requirement] : 'Not in profile'}</span>
                  </div>
                </td>
                <td>
                  <b className="tabular">{levelName(r.currentLevel)}</b>
                </td>
                <td>
                  <div className="th-skills__progress">
                    <LevelBar current={r.currentLevel} target={r.targetLevel} />
                    {gap ? (
                      <Badge tone={r.critical ? 'bad' : 'warn'}>
                        {r.targetLevel - r.currentLevel} level
                        {r.targetLevel - r.currentLevel === 1 ? '' : 's'} to go
                      </Badge>
                    ) : (
                      <Badge tone="ok">On track</Badge>
                    )}
                  </div>
                </td>
                <td>
                  <span className="th-skills__assessed">
                    {r.assessedAt ? fmtDateY(r.assessedAt) : 'Not assessed'}
                  </span>
                  {r.assessedAt && <small className="th-skills__source">{r.source?.toLowerCase()}</small>}
                </td>
              </tr>
            );
          })}
        </Table>
      ) : (
        <Empty
          icon={<Target className="size-5" />}
          title={data.rows.length ? 'No skills match these filters' : 'No skills in your profile'}
        >
          {data.rows.length
            ? 'Try clearing a filter or changing your search.'
            : 'Your approved position profile will appear here once HR maps your skills.'}
        </Empty>
      )}
      {rows.length > 0 && (
        <ReportPager
          page={page}
          pages={pages}
          total={rows.length}
          pageSize={PAGE_SIZE}
          onPage={setPage}
          label="My skills pages"
        />
      )}
    </>
  );
}

function SkillsLoading() {
  return (
    <div className="th-skills__loading" role="status" aria-live="polite">
      <span className="sr-only">Loading your skills</span>
      <div className="th-skills__loading-kpis">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[86px] rounded-2xl" />
        ))}
      </div>
      <Card className="th-skills__panel">
        <div className="th-skills__loading-toolbar">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-9 w-36" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div className="th-skills__loading-row" key={i}>
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-28" />
          </div>
        ))}
      </Card>
    </div>
  );
}

export default function MySkills() {
  const d = useGet<PersonSkills>(['skills', 'me'], '/skills/me');
  const L = useLookups();
  const skills = skillMap(L.data);
  const cats = catMap(L.data);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<SkillFilters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<SkillFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const gaps = (d.data?.rows ?? []).filter(
    (r) => r.requirement && r.requirement !== 'U' && r.currentLevel < r.targetLevel,
  );
  const filtered = useMemo(
    () =>
      (d.data?.rows ?? [])
        .filter((row) => {
          const skill = skills.get(row.skillId);
          const matchesSearch =
            !filters.query ||
            `${skill?.name ?? ''} ${cats.get(skill?.categoryId ?? 0)?.name ?? ''}`
              .toLowerCase()
              .includes(filters.query.toLowerCase());
          const matchesCategory =
            filters.category === 'all' || String(skill?.categoryId ?? '') === filters.category;
          const isGap = !!row.requirement && row.requirement !== 'U' && row.currentLevel < row.targetLevel;
          const matchesStatus =
            filters.status === 'all' ||
            (filters.status === 'gaps'
              ? isGap
              : filters.status === 'on-track'
                ? !isGap && !!row.requirement
                : !row.requirement);
          return matchesSearch && matchesCategory && matchesStatus;
        })
        .sort(
          (a, b) =>
            (skills.get(a.skillId)?.categoryId ?? 0) - (skills.get(b.skillId)?.categoryId ?? 0) ||
            (skills.get(a.skillId)?.name ?? '').localeCompare(skills.get(b.skillId)?.name ?? ''),
        ),
    [d.data, skills, cats, filters],
  );
  const categories = L.data?.categories ?? [];
  const columns = skillColumns(skills, cats);
  const exportRows = () => filtered;
  const exportCsv = () => downloadCsv(exportRows(), columns, 'my_skills');
  const exportPdf = () => printPdf(exportRows(), columns, 'My Skills Report');
  const activeFilters = Object.values(filters).filter((value) => value && value !== 'all').length;
  const updateDraft = (key: keyof SkillFilters, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    setFilters(draft);
    setPage(1);
    setFiltersOpen(false);
  };
  const resetFilters = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  if (!d.data && d.isPending) return <SkillsLoading />;
  return (
    <div className="th-skills">
      <PageHeader
        animatedTitle
        breadcrumb="Learning & development"
        title="My skills"
        actions={
          <>
            <Button
              className="th-skills__header-action"
              icon={<ArrowDownToLine className="size-3.5" />}
              onClick={exportCsv}
              disabled={!filtered.length}
            >
              CSV
            </Button>
            <Button
              className="th-skills__header-action"
              icon={<FileText className="size-3.5" />}
              onClick={exportPdf}
              disabled={!filtered.length}
            >
              PDF
            </Button>
            <Button
              className="th-skills__header-action"
              aria-expanded={filtersOpen}
              aria-controls="my-skills-filters"
              variant={filtersOpen || activeFilters ? 'soft' : 'default'}
              icon={<SlidersHorizontal className="size-3.5" />}
              onClick={() => {
                setDraft(filters);
                setFiltersOpen((open) => !open);
              }}
            >
              Filter{activeFilters > 0 && <span className="th-skills__filter-count">{activeFilters}</span>}
            </Button>
            <Link to="/catalog" className="th-skills__catalog-link">
              Find training for my gaps <span aria-hidden="true">→</span>
            </Link>
          </>
        }
      />
      {d.error && (
        <Alert tone="bad" className="mb-4">
          {d.error.message}
        </Alert>
      )}
      {d.data && (
        <>
          <div className="th-skills__stats">
            <Kpi
              label="Readiness"
              value={`${d.data.readiness}%`}
              tone={d.data.readiness < 60 ? 'bad' : 'ok'}
              sub="Against your position profile"
            />
            <Kpi
              label="Skills in profile"
              value={d.data.rows.filter((r) => r.requirement).length}
              sub={`${d.data.rows.length} skills assessed or listed`}
            />
            <Kpi
              label="Skill gaps"
              value={gaps.length}
              tone={gaps.length ? 'bad' : 'ok'}
              sub={`${gaps.filter((g) => g.critical).length} critical gaps`}
            />
            <Kpi
              label="Position manager"
              value={<span className="text-[15px]">{d.data.managerName ?? '—'}</span>}
              sub={d.data.person.positionName ?? 'Position not assigned'}
            />
          </div>
          <Card className="th-skills__panel">
            <CardHead
              title="Skill profile"
              sub="Current capability compared with your approved position requirements."
            />
            <div
              id="my-skills-filters"
              className={`th-skills__filter-panel${filtersOpen ? ' is-open' : ''}`}
              aria-hidden={!filtersOpen}
            >
              {filtersOpen && (
                <form className="th-skills__filter-form" onSubmit={applyFilters} aria-label="Filter skills">
                  <label className="th-skills__search">
                    <span>Search skills</span>
                    <span className="th-skills__search-input">
                      <Search aria-hidden="true" />
                      <Input
                        value={draft.query}
                        onChange={(e) => updateDraft('query', e.target.value)}
                        placeholder="Skill or category name"
                      />
                    </span>
                  </label>
                  <label>
                    <span>Category</span>
                    <Select value={draft.category} onChange={(e) => updateDraft('category', e.target.value)}>
                      <option value="all">All categories</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                  <label>
                    <span>Progress</span>
                    <Select value={draft.status} onChange={(e) => updateDraft('status', e.target.value)}>
                      <option value="all">All skills</option>
                      <option value="gaps">Needs development</option>
                      <option value="on-track">On track</option>
                      <option value="not-required">Not in profile</option>
                    </Select>
                  </label>
                  <div className="th-skills__filter-actions">
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
            <SkillsTable data={d.data} rows={filtered} page={page} setPage={setPage} />
          </Card>
          <Card className="th-skills__history">
            <CardHead title="Assessment history" sub="Recent changes to your skill levels." />
            {d.data.history.map((h, i) => (
              <div key={i} className="th-skills__history-row">
                <span className="th-skills__history-mark">↗</span>
                <b>{skills.get(h.skillId)?.name ?? `Skill ${h.skillId}`}</b>
                <span className="th-skills__history-level">
                  L{h.fromLevel} <i>→</i> L{h.toLevel}
                </span>
                <Badge tone={h.source === 'TRAINING' ? 'ok' : 'info'}>{h.source.toLowerCase()}</Badge>
                <span className="th-skills__history-date">
                  {fmtDateY(h.changedAt)} · {h.byName}
                </span>
              </div>
            ))}
            {!d.data.history.length && <Empty title="No assessment history yet" />}
          </Card>
        </>
      )}
    </div>
  );
}
