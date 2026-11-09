// Job Skills Matrix: positions, their skill profiles (add / update / replace / remove / copy),
// validation, and the HR approval that snapshots an approved version.
import type {
  Position,
  PositionDetail,
  PositionInput,
  PositionSkill,
  PositionSkillInput,
  Requirement,
} from '@traininghub/shared';
import type { R } from '../db/tables';
import { UniqueViolation } from '../db/store';
import { forbidden, invalid, notFound, validation } from '../lib/errors';
import {
  audit,
  directory,
  hasRole,
  invalidateDirectory,
  nameOf,
  notify,
  nowIso,
  settingFlag,
  settingInt,
  settings,
  type Ctx,
  type Directory,
} from './ctx';
import { toPositionSkill } from './profiles';

export function canEditPosition(dir: Directory, actor: number, pos: R<'positions'>): boolean {
  return hasRole(dir, actor, 'HR_ADMIN') || pos.ownerPersonId === actor;
}
export function canEditAnyJsm(dir: Directory, actor: number): boolean {
  return hasRole(dir, actor, 'HR_ADMIN') || [...dir.positions.values()].some((p) => p.ownerPersonId === actor);
}

async function loadPosition(ctx: Ctx, id: number) {
  const pos = await ctx.store.one('positions', { id });
  if (!pos) throw notFound('Position');
  return pos;
}

async function editable(ctx: Ctx, id: number) {
  const dir = await directory(ctx);
  const pos = await loadPosition(ctx, id);
  if (!canEditPosition(dir, ctx.actor!, pos)) throw forbidden('Only HR or the position owner can change this profile');
  return { dir, pos };
}

function counts(skills: PositionSkill[]) {
  return {
    R: skills.filter((s) => s.requirement === 'R').length,
    O: skills.filter((s) => s.requirement === 'O').length,
    U: skills.filter((s) => s.requirement === 'U').length,
    critical: skills.filter((s) => s.critical).length,
  };
}
const sig = (list: PositionSkill[]) =>
  list
    .map((s) => `${s.skillId}:${s.requirement}:${s.targetLevel}:${s.critical ? 1 : 0}`)
    .sort()
    .join('|');

export async function validateProfile(ctx: Ctx, skills: PositionSkill[]): Promise<string[]> {
  const s = await settings(ctx);
  const [lib, cats] = await Promise.all([ctx.store.find('skills'), ctx.store.find('categories')]);
  const byId = new Map(lib.map((x) => [x.id, x]));
  const errs: string[] = [];
  const min = settingInt(s, 'JSM_MIN_REQUIRED');
  const c = counts(skills);
  if (c.R < min) errs.push(`At least ${min} required skills are needed (now ${c.R}).`);
  for (const x of skills) {
    const name = byId.get(x.skillId)?.name ?? `Skill #${x.skillId}`;
    if (!byId.get(x.skillId)?.activeFlag) errs.push(`${name} is retired — replace or remove it.`);
    if (!(x.targetLevel >= 1 && x.targetLevel <= 4)) errs.push(`${name}: choose a target level (1–4).`);
    if (x.critical && x.requirement !== 'R') errs.push(`${name}: only required skills can be critical.`);
  }
  if (settingFlag(s, 'JSM_REQUIRE_BEHAVIOURAL')) {
    const beh = cats.find((k) => k.code === 'BEH');
    if (beh && !skills.some((x) => x.requirement === 'R' && byId.get(x.skillId)?.categoryId === beh.id))
      errs.push('At least one behavioural skill must be required.');
  }
  const mandatory = s.JSM_MANDATORY_SKILLS.split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  for (const code of mandatory) {
    const sk = lib.find((k) => k.code === code);
    if (sk && !skills.some((x) => x.skillId === sk.id && x.requirement === 'R'))
      errs.push(`${sk.name} is mandatory for every position (must be Required).`);
  }
  return errs;
}

function toPosition(
  dir: Directory,
  p: R<'positions'>,
  jobs: string[],
  draft: PositionSkill[],
  approved: PositionSkill[],
): Position {
  const headcount = [...dir.people.values()].filter((x) => x.active && x.positionId === p.id).length;
  return {
    id: p.id,
    name: p.name,
    grade: p.grade ?? '',
    department: p.departmentName ?? '',
    jobNames: jobs,
    ownerPersonId: p.ownerPersonId,
    ownerName: nameOf(dir, p.ownerPersonId),
    status: p.statusCode as Position['status'],
    versionNo: p.versionNo,
    approvedAt: p.approvedAt,
    approvedByName: nameOf(dir, p.approvedBy),
    submittedAt: p.submittedAt,
    returnComment: p.returnComment,
    requestLimit: p.requestLimit,
    headcount,
    counts: counts(draft),
    draftChanged: p.versionNo > 0 && sig(draft) !== sig(approved),
  };
}

export async function listPositions(ctx: Ctx): Promise<Position[]> {
  const dir = await directory(ctx);
  const [positions, jobs, draft, approved] = await Promise.all([
    ctx.store.find('positions', {}, { orderBy: ['name'] }),
    ctx.store.find('positionJobs'),
    ctx.store.find('positionSkills'),
    ctx.store.find('positionSkillsApproved'),
  ]);
  return positions.map((p) =>
    toPosition(
      dir,
      p,
      jobs.filter((j) => j.positionId === p.id).map((j) => j.jobName),
      draft.filter((d) => d.positionId === p.id).map(toPositionSkill),
      approved.filter((a) => a.positionId === p.id && a.versionNo === p.versionNo).map(toPositionSkill),
    ),
  );
}

export async function getPosition(ctx: Ctx, id: number): Promise<PositionDetail> {
  const dir = await directory(ctx);
  const p = await loadPosition(ctx, id);
  const [jobs, draft, approved] = await Promise.all([
    ctx.store.find('positionJobs', { positionId: id }),
    ctx.store.find('positionSkills', { positionId: id }),
    p.versionNo ? ctx.store.find('positionSkillsApproved', { positionId: id, versionNo: p.versionNo }) : [],
  ]);
  const skills = draft.map(toPositionSkill);
  const approvedSkills = approved.map(toPositionSkill);
  return {
    ...toPosition(dir, p, jobs.map((j) => j.jobName), skills, approvedSkills),
    skills,
    approvedSkills,
    validation: await validateProfile(ctx, skills),
  };
}

async function setJobs(ctx: Ctx, positionId: number, jobNames: string[]) {
  const clean = [...new Set(jobNames.map((j) => j.trim()).filter(Boolean))];
  const taken = await ctx.store.find('positionJobs', { jobName: clean });
  const clash = taken.find((t) => t.positionId !== positionId);
  if (clash) throw validation(`Fusion job "${clash.jobName}" is already mapped to another position`);
  await ctx.store.remove('positionJobs', { positionId });
  for (const jobName of clean) await ctx.store.insert('positionJobs', { positionId, jobName });
}

export async function createPosition(ctx: Ctx, input: PositionInput) {
  const dir = await directory(ctx);
  if (!hasRole(dir, ctx.actor!, 'HR_ADMIN')) throw forbidden('Only HR can create positions');
  const at = nowIso(ctx);
  try {
    return await ctx.store.tx(async () => {
      const p = await ctx.store.insert('positions', {
        name: input.name,
        grade: input.grade || null,
        departmentName: input.department || null,
        ownerPersonId: input.ownerPersonId,
        statusCode: 'DRAFT',
        versionNo: 0,
        requestLimit: input.requestLimit,
        createdAt: at,
        updatedAt: at,
      });
      await setJobs(ctx, p.id, input.jobNames);
      await audit(ctx, 'Created position', 'POSITION', p.name);
      invalidateDirectory(ctx);
      return p;
    });
  } catch (e) {
    if (e instanceof UniqueViolation) throw validation('A position with this name already exists', { name: 'Already exists' });
    throw e;
  }
}

export async function updatePosition(ctx: Ctx, id: number, input: PositionInput) {
  const { pos } = await editable(ctx, id);
  const dir = await directory(ctx);
  const hr = hasRole(dir, ctx.actor!, 'HR_ADMIN');
  await ctx.store.tx(async () => {
    await ctx.store.update(
      'positions',
      { id },
      {
        name: input.name,
        grade: input.grade || null,
        departmentName: input.department || null,
        // Only HR can hand ownership to someone else.
        ownerPersonId: hr ? input.ownerPersonId : pos.ownerPersonId,
        requestLimit: hr ? input.requestLimit : pos.requestLimit,
        updatedAt: nowIso(ctx),
      },
    );
    if (hr) await setJobs(ctx, id, input.jobNames);
    await audit(ctx, 'Updated position', 'POSITION', input.name);
  });
  invalidateDirectory(ctx);
}

export async function deletePosition(ctx: Ctx, id: number) {
  const dir = await directory(ctx);
  if (!hasRole(dir, ctx.actor!, 'HR_ADMIN')) throw forbidden('Only HR can delete positions');
  const pos = await loadPosition(ctx, id);
  const people = [...dir.people.values()].filter((p) => p.positionId === id && p.active).length;
  if (people) throw invalid(`${people} employee(s) are mapped to this position — remap them first`);
  await ctx.store.tx(async () => {
    await ctx.store.remove('positionSkills', { positionId: id });
    await ctx.store.remove('positionSkillsApproved', { positionId: id });
    await ctx.store.remove('positionJobs', { positionId: id });
    await ctx.store.remove('employeeExt', { positionId: id });
    await ctx.store.remove('positions', { id });
    await audit(ctx, 'Deleted position', 'POSITION', pos.name);
  });
  invalidateDirectory(ctx);
}

/** Any profile edit puts the position back to DRAFT; the last approved version stays in force. */
async function touched(ctx: Ctx, pos: R<'positions'>, action: string) {
  await ctx.store.update(
    'positions',
    { id: pos.id },
    { statusCode: 'DRAFT', submittedAt: null, submittedBy: null, updatedAt: nowIso(ctx) },
  );
  await audit(ctx, action, 'POSITION', pos.name);
  invalidateDirectory(ctx);
}

async function skillName(ctx: Ctx, skillId: number) {
  const s = await ctx.store.one('skills', { id: skillId });
  if (!s) throw notFound('Skill');
  return s;
}

function normalise(input: { requirement: Requirement; targetLevel: number; critical: boolean }) {
  return {
    requirementCode: input.requirement,
    targetLevel: input.targetLevel,
    criticalFlag: input.requirement === 'R' ? input.critical : false,
  };
}

export async function addSkill(ctx: Ctx, positionId: number, input: PositionSkillInput) {
  const { pos } = await editable(ctx, positionId);
  const s = await skillName(ctx, input.skillId);
  if (!s.activeFlag) throw validation(`${s.name} is retired`);
  await ctx.store.tx(async () => {
    if (await ctx.store.count('positionSkills', { positionId, skillId: input.skillId }))
      throw invalid(`${s.name} is already in this profile`);
    await ctx.store.insert('positionSkills', { positionId, skillId: input.skillId, ...normalise(input) });
    await touched(ctx, pos, `Added ${s.name} (${input.requirement}${input.targetLevel})`);
  });
}

export async function updateSkill(ctx: Ctx, positionId: number, input: PositionSkillInput) {
  const { pos } = await editable(ctx, positionId);
  const s = await skillName(ctx, input.skillId);
  await ctx.store.tx(async () => {
    const n = await ctx.store.update('positionSkills', { positionId, skillId: input.skillId }, normalise(input));
    if (!n) throw notFound(`${s.name} in this profile`);
    await touched(ctx, pos, `Changed ${s.name} to ${input.requirement}${input.targetLevel}${input.critical ? ' ★' : ''}`);
  });
}

export async function removeSkill(ctx: Ctx, positionId: number, skillId: number) {
  const { pos } = await editable(ctx, positionId);
  const s = await skillName(ctx, skillId);
  await ctx.store.tx(async () => {
    const n = await ctx.store.remove('positionSkills', { positionId, skillId });
    if (!n) throw notFound(`${s.name} in this profile`);
    await touched(ctx, pos, `Removed ${s.name}`);
  });
}

export async function replaceSkill(
  ctx: Ctx,
  positionId: number,
  input: { fromSkillId: number; toSkillId: number; requirement?: Requirement; targetLevel?: number },
) {
  const { pos } = await editable(ctx, positionId);
  if (input.fromSkillId === input.toSkillId) throw validation('Choose a different skill');
  const [from, to] = await Promise.all([skillName(ctx, input.fromSkillId), skillName(ctx, input.toSkillId)]);
  if (!to.activeFlag) throw validation(`${to.name} is retired`);
  await ctx.store.tx(async () => {
    const cur = await ctx.store.one('positionSkills', { positionId, skillId: input.fromSkillId });
    if (!cur) throw notFound(`${from.name} in this profile`);
    if (await ctx.store.count('positionSkills', { positionId, skillId: input.toSkillId }))
      throw invalid(`${to.name} is already in this profile — remove ${from.name} instead`);
    const requirement = input.requirement ?? (cur.requirementCode as Requirement);
    await ctx.store.remove('positionSkills', { id: cur.id });
    await ctx.store.insert('positionSkills', {
      positionId,
      skillId: input.toSkillId,
      ...normalise({ requirement, targetLevel: input.targetLevel ?? cur.targetLevel, critical: cur.criticalFlag }),
    });
    await touched(ctx, pos, `Replaced ${from.name} with ${to.name}`);
  });
}

export async function copyProfile(ctx: Ctx, positionId: number, fromPositionId: number, mode: 'merge' | 'replace') {
  const { pos } = await editable(ctx, positionId);
  if (positionId === fromPositionId) throw validation('Choose another position');
  const src = await loadPosition(ctx, fromPositionId);
  const rows = await ctx.store.find('positionSkills', { positionId: fromPositionId });
  let added = 0;
  await ctx.store.tx(async () => {
    if (mode === 'replace') await ctx.store.remove('positionSkills', { positionId });
    const have = new Set((await ctx.store.find('positionSkills', { positionId })).map((r) => r.skillId));
    for (const r of rows) {
      if (have.has(r.skillId)) continue;
      await ctx.store.insert('positionSkills', {
        positionId,
        skillId: r.skillId,
        requirementCode: r.requirementCode,
        targetLevel: r.targetLevel,
        criticalFlag: r.criticalFlag,
      });
      added++;
    }
    await touched(ctx, pos, `${mode === 'replace' ? 'Replaced profile with' : 'Merged'} ${src.name} (${added} skills)`);
  });
  return { added };
}

export async function submitPosition(ctx: Ctx, id: number) {
  const { dir, pos } = await editable(ctx, id);
  const detail = await getPosition(ctx, id);
  if (detail.validation.length) throw validation('Fix the profile first', { errors: detail.validation });
  if (pos.statusCode === 'PENDING') throw invalid('Already waiting for HR approval');
  if (pos.versionNo > 0 && !detail.draftChanged && pos.statusCode === 'APPROVED') throw invalid('No changes to submit');
  const s = await settings(ctx);
  // Without HR approval, HR (or the setting) approves straight away.
  // (A system admin who is not in HR still goes through HR.)
  if (!settingFlag(s, 'JSM_HR_APPROVAL') || dir.people.get(ctx.actor!)?.roles.includes('HR_ADMIN'))
    return approve(ctx, pos, detail.skills, '');
  await ctx.store.tx(async () => {
    await ctx.store.update(
      'positions',
      { id },
      { statusCode: 'PENDING', submittedAt: nowIso(ctx), submittedBy: ctx.actor, returnComment: null, updatedAt: nowIso(ctx) },
    );
    await audit(ctx, 'Submitted profile for HR approval', 'POSITION', pos.name);
    for (const hr of dir.roleHolders.get('HR_ADMIN') ?? [])
      await notify(ctx, hr, `${nameOf(dir, ctx.actor)} submitted the ${pos.name} skill profile`, `/jsm?position=${id}`);
  });
  invalidateDirectory(ctx);
  return { status: 'PENDING' as const };
}

async function approve(ctx: Ctx, pos: R<'positions'>, skills: PositionSkill[], comment: string) {
  const version = pos.versionNo + 1;
  await ctx.store.tx(async () => {
    for (const s of skills)
      await ctx.store.insert('positionSkillsApproved', {
        positionId: pos.id,
        versionNo: version,
        skillId: s.skillId,
        requirementCode: s.requirement,
        targetLevel: s.targetLevel,
        criticalFlag: s.critical,
      });
    await ctx.store.update(
      'positions',
      { id: pos.id },
      {
        statusCode: 'APPROVED',
        versionNo: version,
        approvedAt: nowIso(ctx),
        approvedBy: ctx.actor,
        returnComment: comment || null,
        updatedAt: nowIso(ctx),
      },
    );
    await audit(ctx, `Approved profile v${version}`, 'POSITION', pos.name);
    if (pos.submittedBy) await notify(ctx, pos.submittedBy, `HR approved the ${pos.name} profile (v${version})`, `/jsm?position=${pos.id}`);
  });
  invalidateDirectory(ctx);
  return { status: 'APPROVED' as const, versionNo: version };
}

export async function decidePosition(ctx: Ctx, id: number, action: 'approve' | 'return', comment: string) {
  const dir = await directory(ctx);
  if (!hasRole(dir, ctx.actor!, 'HR_ADMIN')) throw forbidden('Only HR approves skill profiles');
  const pos = await loadPosition(ctx, id);
  if (pos.statusCode !== 'PENDING') throw invalid('This profile is not waiting for approval');
  if (action === 'approve') {
    const detail = await getPosition(ctx, id);
    if (detail.validation.length) throw validation('The profile no longer passes validation', { errors: detail.validation });
    return approve(ctx, pos, detail.skills, comment);
  }
  if (comment.length < 5) throw validation('Say what needs to change', { comment: 'At least 5 characters' });
  await ctx.store.tx(async () => {
    await ctx.store.update('positions', { id }, { statusCode: 'RETURNED', returnComment: comment, updatedAt: nowIso(ctx) });
    await audit(ctx, 'Returned profile', 'POSITION', pos.name, { comment });
    await notify(ctx, pos.submittedBy, `HR returned the ${pos.name} profile: “${comment}”`, `/jsm?position=${id}`);
  });
  invalidateDirectory(ctx);
  return { status: 'RETURNED' as const };
}

/** Creates a draft position for each Fusion job name that is not mapped yet. */
export async function importJobsAsPositions(ctx: Ctx, jobNames?: string[]) {
  const dir = await directory(ctx);
  if (!hasRole(dir, ctx.actor!, 'HR_ADMIN')) throw forbidden();
  const mapped = new Set((await ctx.store.find('positionJobs')).map((j) => j.jobName.toLowerCase()));
  const names = new Set((await ctx.store.find('positions')).map((p) => p.name.toLowerCase()));
  const jobs = new Map<string, string | null>();
  for (const p of dir.people.values())
    if (p.active && p.jobName && !mapped.has(p.jobName.toLowerCase())) jobs.set(p.jobName, p.department);
  const pick = jobNames ? [...jobs.keys()].filter((j) => jobNames.includes(j)) : [...jobs.keys()];
  let created = 0;
  let linked = 0;
  const at = nowIso(ctx);
  await ctx.store.tx(async () => {
    for (const job of pick) {
      const existing = [...dir.positions.values()].find((p) => p.name.toLowerCase() === job.toLowerCase());
      if (existing) {
        await ctx.store.insert('positionJobs', { positionId: existing.id, jobName: job });
        linked++;
        continue;
      }
      if (names.has(job.toLowerCase())) continue;
      const p = await ctx.store.insert('positions', {
        name: job.slice(0, 150),
        departmentName: jobs.get(job) ?? null,
        statusCode: 'DRAFT',
        versionNo: 0,
        createdAt: at,
        updatedAt: at,
      });
      await ctx.store.insert('positionJobs', { positionId: p.id, jobName: job });
      created++;
    }
    await audit(ctx, `Imported Fusion jobs: ${created} new, ${linked} linked`, 'POSITION', 'Fusion jobs');
  });
  invalidateDirectory(ctx);
  return { created, linked };
}

/** Fusion job names with how many active employees hold each and where they map. */
export async function jobMapping(ctx: Ctx) {
  const dir = await directory(ctx);
  const jobs = await ctx.store.find('positionJobs');
  const map = new Map(jobs.map((j) => [j.jobName.toLowerCase(), j.positionId]));
  const tally = new Map<string, { jobName: string; department: string | null; employees: number }>();
  for (const p of dir.people.values()) {
    if (!p.active || !p.jobName) continue;
    const t = tally.get(p.jobName) ?? { jobName: p.jobName, department: p.department, employees: 0 };
    t.employees++;
    tally.set(p.jobName, t);
  }
  return [...tally.values()]
    .map((t) => {
      const positionId = map.get(t.jobName.toLowerCase()) ?? null;
      return { ...t, positionId, positionName: positionId ? (dir.positions.get(positionId)?.name ?? null) : null };
    })
    .sort((a, b) => b.employees - a.employees);
}

export async function mapJob(ctx: Ctx, jobName: string, positionId: number | null) {
  const dir = await directory(ctx);
  if (!hasRole(dir, ctx.actor!, 'HR_ADMIN')) throw forbidden();
  await ctx.store.tx(async () => {
    await ctx.store.remove('positionJobs', { jobName });
    if (positionId) {
      await loadPosition(ctx, positionId);
      await ctx.store.insert('positionJobs', { positionId, jobName });
    }
    await audit(ctx, positionId ? `Mapped job to ${dir.positions.get(positionId)?.name}` : 'Unmapped job', 'POSITION', jobName);
  });
  invalidateDirectory(ctx);
}

export async function setEmployeePosition(ctx: Ctx, personId: number, positionId: number | null) {
  const dir = await directory(ctx);
  if (!hasRole(dir, ctx.actor!, 'HR_ADMIN')) throw forbidden();
  if (!dir.people.has(personId)) throw notFound('Employee');
  await ctx.store.tx(async () => {
    if (positionId == null) await ctx.store.remove('employeeExt', { personId });
    else {
      await loadPosition(ctx, positionId);
      await ctx.store.upsert('employeeExt', ['personId'], { personId, positionId, updatedBy: ctx.actor, updatedAt: nowIso(ctx) });
    }
    await audit(
      ctx,
      positionId ? `Position override → ${dir.positions.get(positionId)?.name}` : 'Position override removed',
      'EMPLOYEE',
      nameOf(dir, personId) ?? String(personId),
    );
  });
  invalidateDirectory(ctx);
}
