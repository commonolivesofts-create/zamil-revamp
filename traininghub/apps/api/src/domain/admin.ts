// Setup: skills library, settings, delegations, roles, employees and local accounts.
import { randomBytes } from 'node:crypto';
import {
  SETTINGS,
  type CategoryInput,
  type Delegation,
  type DelegationInput,
  type EmployeeRow,
  type RoleCode,
  type SettingKey,
  type SkillInput,
} from '@traininghub/shared';
import { UniqueViolation } from '../db/store';
import { forbidden, invalid, notFound, validation } from '../lib/errors';
import { hashPassword } from '../auth/password';
import {
  audit,
  directory,
  hasRole,
  invalidateDirectory,
  nameOf,
  notify,
  nowIso,
  settings,
  today,
  type Ctx,
} from './ctx';

async function requireRole(ctx: Ctx, ...roles: RoleCode[]) {
  const dir = await directory(ctx);
  if (!hasRole(dir, ctx.actor!, ...roles)) throw forbidden();
  return dir;
}

/* ----------------------------- Skills library ----------------------------- */

export async function library(ctx: Ctx) {
  const [categories, skills, usage] = await Promise.all([
    ctx.store.find('categories', {}, { orderBy: ['sortOrder', 'name'] }),
    ctx.store.find('skills', {}, { orderBy: ['categoryId', 'id'] }),
    ctx.store.find('positionSkills'),
  ]);
  return {
    categories,
    skills: skills.map((s) => ({
      id: s.id,
      code: s.code,
      name: s.name,
      categoryId: s.categoryId,
      description: s.description ?? '',
      level1: s.level1 ?? '',
      level2: s.level2 ?? '',
      level3: s.level3 ?? '',
      level4: s.level4 ?? '',
      active: s.activeFlag,
      usedBy: usage.filter((u) => u.skillId === s.id).length,
    })),
  };
}

export async function saveCategory(ctx: Ctx, input: CategoryInput, id?: number) {
  await requireRole(ctx, 'HR_ADMIN');
  try {
    if (id) {
      if (!(await ctx.store.update('categories', { id }, input))) throw notFound('Category');
    } else await ctx.store.insert('categories', input);
    await audit(ctx, id ? 'Edited skill category' : 'Added skill category', 'SKILL', input.name);
  } catch (e) {
    if (e instanceof UniqueViolation) throw validation('Code already used', { code: 'Already used' });
    throw e;
  }
}

export async function deleteCategory(ctx: Ctx, id: number) {
  await requireRole(ctx, 'HR_ADMIN');
  if (await ctx.store.count('skills', { categoryId: id }))
    throw invalid('Move or delete the skills in this category first');
  await ctx.store.remove('categories', { id });
}

export async function saveSkill(ctx: Ctx, input: SkillInput, id?: number) {
  await requireRole(ctx, 'HR_ADMIN');
  if (!(await ctx.store.one('categories', { id: input.categoryId })))
    throw validation('Choose a category', { categoryId: 'Required' });
  const row = {
    code: input.code,
    name: input.name,
    categoryId: input.categoryId,
    description: input.description || null,
    level1: input.level1 || null,
    level2: input.level2 || null,
    level3: input.level3 || null,
    level4: input.level4 || null,
    activeFlag: input.active,
  };
  try {
    if (id) {
      if (!(await ctx.store.update('skills', { id }, row))) throw notFound('Skill');
    } else await ctx.store.insert('skills', { ...row, createdAt: nowIso(ctx) });
    await audit(
      ctx,
      id ? (input.active ? 'Edited skill' : 'Retired skill') : 'Added skill',
      'SKILL',
      input.name,
    );
  } catch (e) {
    if (e instanceof UniqueViolation) throw validation('Code already used', { code: 'Already used' });
    throw e;
  }
}

export async function deleteSkill(ctx: Ctx, id: number) {
  await requireRole(ctx, 'HR_ADMIN');
  const s = await ctx.store.one('skills', { id });
  if (!s) throw notFound('Skill');
  const used =
    (await ctx.store.count('positionSkills', { skillId: id })) +
    (await ctx.store.count('positionSkillsApproved', { skillId: id })) +
    (await ctx.store.count('sessions', { skillId: id })) +
    (await ctx.store.count('employeeSkills', { skillId: id }));
  if (used) throw invalid('This skill is in use — retire it instead (untick Active)');
  await ctx.store.remove('skills', { id });
  await audit(ctx, 'Deleted skill', 'SKILL', s.name);
}

/* ----------------------------- Settings ----------------------------- */

export async function saveSettings(ctx: Ctx, values: Record<string, string>) {
  await requireRole(ctx, 'HR_ADMIN');
  const fields: Record<string, string> = {};
  const clean: [SettingKey, string][] = [];
  for (const [k, v] of Object.entries(values)) {
    const def = SETTINGS[k as SettingKey];
    if (!def) continue;
    const val = v.trim();
    if (def.type === 'int' && !/^\d+$/.test(val)) fields[k] = 'Whole number';
    else if (def.type === 'flag' && !['Y', 'N'].includes(val)) fields[k] = 'Y or N';
    else clean.push([k as SettingKey, val]);
  }
  const num = (k: SettingKey) => Number(clean.find(([x]) => x === k)?.[1] ?? NaN);
  if (num('PASS_THEORY_DEFAULT') > 100) fields.PASS_THEORY_DEFAULT = '0–100';
  if (num('PASS_PRACTICAL_DEFAULT') > 10) fields.PASS_PRACTICAL_DEFAULT = '0–10';
  if (num('LEVEL_RAISE_ON_PASS') > 4) fields.LEVEL_RAISE_ON_PASS = '0–4';
  if (num('MIN_QUESTIONS') < 1) fields.MIN_QUESTIONS = 'At least 1';
  if (Object.keys(fields).length) throw validation('Check the highlighted settings', fields);
  const before = await settings(ctx);
  await ctx.store.tx(async () => {
    for (const [settingKey, settingValue] of clean)
      await ctx.store.upsert('settings', ['settingKey'], {
        settingKey,
        settingValue,
        updatedBy: ctx.actor,
        updatedAt: nowIso(ctx),
      });
    const changed = clean.filter(([k, v]) => before[k] !== v).map(([k, v]) => `${k}=${v}`);
    if (changed.length) await audit(ctx, 'Updated settings', 'SETTINGS', changed.join(', ').slice(0, 200));
  });
}

/* ----------------------------- Delegations ----------------------------- */

export async function listDelegations(ctx: Ctx, all: boolean): Promise<Delegation[]> {
  const dir = await directory(ctx);
  const rows = (
    await ctx.store.find('delegations', { cancelledFlag: false }, { orderBy: ['-startDate'] })
  ).filter((d) => all || d.fromPersonId === ctx.actor || d.toPersonId === ctx.actor);
  const t = today(ctx);
  return rows.map((d) => ({
    id: d.id,
    fromPersonId: d.fromPersonId,
    fromName: nameOf(dir, d.fromPersonId) ?? '',
    toPersonId: d.toPersonId,
    toName: nameOf(dir, d.toPersonId) ?? '',
    startDate: d.startDate,
    endDate: d.endDate,
    reason: d.reason ?? '',
    active: d.startDate <= t && d.endDate >= t,
  }));
}

export async function createDelegation(ctx: Ctx, input: DelegationInput) {
  const dir = await directory(ctx);
  const from = input.fromPersonId ?? ctx.actor!;
  if (from !== ctx.actor && !hasRole(dir, ctx.actor!, 'HR_ADMIN'))
    throw forbidden('You can only delegate your own approvals');
  if (from === input.toPersonId)
    throw validation('Choose someone else', { toPersonId: 'Choose someone else' });
  if (!dir.people.get(input.toPersonId)?.active)
    throw validation('Delegate must be active', { toPersonId: 'Not active' });
  if (input.endDate < today(ctx)) throw validation('End date is in the past', { endDate: 'In the past' });
  const existing = (await ctx.store.find('delegations', { fromPersonId: from, cancelledFlag: false })).find(
    (d) => d.startDate <= input.endDate && input.startDate <= d.endDate,
  );
  if (existing)
    throw invalid(
      `Overlaps an existing delegation to ${nameOf(dir, existing.toPersonId)} (${existing.startDate} – ${existing.endDate})`,
    );
  await ctx.store.tx(async () => {
    await ctx.store.insert('delegations', {
      fromPersonId: from,
      toPersonId: input.toPersonId,
      startDate: input.startDate,
      endDate: input.endDate,
      reason: input.reason || null,
      cancelledFlag: false,
      createdBy: ctx.actor!,
      createdAt: nowIso(ctx),
    });
    await audit(
      ctx,
      `Delegated approvals to ${nameOf(dir, input.toPersonId)} (${input.startDate} – ${input.endDate})`,
      'DELEGATION',
      nameOf(dir, from) ?? '',
    );
    await notify(
      ctx,
      input.toPersonId,
      `${nameOf(dir, from)} delegated approvals to you from ${input.startDate} to ${input.endDate}`,
      '/approvals',
    );
  });
}

export async function cancelDelegation(ctx: Ctx, id: number) {
  const dir = await directory(ctx);
  const d = await ctx.store.one('delegations', { id });
  if (!d) throw notFound('Delegation');
  if (d.fromPersonId !== ctx.actor && !hasRole(dir, ctx.actor!, 'HR_ADMIN')) throw forbidden();
  await ctx.store.update('delegations', { id }, { cancelledFlag: true });
  await audit(
    ctx,
    'Cancelled delegation',
    'DELEGATION',
    `${nameOf(dir, d.fromPersonId)} → ${nameOf(dir, d.toPersonId)}`,
  );
}

/* ----------------------------- Employees, roles, accounts ----------------------------- */

export async function listEmployees(ctx: Ctx, q = '', includeInactive = false): Promise<EmployeeRow[]> {
  const dir = await directory(ctx);
  const users = new Set((await ctx.store.find('users')).filter((u) => u.passwordHash).map((u) => u.personId));
  const needle = q.trim().toLowerCase();
  return [...dir.people.values()]
    .filter(
      (p) =>
        (includeInactive || p.active) &&
        (!needle ||
          `${p.fullName} ${p.personNumber} ${p.jobName ?? ''} ${p.department ?? ''}`
            .toLowerCase()
            .includes(needle)),
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .map((p) => ({
      personId: p.personId,
      personNumber: p.personNumber,
      fullName: p.fullName,
      jobName: p.jobName,
      department: p.department,
      positionId: p.positionId,
      positionName: p.positionId ? (dir.positions.get(p.positionId)?.name ?? null) : null,
      active: p.active,
      email: p.email,
      buCode: p.buCode,
      managerId: p.managerId,
      managerName: nameOf(dir, p.managerId),
      positionSource: p.positionSource,
      roles: p.roles,
      hasLogin: users.has(p.personId),
      syncedAt: p.syncedAt,
    }));
}

export async function grantRole(ctx: Ctx, personId: number, role: RoleCode) {
  const dir = await requireRole(ctx, role === 'SYS_ADMIN' ? 'SYS_ADMIN' : 'HR_ADMIN');
  if (!dir.people.has(personId)) throw notFound('Employee');
  if (await ctx.store.count('userRoles', { personId, roleCode: role })) return;
  await ctx.store.insert('userRoles', {
    personId,
    roleCode: role,
    grantedBy: ctx.actor,
    grantedAt: nowIso(ctx),
  });
  await audit(ctx, `Granted ${role}`, 'USER', nameOf(dir, personId) ?? String(personId));
  invalidateDirectory(ctx);
}

export async function revokeRole(ctx: Ctx, personId: number, role: RoleCode) {
  const dir = await requireRole(ctx, role === 'SYS_ADMIN' ? 'SYS_ADMIN' : 'HR_ADMIN');
  if (role === 'SYS_ADMIN' && personId === ctx.actor)
    throw invalid('You cannot remove your own administrator role');
  if (role === 'SYS_ADMIN' && (dir.roleHolders.get('SYS_ADMIN') ?? []).length <= 1)
    throw invalid('At least one administrator must remain');
  await ctx.store.remove('userRoles', { personId, roleCode: role });
  await audit(ctx, `Revoked ${role}`, 'USER', nameOf(dir, personId) ?? String(personId));
  invalidateDirectory(ctx);
}

/** Issues a one-time password the employee must change at first sign-in. Shown once to the admin. */
export async function resetPassword(ctx: Ctx, personId: number) {
  const dir = await requireRole(ctx, 'HR_ADMIN');
  const p = dir.people.get(personId);
  if (!p) throw notFound('Employee');
  if (!p.active) throw invalid('Employee is not active');
  const temp = randomBytes(9).toString('base64url');
  const hash = await hashPassword(temp, ctx.config.auth.bcryptCost);
  await ctx.store.upsert('users', ['personId'], {
    personId,
    passwordHash: hash,
    mustChangeFlag: true,
    failedCount: 0,
    lockedUntil: null,
    passwordChangedAt: nowIso(ctx),
    createdAt: nowIso(ctx),
  });
  await audit(ctx, 'Reset password', 'USER', p.fullName);
  return { temporaryPassword: temp, personNumber: p.personNumber };
}

/* ----------------------------- Notifications & audit ----------------------------- */

export async function myNotifications(ctx: Ctx) {
  const rows = await ctx.store.find(
    'notifications',
    { personId: ctx.actor! },
    { orderBy: ['-createdAt'], limit: 50 },
  );
  return rows.map((n) => ({
    id: n.id,
    text: n.message,
    link: n.linkPath ?? '/',
    createdAt: n.createdAt,
    read: n.readFlag,
  }));
}
export async function markRead(ctx: Ctx, id?: number) {
  await ctx.store.update(
    'notifications',
    id ? { id, personId: ctx.actor! } : { personId: ctx.actor!, readFlag: false },
    { readFlag: true },
  );
}

export async function auditLog(ctx: Ctx, q: string) {
  const dir = await requireRole(ctx, 'HR_ADMIN');
  const rows = await ctx.store.find('audit', {}, { orderBy: ['-loggedAt'], limit: 500 });
  const needle = q.trim().toLowerCase();
  return rows
    .map((a) => ({
      id: a.id,
      at: a.loggedAt,
      byName: nameOf(dir, a.personId) ?? 'System',
      action: a.action,
      entity: a.entityType,
      ref: a.entityRef ?? '',
    }))
    .filter((a) => !needle || `${a.byName} ${a.action} ${a.entity} ${a.ref}`.toLowerCase().includes(needle));
}
