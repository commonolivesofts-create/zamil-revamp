// Position skill profiles (the Job Skills Matrix) and employee skill levels.
import type { PersonSkills, PositionSkill, Requirement, SkillLevelRow } from '@traininghub/shared';
import type { R } from '../db/tables';
import { forbidden, notFound } from '../lib/errors';
import {
  audit,
  directory,
  hasRole,
  nameOf,
  notify,
  nowIso,
  teamOf,
  type Ctx,
  type Directory,
} from './ctx';

export const toPositionSkill = (r: R<'positionSkills'> | R<'positionSkillsApproved'>): PositionSkill => ({
  skillId: r.skillId,
  requirement: r.requirementCode as Requirement,
  targetLevel: r.targetLevel,
  critical: r.criticalFlag,
});

/** The approved profile while one exists; the draft for a position that was never approved. */
export async function effectiveProfile(ctx: Ctx, position: R<'positions'>): Promise<Map<number, PositionSkill>> {
  const rows =
    position.versionNo > 0
      ? await ctx.store.find('positionSkillsApproved', { positionId: position.id, versionNo: position.versionNo })
      : await ctx.store.find('positionSkills', { positionId: position.id });
  return new Map(rows.map((r) => [r.skillId, toPositionSkill(r)]));
}

export async function levelsOf(ctx: Ctx, personId: number): Promise<Map<number, R<'employeeSkills'>>> {
  const rows = await ctx.store.find('employeeSkills', { personId });
  return new Map(rows.map((r) => [r.skillId, r]));
}

export function readiness(profile: Map<number, PositionSkill>, levels: Map<number, { skillLevel: number }>): number {
  let need = 0;
  let have = 0;
  for (const p of profile.values()) {
    if (p.requirement === 'U' || p.targetLevel <= 0) continue;
    need += p.targetLevel;
    have += Math.min(p.targetLevel, levels.get(p.skillId)?.skillLevel ?? 0);
  }
  return need ? have / need : 1;
}

/** Who may see / rate a person's skills: self (view), managers up to two levels, HR. */
export function canAssess(dir: Directory, actor: number, personId: number): boolean {
  if (actor === personId) return false;
  return hasRole(dir, actor, 'HR_ADMIN') || teamOf(dir, actor).includes(personId);
}
export function canViewSkills(dir: Directory, actor: number, personId: number): boolean {
  return actor === personId || canAssess(dir, actor, personId) || hasRole(dir, actor, 'HR_LEAD');
}

export async function personSkills(ctx: Ctx, personId: number): Promise<PersonSkills> {
  const dir = await directory(ctx);
  const person = dir.people.get(personId);
  if (!person) throw notFound('Employee');
  if (ctx.actor != null && !canViewSkills(dir, ctx.actor, personId)) throw forbidden();
  const pos = person.positionId ? dir.positions.get(person.positionId) : undefined;
  const profile = pos ? await effectiveProfile(ctx, pos) : new Map<number, PositionSkill>();
  const levels = await levelsOf(ctx, personId);
  const skillIds = new Set([...profile.keys(), ...levels.keys()]);
  const rows: SkillLevelRow[] = [...skillIds].map((skillId) => {
    const p = profile.get(skillId);
    const l = levels.get(skillId);
    return {
      skillId,
      requirement: p?.requirement ?? null,
      targetLevel: p?.targetLevel ?? 0,
      critical: p?.critical ?? false,
      currentLevel: l?.skillLevel ?? 0,
      assessedAt: l?.assessedAt ?? null,
      source: l?.sourceCode ?? null,
    };
  });
  const history = await ctx.store.find('skillHistory', { personId }, { orderBy: ['-changedAt'], limit: 50 });
  return {
    person: personRef(dir, personId),
    managerName: nameOf(dir, person.managerId),
    readiness: Math.round(readiness(profile, levels) * 100),
    rows,
    history: history.map((h) => ({
      skillId: h.skillId,
      fromLevel: h.fromLevel,
      toLevel: h.toLevel,
      source: h.sourceCode,
      changedAt: h.changedAt,
      byName: nameOf(dir, h.changedBy) ?? 'System',
    })),
  };
}

export function personRef(dir: Directory, personId: number) {
  const p = dir.people.get(personId);
  const pos = p?.positionId ? dir.positions.get(p.positionId) : undefined;
  return {
    personId,
    personNumber: p?.personNumber ?? '',
    fullName: p?.fullName ?? `#${personId}`,
    jobName: p?.jobName ?? null,
    department: p?.department ?? null,
    positionId: p?.positionId ?? null,
    positionName: pos?.name ?? null,
    active: p?.active ?? false,
  };
}

/** Sets one skill level and writes history. Call inside a transaction. */
export async function setLevel(
  ctx: Ctx,
  personId: number,
  skillId: number,
  level: number,
  source: 'ASSESSMENT' | 'TRAINING' | 'IMPORT',
  refId: number | null = null,
  note = '',
): Promise<{ from: number; to: number } | null> {
  const cur = await ctx.store.one('employeeSkills', { personId, skillId });
  const from = cur?.skillLevel ?? 0;
  if (cur && from === level) return null;
  const at = nowIso(ctx);
  await ctx.store.upsert('employeeSkills', ['personId', 'skillId'], {
    personId,
    skillId,
    skillLevel: level,
    assessedAt: at,
    assessedBy: ctx.actor,
    sourceCode: source,
  });
  await ctx.store.insert('skillHistory', {
    personId,
    skillId,
    fromLevel: from,
    toLevel: level,
    sourceCode: source,
    refId,
    changedBy: ctx.actor,
    changedAt: at,
    note: note || null,
  });
  return { from, to: level };
}

export async function saveAssessment(ctx: Ctx, personId: number, levels: Record<string, number>, note: string) {
  const dir = await directory(ctx);
  if (!canAssess(dir, ctx.actor!, personId)) throw forbidden('Only managers (two levels up) and HR can assess');
  const skills = new Set((await ctx.store.find('skills')).map((s) => s.id));
  let changed = 0;
  await ctx.store.tx(async () => {
    for (const [k, v] of Object.entries(levels)) {
      const skillId = Number(k);
      if (!skills.has(skillId)) continue;
      if (await setLevel(ctx, personId, skillId, v, 'ASSESSMENT', null, note)) changed++;
    }
    if (changed) {
      await audit(ctx, `Assessed ${changed} skill(s)`, 'EMPLOYEE', nameOf(dir, personId) ?? String(personId));
      await notify(ctx, personId, `${nameOf(dir, ctx.actor)} updated ${changed} of your skill levels`, '/skills');
    }
  });
  return { changed };
}
