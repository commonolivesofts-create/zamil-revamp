// Job Skills Matrix: position profiles (add / update / replace / remove / copy skills), HR approval,
// the position × skill matrix, gap analysis, the skills library and Fusion job mapping.
import { Check, Copy, Download, Pencil, Plus, Replace, Search, Send, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { REQUIREMENT_LABEL, type Position, type PositionDetail, type PositionSkill, type Requirement } from '@traininghub/shared';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { catMap, hasRole, skillMap, useAction, useGet, useLookups, useMe, type Lookups } from '../lib/data';
import { fmtDateY } from '../lib/format';
import { CAT_COLORS, PersonPicker } from '../components/domain';
import { Alert, Avatar, Badge, Button, Card, CardHead, Empty, Field, Input, Meter, Modal, PageHeader, ReqChip, Select, Spinner, Table, Tabs, Textarea, Toggle } from '../components/ui';

const STATUS: Record<string, ['ok' | 'warn' | 'info' | 'bad' | 'neutral', string]> = {
  APPROVED: ['ok', 'Approved'],
  DRAFT: ['neutral', 'Draft'],
  PENDING: ['info', 'Pending HR'],
  RETURNED: ['bad', 'Returned'],
};
type Tab = 'profiles' | 'matrix' | 'gaps' | 'library' | 'jobs';

export default function Jsm() {
  const me = useMe().data!;
  const hr = hasRole(me, 'HR_ADMIN');
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('profiles');
  const positions = useGet<Position[]>(['positions'], '/positions');
  const owned = positions.data?.filter((p) => hr || p.ownerPersonId === me.personId) ?? [];
  const sel =
    Number(params.get('position')) ||
    (hr && positions.data?.find((p) => p.status === 'PENDING')?.id) ||
    owned.find((p) => p.id === me.positionId)?.id ||
    owned.find((p) => p.headcount > 0)?.id ||
    positions.data?.[0]?.id ||
    null;
  const select = (id: number) => setParams({ position: String(id) }, { replace: true });
  // Pin the default choice in the URL so the selection does not jump when statuses change.
  useEffect(() => {
    if (sel && !params.get('position')) setParams({ position: String(sel) }, { replace: true });
  }, [sel, params, setParams]);
  const pending = positions.data?.filter((p) => p.status === 'PENDING').length ?? 0;
  return (
    <>
      <PageHeader eyebrow="Manage" title="Job Skills Matrix" sub="Each position lists only the skills it needs: add, change, replace or remove them. Changes become effective for employees when HR approves the new version." />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'profiles', label: 'Position profiles', count: hr ? pending : 0 },
        { value: 'matrix', label: 'Matrix' },
        { value: 'gaps', label: 'Gap analysis' },
        ...(hr ? [{ value: 'library' as const, label: 'Skills library' }, { value: 'jobs' as const, label: 'Fusion job mapping' }] : []),
      ]} />
      {tab === 'profiles' && (positions.data ? <Profiles positions={positions.data} sel={sel} onSelect={select} /> : <Spinner />)}
      {tab === 'matrix' && <Matrix onOpen={(id) => { select(id); setTab('profiles'); }} />}
      {tab === 'gaps' && positions.data && <Gaps positions={positions.data} />}
      {tab === 'library' && <Library />}
      {tab === 'jobs' && positions.data && <Jobs positions={positions.data} />}
    </>
  );
}

/* ------------------------------ Profiles ------------------------------ */

function Profiles({ positions, sel, onSelect }: { positions: Position[]; sel: number | null; onSelect: (id: number) => void }) {
  const me = useMe().data!;
  const [q, setQ] = useState('');
  const [create, setCreate] = useState(false);
  const list = positions.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="grid gap-4 lg:grid-cols-[290px_1fr]">
      <Card className="h-fit">
        <div className="flex gap-2 border-b border-line-2 p-3">
          <div className="relative flex-1"><Search className="absolute left-2.5 top-2.5 size-3.5 text-fine" /><Input className="pl-8" placeholder="Find position…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {hasRole(me, 'HR_ADMIN') && <Button onClick={() => setCreate(true)} aria-label="New position"><Plus className="size-4" /></Button>}
        </div>
        <div className="max-h-[70dvh] overflow-y-auto scroll-thin">
          {list.map((p) => {
            const [tone, label] = STATUS[p.status]!;
            const total = p.counts.R + p.counts.O + p.counts.U;
            return (
              <button key={p.id} onClick={() => onSelect(p.id)} className={cn('block w-full border-b border-line-2 px-3 py-2.5 text-left last:border-0', sel === p.id ? 'bg-accent-soft' : 'hover:bg-hover')}>
                <div className="flex items-center gap-2"><b className="flex-1 truncate text-[12.5px]">{p.name}</b><Badge tone={tone}>{label}</Badge></div>
                <div className="mt-0.5 text-[10.5px] text-muted">{p.grade || '—'} · {p.headcount} people · v{p.versionNo}{p.draftChanged ? ' · changes' : ''}</div>
                <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-na-bg">
                  {total > 0 && (['R', 'O', 'U'] as const).map((r) => <i key={r} className={cn(r === 'R' ? 'bg-req' : r === 'O' ? 'bg-opt' : 'bg-und')} style={{ width: `${(p.counts[r] / total) * 100}%` }} />)}
                </div>
              </button>
            );
          })}
        </div>
      </Card>
      {sel ? <Editor id={sel} positions={positions} /> : <Card><Empty title="No positions" /></Card>}
      {create && <PositionModal onClose={() => setCreate(false)} onSaved={(id) => onSelect(id)} />}
    </div>
  );
}

function Editor({ id, positions }: { id: number; positions: Position[] }) {
  const me = useMe().data!;
  const hr = hasRole(me, 'HR_ADMIN');
  const L = useLookups();
  const skills = skillMap(L.data);
  const cats = catMap(L.data);
  const d = useGet<PositionDetail>(['position', id], `/positions/${id}`);
  const [modal, setModal] = useState<null | 'add' | 'edit' | 'copy' | 'return' | 'delete' | { replace: number }>(null);
  const [q, setQ] = useState('');
  const inv = [['position', id], ['positions'], ['matrix'], ['lookups']];
  const mut = <V,>(fn: (v: V) => Promise<unknown>, success?: string) => useAction(fn, { success, invalidate: inv });
  const update = mut((s: PositionSkill) => api.put(`/positions/${id}/skills/${s.skillId}`, s));
  const remove = mut((skillId: number) => api.del(`/positions/${id}/skills/${skillId}`), 'Skill removed from the profile');
  const submit = mut(() => api.post(`/positions/${id}/submit`), 'Profile submitted');
  const approve = mut(() => api.post(`/positions/${id}/decision`, { action: 'approve' }), 'Profile approved — new version is live');
  if (!d.data) return <Spinner />;
  const p = d.data;
  const canEdit = hr || p.ownerPersonId === me.personId;
  const approved = new Map(p.approvedSkills.map((s) => [s.skillId, s]));
  const rows = p.skills
    .filter((s) => !q || skills.get(s.skillId)?.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (cats.get(skills.get(a.skillId)?.categoryId ?? 0)?.sortOrder ?? 0) - (cats.get(skills.get(b.skillId)?.categoryId ?? 0)?.sortOrder ?? 0) || (skills.get(a.skillId)?.name ?? '').localeCompare(skills.get(b.skillId)?.name ?? ''));
  const removed = p.approvedSkills.filter((a) => !p.skills.some((s) => s.skillId === a.skillId));
  const [tone, label] = STATUS[p.status]!;
  return (
    <div className="min-w-0 space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-56 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-[18px] font-bold">{p.name}</h2><Badge tone={tone} dot>{label}</Badge>{p.versionNo > 0 && <Badge>v{p.versionNo} approved {fmtDateY(p.approvedAt)}</Badge>}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-muted">
              <span>{p.grade || 'No grade'}</span><span>{p.department || '—'}</span><span>{p.headcount} employees</span><span>Owner: {p.ownerName ?? '—'}</span>
              {p.jobNames.length > 0 && <span>Fusion jobs: {p.jobNames.join(', ')}</span>}
            </div>
            <div className="mt-2 flex gap-1.5"><ReqChip r="R" /> <span className="text-[11.5px]">{p.counts.R}</span> <ReqChip r="O" /> <span className="text-[11.5px]">{p.counts.O}</span> <ReqChip r="U" /> <span className="text-[11.5px]">{p.counts.U}</span> <span className="text-[11.5px] text-muted">· ★ {p.counts.critical} critical</span></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && <Button onClick={() => setModal('edit')} icon={<Pencil className="size-3.5" />}>Details</Button>}
            {canEdit && <Button onClick={() => setModal('copy')} icon={<Copy className="size-3.5" />}>Copy from…</Button>}
            {canEdit && p.status !== 'PENDING' && (p.draftChanged || p.versionNo === 0 || p.status !== 'APPROVED') && (
              <Button variant="primary" loading={submit.isPending} disabled={p.validation.length > 0} onClick={() => submit.mutate(undefined)} icon={<Send className="size-3.5" />}>
                {me.roles.includes('HR_ADMIN') ? 'Approve version' : 'Submit for HR approval'}
              </Button>
            )}
            {hr && p.status === 'PENDING' && <Button variant="primary" loading={approve.isPending} onClick={() => approve.mutate(undefined)} icon={<Check className="size-3.5" />}>Approve</Button>}
            {hr && p.status === 'PENDING' && <Button onClick={() => setModal('return')} icon={<Undo2 className="size-3.5" />}>Return</Button>}
            {hr && <Button variant="ghost" onClick={() => setModal('delete')} aria-label="Delete position"><Trash2 className="size-3.5 text-bad" /></Button>}
          </div>
        </div>
        {p.status === 'RETURNED' && p.returnComment && <Alert tone="bad" className="mt-3" title="Returned by HR">{p.returnComment}</Alert>}
        {p.status === 'PENDING' && <Alert tone="info" className="mt-3">Waiting for HR approval. Any edit takes it back to draft.</Alert>}
        {p.versionNo > 0 && p.draftChanged && p.status !== 'PENDING' && <Alert tone="warn" className="mt-3">Draft changes are not in force yet — employees are still measured against v{p.versionNo}.</Alert>}
        {p.versionNo === 0 && <Alert tone="warn" className="mt-3">Never approved — employees in this position cannot request training until HR approves it.</Alert>}
        {canEdit && p.validation.length > 0 && <Alert tone="bad" className="mt-3" title="Fix before submitting"><ul className="list-disc pl-4">{p.validation.map((v) => <li key={v}>{v}</li>)}</ul></Alert>}
      </Card>
      <Card>
        <CardHead title={`Skills in this profile · ${p.skills.length}`} sub="Only the skills listed here apply to the position. Change requirement, target level or critical inline." actions={
          <>
            <div className="relative"><Search className="absolute left-2.5 top-2 size-3.5 text-fine" /><Input className="h-8 w-44 pl-8 py-1" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            {canEdit && <Button variant="primary" size="sm" onClick={() => setModal('add')} icon={<Plus className="size-3.5" />}>Add skill</Button>}
          </>
        } />
        {!p.skills.length ? <Empty title="No skills yet">{canEdit ? 'Add skills, or copy a similar position’s profile.' : ''}</Empty> : (
          <Table head={['Skill', 'Requirement', 'Target level', 'Critical', 'Approved', ...(canEdit ? [''] : [])]}>
            {rows.map((s) => {
              const sk = skills.get(s.skillId);
              const c = cats.get(sk?.categoryId ?? 0);
              const a = approved.get(s.skillId);
              const changed = p.versionNo > 0 && (!a || a.requirement !== s.requirement || a.targetLevel !== s.targetLevel || a.critical !== s.critical);
              return (
                <tr key={s.skillId} className={cn(changed && 'bg-opt-bg/40')}>
                  <td><div className="flex items-center gap-2"><i className={cn('size-2 shrink-0 rounded-full', CAT_COLORS[(c?.colorIndex ?? 1) - 1])} /><b>{sk?.name}</b>{!sk?.active && <Badge tone="bad">retired</Badge>}</div><div className="pl-4 text-[10.5px] text-muted">{c?.name}</div></td>
                  <td>
                    {canEdit ? (
                      <Select className="h-8 w-36 py-1" value={s.requirement} aria-label="Requirement" onChange={(e) => update.mutate({ ...s, requirement: e.target.value as Requirement, critical: e.target.value === 'R' && s.critical })}>
                        {(['R', 'O', 'U'] as const).map((r) => <option key={r} value={r}>{r} · {REQUIREMENT_LABEL[r]}</option>)}
                      </Select>
                    ) : <ReqChip r={s.requirement} />}
                  </td>
                  <td>
                    {canEdit ? (
                      <Select className="h-8 w-28 py-1" value={s.targetLevel} aria-label="Target level" onChange={(e) => update.mutate({ ...s, targetLevel: Number(e.target.value) })}>
                        {[1, 2, 3, 4].map((l) => <option key={l} value={l}>L{l}</option>)}
                      </Select>
                    ) : `L${s.targetLevel}`}
                  </td>
                  <td>{canEdit ? <Toggle checked={s.critical} disabled={s.requirement !== 'R'} label="Critical" onChange={(v) => update.mutate({ ...s, critical: v })} /> : s.critical ? '★' : ''}</td>
                  <td>{p.versionNo === 0 ? <span className="text-fine">—</span> : a ? <ReqChip r={a.requirement} level={a.targetLevel} critical={a.critical} /> : <Badge tone="warn">new</Badge>}</td>
                  {canEdit && (
                    <td className="whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => setModal({ replace: s.skillId })} icon={<Replace className="size-3.5" />}>Replace</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove.mutate(s.skillId)} aria-label={`Remove ${sk?.name}`}><Trash2 className="size-3.5 text-bad" /></Button>
                    </td>
                  )}
                </tr>
              );
            })}
          </Table>
        )}
        {removed.length > 0 && (
          <div className="border-t border-line-2 px-4 py-3 text-[11.5px] text-muted">
            Removed in this draft (still in v{p.versionNo}): {removed.map((r) => skills.get(r.skillId)?.name).join(', ')}
          </div>
        )}
      </Card>
      {modal === 'add' && <AddSkill p={p} L={L.data} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && <ReplaceSkill p={p} from={modal.replace} L={L.data} onClose={() => setModal(null)} />}
      {modal === 'copy' && <CopyProfile p={p} positions={positions} onClose={() => setModal(null)} />}
      {modal === 'edit' && <PositionModal p={p} onClose={() => setModal(null)} />}
      {modal === 'return' && <ReturnModal p={p} onClose={() => setModal(null)} />}
      {modal === 'delete' && <DeleteModal p={p} onClose={() => setModal(null)} />}
    </div>
  );
}

function SkillChooser({ L, exclude, value, onChange }: { L?: Lookups; exclude: Set<number>; value: number | null; onChange: (id: number) => void }) {
  const [q, setQ] = useState('');
  const cats = catMap(L);
  const list = (L?.skills ?? []).filter((s) => s.active && !exclude.has(s.id) && (!q || `${s.name} ${s.code} ${s.description}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      <div className="relative mb-2"><Search className="absolute left-2.5 top-2.5 size-3.5 text-fine" /><Input autoFocus className="pl-8" placeholder="Search the skills library…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="max-h-64 overflow-y-auto rounded-xl border border-line scroll-thin">
        {list.map((s) => (
          <button key={s.id} type="button" onClick={() => onChange(s.id)} className={cn('flex w-full items-center gap-2 border-b border-line-2 px-3 py-2 text-left last:border-0', value === s.id ? 'bg-accent-soft' : 'hover:bg-hover')}>
            <i className={cn('size-2 rounded-full', CAT_COLORS[(cats.get(s.categoryId)?.colorIndex ?? 1) - 1])} />
            <span className="min-w-0 flex-1"><b className="text-[12px]">{s.name}</b><small className="block truncate text-[10.5px] text-muted">{cats.get(s.categoryId)?.name} · {s.description}</small></span>
            {value === s.id && <Check className="size-4 text-req" />}
          </button>
        ))}
        {!list.length && <p className="p-4 text-center text-[12px] text-muted">No skills left to add.</p>}
      </div>
    </div>
  );
}

function RequirementFields({ r, l, c, set }: { r: Requirement; l: number; c: boolean; set: (v: { r?: Requirement; l?: number; c?: boolean }) => void }) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <Field label="Requirement"><Select value={r} onChange={(e) => set({ r: e.target.value as Requirement, c: e.target.value === 'R' && c })}>{(['R', 'O', 'U'] as const).map((x) => <option key={x} value={x}>{x} · {REQUIREMENT_LABEL[x]}</option>)}</Select></Field>
      <Field label="Target level"><Select value={l} onChange={(e) => set({ l: Number(e.target.value) })}>{[1, 2, 3, 4].map((x) => <option key={x} value={x}>L{x}</option>)}</Select></Field>
      <Field label="Critical"><div className="flex h-9 items-center gap-2"><Toggle checked={c} disabled={r !== 'R'} onChange={(v) => set({ c: v })} label="Critical" /><small className="text-muted">Required only</small></div></Field>
    </div>
  );
}

function AddSkill({ p, L, onClose }: { p: PositionDetail; L?: Lookups; onClose: () => void }) {
  const [skill, setSkill] = useState<number | null>(null);
  const [v, setV] = useState({ r: 'R' as Requirement, l: 2, c: false });
  const add = useAction(() => api.post(`/positions/${p.id}/skills`, { skillId: skill, requirement: v.r, targetLevel: v.l, critical: v.c }), { success: 'Skill added', invalidate: [['position', p.id], ['positions'], ['matrix']], onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Add a skill to ${p.name}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!skill} loading={add.isPending} onClick={() => add.mutate(undefined)}>Add skill</Button></>}>
      <SkillChooser L={L} exclude={new Set(p.skills.map((s) => s.skillId))} value={skill} onChange={setSkill} />
      <RequirementFields r={v.r} l={v.l} c={v.c} set={(x) => setV({ r: x.r ?? v.r, l: x.l ?? v.l, c: x.c ?? v.c })} />
    </Modal>
  );
}

function ReplaceSkill({ p, from, L, onClose }: { p: PositionDetail; from: number; L?: Lookups; onClose: () => void }) {
  const cur = p.skills.find((s) => s.skillId === from)!;
  const [skill, setSkill] = useState<number | null>(null);
  const [v, setV] = useState({ r: cur.requirement, l: cur.targetLevel, c: cur.critical });
  const name = L?.skills.find((s) => s.id === from)?.name;
  const rep = useAction(() => api.post(`/positions/${p.id}/skills/replace`, { fromSkillId: from, toSkillId: skill, requirement: v.r, targetLevel: v.l }), { success: 'Skill replaced', invalidate: [['position', p.id], ['positions'], ['matrix']], onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Replace ${name}`} sub="The new skill takes over this skill's requirement and level unless you change them." footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!skill} loading={rep.isPending} onClick={() => rep.mutate(undefined)}>Replace</Button></>}>
      <SkillChooser L={L} exclude={new Set(p.skills.map((s) => s.skillId))} value={skill} onChange={setSkill} />
      <RequirementFields r={v.r} l={v.l} c={v.c} set={(x) => setV({ r: x.r ?? v.r, l: x.l ?? v.l, c: x.c ?? v.c })} />
    </Modal>
  );
}

function CopyProfile({ p, positions, onClose }: { p: PositionDetail; positions: Position[]; onClose: () => void }) {
  const [from, setFrom] = useState<number>(positions.find((x) => x.id !== p.id)?.id ?? 0);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const copy = useAction(() => api.post(`/positions/${p.id}/copy`, { fromPositionId: from, mode }), { success: 'Profile copied', invalidate: [['position', p.id], ['positions'], ['matrix']], onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Copy skills into ${p.name}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={copy.isPending} onClick={() => copy.mutate(undefined)}>Copy</Button></>}>
      <Field label="Copy from"><Select value={from} onChange={(e) => setFrom(Number(e.target.value))}>{positions.filter((x) => x.id !== p.id).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.counts.R + x.counts.O + x.counts.U} skills)</option>)}</Select></Field>
      <div className="mt-3 space-y-2 text-[12.5px]">
        <label className="flex gap-2"><input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} /> Add missing skills (keep this profile’s existing ones)</label>
        <label className="flex gap-2"><input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Replace this profile entirely</label>
      </div>
    </Modal>
  );
}

function PositionModal({ p, onClose, onSaved }: { p?: PositionDetail; onClose: () => void; onSaved?: (id: number) => void }) {
  const me = useMe().data!;
  const hr = hasRole(me, 'HR_ADMIN');
  const [v, setV] = useState({ name: p?.name ?? '', grade: p?.grade ?? '', department: p?.department ?? '', jobNames: p?.jobNames.join('\n') ?? '', ownerPersonId: p?.ownerPersonId ?? null, requestLimit: p?.requestLimit ?? '' });
  const [err, setErr] = useState<Record<string, string>>({});
  const save = useAction(
    () => {
      const body = { ...v, jobNames: v.jobNames.split('\n').map((x) => x.trim()).filter(Boolean), requestLimit: v.requestLimit === '' ? null : Number(v.requestLimit) };
      return p ? api.put<PositionDetail>(`/positions/${p.id}`, body) : api.post<PositionDetail>('/positions', body);
    },
    { success: 'Position saved', invalidate: [['position'], ['positions'], ['lookups'], ['matrix']], onSuccess: (r) => { onSaved?.(r.id); onClose(); }, onError: (e) => setErr({ ...e.fields, _: e.message }) },
  );
  return (
    <Modal open onClose={onClose} title={p ? `Edit ${p.name}` : 'New position'} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" error={err.name} className="sm:col-span-2"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Grade"><Input value={v.grade} onChange={(e) => setV({ ...v, grade: e.target.value })} /></Field>
        <Field label="Department"><Input value={v.department} onChange={(e) => setV({ ...v, department: e.target.value })} /></Field>
        {hr && <Field label="Profile owner (manager who maintains it)" className="sm:col-span-2"><PersonPicker value={v.ownerPersonId} onChange={(id) => setV({ ...v, ownerPersonId: id })} /></Field>}
        {hr && <Field label="Fusion job names (one per line)" hint="Employees whose Fusion job matches are mapped to this position." className="sm:col-span-2"><Textarea value={v.jobNames} onChange={(e) => setV({ ...v, jobNames: e.target.value })} /></Field>}
        {hr && <Field label="Yearly request limit (blank = rule default)" error={err.requestLimit}><Input type="number" min={1} value={v.requestLimit} onChange={(e) => setV({ ...v, requestLimit: e.target.value })} /></Field>}
      </div>
      {err._ && !Object.keys(err).some((k) => k !== '_') && <Alert tone="bad" className="mt-3">{err._}</Alert>}
    </Modal>
  );
}

function ReturnModal({ p, onClose }: { p: PositionDetail; onClose: () => void }) {
  const [c, setC] = useState('');
  const ret = useAction(() => api.post(`/positions/${p.id}/decision`, { action: 'return', comment: c }), { success: 'Returned to the owner', invalidate: [['position', p.id], ['positions']], onSuccess: onClose });
  return (
    <Modal open onClose={onClose} title={`Return ${p.name}`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" disabled={c.trim().length < 5} loading={ret.isPending} onClick={() => ret.mutate(undefined)}>Return</Button></>}>
      <Field label="What needs to change?"><Textarea value={c} onChange={(e) => setC(e.target.value)} /></Field>
    </Modal>
  );
}
function DeleteModal({ p, onClose }: { p: PositionDetail; onClose: () => void }) {
  const [, setParams] = useSearchParams();
  const del = useAction(() => api.del(`/positions/${p.id}`), { success: 'Position deleted', invalidate: [['positions'], ['lookups'], ['matrix']], onSuccess: () => { setParams({}); onClose(); } });
  return (
    <Modal open onClose={onClose} title={`Delete ${p.name}?`} footer={<><Button onClick={onClose}>Cancel</Button><Button variant="danger" loading={del.isPending} onClick={() => del.mutate(undefined)}>Delete</Button></>}>
      <p className="text-[12.5px]">The profile and its approved versions are removed. This is only allowed when no active employee is mapped to it.</p>
    </Modal>
  );
}

/* ------------------------------ Matrix ------------------------------ */

function Matrix({ onOpen }: { onOpen: (id: number) => void }) {
  const m = useGet<{ positions: { id: number; name: string; status: string }[]; cells: Record<number, Record<number, PositionSkill>> }>(['matrix'], '/matrix');
  const L = useLookups();
  const [cat, setCat] = useState<number | 0>(0);
  if (!m.data || !L.data) return <Spinner />;
  const skills = L.data.skills.filter((s) => s.active && (!cat || s.categoryId === cat) && m.data!.positions.some((p) => m.data!.cells[p.id]?.[s.id]));
  return (
    <Card>
      <CardHead title="Position × skill matrix (drafts)" sub="Click a position to edit its profile" actions={<Select className="h-8 w-52 py-1" value={cat} onChange={(e) => setCat(Number(e.target.value))}><option value={0}>All categories</option>{L.data.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>} />
      <div className="max-h-[70dvh] overflow-auto scroll-thin">
        <table className="border-collapse text-[11.5px]">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              <th className="sticky left-0 z-20 min-w-56 bg-surface px-3 py-2 text-left text-[10.5px] uppercase text-fine">Skill</th>
              {m.data.positions.map((p) => (
                <th key={p.id} className="h-40 w-10 align-bottom"><button onClick={() => onOpen(p.id)} className="mx-auto block w-6 whitespace-nowrap pb-2 text-left text-[11px] font-semibold [writing-mode:vertical-rl] rotate-180 hover:text-req">{p.name}</button></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {skills.map((s) => (
              <tr key={s.id} className="border-t border-line-2 hover:bg-hover">
                <td className="sticky left-0 bg-surface px-3 py-1.5 font-semibold">{s.name}</td>
                {m.data!.positions.map((p) => { const c = m.data!.cells[p.id]?.[s.id]; return <td key={p.id} className="px-0.5 py-1 text-center">{c ? <ReqChip r={c.requirement} level={c.targetLevel} critical={c.critical} /> : <span className="text-fine">·</span>}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ------------------------------ Gaps ------------------------------ */

function Gaps({ positions }: { positions: Position[] }) {
  const [pos, setPos] = useState<number>(0);
  const g = useGet<{ personId: number; fullName: string; positionName: string | null; readiness: number; gaps: { skillId: number; current: number; target: number; critical: boolean }[] }[]>(['gaps', pos], `/gaps${pos ? `?positionId=${pos}` : ''}`);
  const L = useLookups();
  const skills = skillMap(L.data);
  const tally = useMemo(() => {
    const t = new Map<number, { n: number; crit: number }>();
    for (const p of g.data ?? []) for (const x of p.gaps) { const v = t.get(x.skillId) ?? { n: 0, crit: 0 }; v.n++; if (x.critical) v.crit++; t.set(x.skillId, v); }
    return [...t.entries()].sort((a, b) => b[1].crit - a[1].crit || b[1].n - a[1].n).slice(0, 10);
  }, [g.data]);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHead title="People and their gaps" sub="Measured against each position's approved profile" actions={<Select className="h-8 w-56 py-1" value={pos} onChange={(e) => setPos(Number(e.target.value))}><option value={0}>All positions</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>} />
        {!g.data ? <Spinner /> : (
          <Table head={['Employee', 'Position', 'Readiness', 'Gaps']}>
            {g.data.sort((a, b) => a.readiness - b.readiness).map((p) => (
              <tr key={p.personId}>
                <td><div className="flex items-center gap-2"><Avatar name={p.fullName} id={p.personId} size="xs" /><b>{p.fullName}</b></div></td>
                <td className="text-muted">{p.positionName}</td>
                <td className="w-36"><div className="flex items-center gap-2"><Meter value={p.readiness} className="flex-1" /><span className="w-9 text-right tabular">{p.readiness}%</span></div></td>
                <td className="max-w-96"><div className="flex flex-wrap gap-1">{p.gaps.slice(0, 6).map((x) => <Badge key={x.skillId} tone={x.critical ? 'bad' : 'warn'}>{skills.get(x.skillId)?.name} {x.current}→{x.target}</Badge>)}{p.gaps.length > 6 && <Badge>+{p.gaps.length - 6}</Badge>}</div></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card className="h-fit">
        <CardHead title="Most common gaps" sub="Where training would help most" />
        {tally.map(([id, v]) => (
          <div key={id} className="flex items-center gap-2 border-b border-line-2 px-4 py-2 text-[12px] last:border-0"><b className="flex-1">{skills.get(id)?.name}</b><span className="tabular">{v.n}</span>{v.crit > 0 && <Badge tone="bad">★ {v.crit}</Badge>}</div>
        ))}
        {!tally.length && <Empty title="No gaps" />}
      </Card>
    </div>
  );
}

/* ------------------------------ Library ------------------------------ */

function Library() {
  const L = useLookups();
  const [edit, setEdit] = useState<null | { id?: number }>(null);
  const [cat, setCat] = useState<null | { id?: number }>(null);
  const [q, setQ] = useState('');
  if (!L.data) return <Spinner />;
  const cats = catMap(L.data);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <Card>
        <CardHead title={`Skills · ${L.data.skills.length}`} sub="Retire a skill instead of deleting it once it is used" actions={<><Input className="h-8 w-48 py-1" placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} /><Button size="sm" variant="primary" onClick={() => setEdit({})} icon={<Plus className="size-3.5" />}>New skill</Button></>} />
        <Table head={['Skill', 'Category', 'Code', 'Used by', 'Status', '']}>
          {L.data.skills.filter((s) => !q || `${s.name} ${s.code}`.toLowerCase().includes(q.toLowerCase())).map((s) => (
            <tr key={s.id}>
              <td><b>{s.name}</b><div className="text-[10.5px] text-muted">{s.description}</div></td>
              <td><span className="inline-flex items-center gap-1.5"><i className={cn('size-2 rounded-full', CAT_COLORS[(cats.get(s.categoryId)?.colorIndex ?? 1) - 1])} />{cats.get(s.categoryId)?.name}</span></td>
              <td className="font-mono text-[10.5px] text-muted">{s.code}</td>
              <td className="tabular">{s.usedBy}</td>
              <td>{s.active ? <Badge tone="ok">Active</Badge> : <Badge>Retired</Badge>}</td>
              <td><Button size="sm" variant="ghost" onClick={() => setEdit({ id: s.id })}><Pencil className="size-3.5" /></Button></td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card className="h-fit">
        <CardHead title="Categories" actions={<Button size="sm" onClick={() => setCat({})} icon={<Plus className="size-3.5" />}>Add</Button>} />
        {L.data.categories.map((c) => (
          <button key={c.id} onClick={() => setCat({ id: c.id })} className="flex w-full items-center gap-2 border-b border-line-2 px-4 py-2.5 text-left text-[12.5px] last:border-0 hover:bg-hover">
            <i className={cn('size-2.5 rounded-full', CAT_COLORS[c.colorIndex - 1])} /><b className="flex-1">{c.name}</b><small className="text-muted">{L.data!.skills.filter((s) => s.categoryId === c.id).length}</small>
          </button>
        ))}
      </Card>
      {edit && <SkillModal id={edit.id} L={L.data} onClose={() => setEdit(null)} />}
      {cat && <CategoryModal id={cat.id} L={L.data} onClose={() => setCat(null)} />}
    </div>
  );
}

function SkillModal({ id, L, onClose }: { id?: number; L: Lookups; onClose: () => void }) {
  const s = L.skills.find((x) => x.id === id);
  const [v, setV] = useState({ code: s?.code ?? '', name: s?.name ?? '', categoryId: s?.categoryId ?? L.categories[0]?.id ?? 0, description: s?.description ?? '', level1: s?.level1 ?? '', level2: s?.level2 ?? '', level3: s?.level3 ?? '', level4: s?.level4 ?? '', active: s?.active ?? true });
  const [err, setErr] = useState<Record<string, string>>({});
  const opts = { invalidate: [['lookups'], ['matrix']], onSuccess: onClose, onError: (e: { fields: Record<string, string>; message: string }) => setErr({ ...e.fields, _: e.message }) };
  const save = useAction(() => (id ? api.put(`/library/skills/${id}`, v) : api.post('/library/skills', v)), { ...opts, success: 'Skill saved' });
  const del = useAction(() => api.del(`/library/skills/${id}`), { ...opts, success: 'Skill deleted' });
  return (
    <Modal open wide onClose={onClose} title={id ? `Edit ${s?.name}` : 'New skill'} footer={<>{id && s?.usedBy === 0 && <Button variant="ghost" className="mr-auto text-bad" onClick={() => del.mutate(undefined)}>Delete</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" error={err.name}><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value, code: id ? v.code : e.target.value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) })} /></Field>
        <Field label="Code" error={err.code}><Input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} /></Field>
        <Field label="Category"><Select value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: Number(e.target.value) })}>{L.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Active"><div className="flex h-9 items-center"><Toggle checked={v.active} onChange={(a) => setV({ ...v, active: a })} label="Active" /></div></Field>
        <Field label="Description" className="sm:col-span-2"><Input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        {([1, 2, 3, 4] as const).map((l) => (
          <Field key={l} label={`Level ${l} looks like…`}><Input value={v[`level${l}`]} onChange={(e) => setV({ ...v, [`level${l}`]: e.target.value })} /></Field>
        ))}
      </div>
      {err._ && <Alert tone="bad" className="mt-3">{err._}</Alert>}
    </Modal>
  );
}

function CategoryModal({ id, L, onClose }: { id?: number; L: Lookups; onClose: () => void }) {
  const c = L.categories.find((x) => x.id === id);
  const [v, setV] = useState({ code: c?.code ?? '', name: c?.name ?? '', colorIndex: c?.colorIndex ?? 1, sortOrder: c?.sortOrder ?? (L.categories.length + 1) * 10 });
  const opts = { invalidate: [['lookups']], onSuccess: onClose };
  const save = useAction(() => (id ? api.put(`/library/categories/${id}`, v) : api.post('/library/categories', v)), { ...opts, success: 'Category saved' });
  const del = useAction(() => api.del(`/library/categories/${id}`), { ...opts, success: 'Category deleted' });
  return (
    <Modal open onClose={onClose} title={id ? `Edit ${c?.name}` : 'New category'} footer={<>{id && <Button variant="ghost" className="mr-auto text-bad" onClick={() => del.mutate(undefined)}>Delete</Button>}<Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate(undefined)}>Save</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label="Code"><Input value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} /></Field>
        <Field label="Colour"><div className="flex h-9 items-center gap-1.5">{CAT_COLORS.map((cc, i) => <button key={cc} type="button" onClick={() => setV({ ...v, colorIndex: i + 1 })} className={cn('size-6 rounded-full', cc, v.colorIndex === i + 1 && 'ring-2 ring-ink ring-offset-2')} aria-label={`Colour ${i + 1}`} />)}</div></Field>
        <Field label="Sort order"><Input type="number" value={v.sortOrder} onChange={(e) => setV({ ...v, sortOrder: Number(e.target.value) })} /></Field>
      </div>
    </Modal>
  );
}

/* ------------------------------ Fusion jobs ------------------------------ */

function Jobs({ positions }: { positions: Position[] }) {
  const jobs = useGet<{ jobName: string; department: string | null; employees: number; positionId: number | null; positionName: string | null }[]>(['jobs'], '/jobs');
  const inv = [['jobs'], ['positions'], ['lookups']];
  const map = useAction((v: { jobName: string; positionId: number | null }) => api.put('/jobs', v), { success: 'Mapping saved', invalidate: inv });
  const imp = useAction(() => api.post<{ created: number; linked: number }>('/jobs/import', {}), { success: (r) => `${r.created} positions created, ${r.linked} linked`, invalidate: inv });
  if (!jobs.data) return <Spinner />;
  const unmapped = jobs.data.filter((j) => !j.positionId);
  return (
    <Card>
      <CardHead title="Fusion jobs → positions" sub="Employees are mapped to a position through their Fusion job. One-off exceptions are set per employee in Setup → Employees." actions={unmapped.length > 0 && <Button size="sm" variant="primary" loading={imp.isPending} onClick={() => imp.mutate(undefined)} icon={<Download className="size-3.5" />}>Create draft positions for {unmapped.length} unmapped jobs</Button>} />
      <Table head={['Fusion job', 'Department', 'Employees', 'Position']}>
        {jobs.data.map((j) => (
          <tr key={j.jobName}>
            <td><b>{j.jobName}</b></td>
            <td className="text-muted">{j.department ?? '—'}</td>
            <td className="tabular">{j.employees}</td>
            <td>
              <Select className={cn('h-8 w-64 py-1', !j.positionId && 'border-opt')} value={j.positionId ?? ''} onChange={(e) => map.mutate({ jobName: j.jobName, positionId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— not mapped —</option>
                {positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
