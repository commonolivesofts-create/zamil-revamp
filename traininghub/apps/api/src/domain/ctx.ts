import type { Logger } from 'pino';
import type { RoleCode, SettingKey } from '@traininghub/shared';
import { SETTINGS } from '@traininghub/shared';
import type { AppConfig } from '../config';
import type { Store } from '../db/store';
import type { R } from '../db/tables';
import { riyadhDate, type Clock } from '../lib/dates';

/** Everything a service needs. One per HTTP request (actor set) or per job (actor null). */
export interface Ctx {
  store: Store;
  config: AppConfig;
  clock: Clock;
  log: Logger;
  actor: number | null;
}
export const nowIso = (ctx: Ctx) => ctx.clock().toISOString();
export const today = (ctx: Ctx) => riyadhDate(ctx.clock());

/* ----------------------------- Directory (cached) ----------------------------- */

export interface Person {
  personId: number;
  personNumber: string;
  fullName: string;
  email: string | null;
  jobName: string | null;
  department: string | null;
  buCode: string | null;
  managerId: number | null;
  active: boolean;
  positionId: number | null;
  positionSource: 'OVERRIDE' | 'JOB' | null;
  roles: RoleCode[];
  syncedAt: string | null;
}
export interface Directory {
  people: Map<number, Person>;
  byNumber: Map<string, Person>;
  reports: Map<number, number[]>;
  positions: Map<number, R<'positions'>>;
  roleHolders: Map<RoleCode, number[]>;
}

const cache = new WeakMap<Store, { at: number; dir: Promise<Directory> }>();
const TTL_MS = 60_000;

export function invalidateDirectory(ctx: Ctx) {
  cache.delete(ctx.store);
}

export function directory(ctx: Ctx): Promise<Directory> {
  const hit = cache.get(ctx.store);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return hit.dir;
  const dir = loadDirectory(ctx.store);
  cache.set(ctx.store, { at: now, dir });
  dir.catch(() => cache.delete(ctx.store));
  return dir;
}

async function loadDirectory(store: Store): Promise<Directory> {
  const [emps, ext, jobs, roles, positions] = await Promise.all([
    store.find('employees'),
    store.find('employeeExt'),
    store.find('positionJobs'),
    store.find('userRoles'),
    store.find('positions'),
  ]);
  const extMap = new Map(ext.map((e) => [e.personId, e.positionId]));
  const jobMap = new Map(jobs.map((j) => [j.jobName.toLowerCase(), j.positionId]));
  const roleMap = new Map<number, RoleCode[]>();
  const roleHolders = new Map<RoleCode, number[]>();
  for (const r of roles) {
    roleMap.set(r.personId, [...(roleMap.get(r.personId) ?? []), r.roleCode as RoleCode]);
    roleHolders.set(r.roleCode as RoleCode, [...(roleHolders.get(r.roleCode as RoleCode) ?? []), r.personId]);
  }
  const people = new Map<number, Person>();
  const byNumber = new Map<string, Person>();
  const reports = new Map<number, number[]>();
  for (const e of emps) {
    const override = extMap.get(e.personId);
    const byJob = e.jobName ? jobMap.get(e.jobName.toLowerCase()) : undefined;
    const p: Person = {
      personId: e.personId,
      personNumber: e.personNumber,
      fullName: e.fullName,
      email: e.email,
      jobName: e.jobName,
      department: e.departmentName,
      buCode: e.buCode,
      managerId: e.supervisorPersonId,
      active: e.activeFlag,
      positionId: override ?? byJob ?? null,
      positionSource: override != null ? 'OVERRIDE' : byJob != null ? 'JOB' : null,
      roles: roleMap.get(e.personId) ?? [],
      syncedAt: e.syncedAt,
    };
    people.set(p.personId, p);
    byNumber.set(p.personNumber, p);
    if (p.active && p.managerId) reports.set(p.managerId, [...(reports.get(p.managerId) ?? []), p.personId]);
  }
  return { people, byNumber, reports, positions: new Map(positions.map((p) => [p.id, p])), roleHolders };
}

export function hasRole(dir: Directory, personId: number, ...roles: RoleCode[]): boolean {
  const p = dir.people.get(personId);
  return !!p && (p.roles.includes('SYS_ADMIN') || roles.some((r) => p.roles.includes(r)));
}
export const isHrAdmin = (dir: Directory, id: number) => hasRole(dir, id, 'HR_ADMIN');

/** Direct and second-level reports (active only). */
export function teamOf(dir: Directory, managerId: number): number[] {
  const direct = dir.reports.get(managerId) ?? [];
  return [...direct, ...direct.flatMap((d) => dir.reports.get(d) ?? [])];
}
export function nameOf(dir: Directory, id: number | null | undefined): string | null {
  return id == null ? null : (dir.people.get(id)?.fullName ?? `#${id}`);
}

/* ----------------------------- Settings & rules ----------------------------- */

export async function settings(ctx: Ctx): Promise<Record<SettingKey, string>> {
  const rows = await ctx.store.find('settings');
  const out = Object.fromEntries(Object.entries(SETTINGS).map(([k, v]) => [k, v.def])) as Record<
    SettingKey,
    string
  >;
  for (const r of rows) if (r.settingKey in out) out[r.settingKey as SettingKey] = r.settingValue ?? '';
  return out;
}
export const settingInt = (s: Record<SettingKey, string>, k: SettingKey) => Number(s[k]) || 0;
export const settingFlag = (s: Record<SettingKey, string>, k: SettingKey) => s[k] === 'Y';

/* ----------------------------- Audit & notifications ----------------------------- */

export async function audit(
  ctx: Ctx,
  action: string,
  entityType: string,
  entityRef: string,
  details?: unknown,
) {
  await ctx.store.insert('audit', {
    loggedAt: nowIso(ctx),
    personId: ctx.actor,
    action: action.slice(0, 200),
    entityType,
    entityRef: entityRef.slice(0, 200),
    details: details === undefined ? null : JSON.stringify(details).slice(0, 4000),
  });
}

export async function notify(ctx: Ctx, personId: number | null | undefined, message: string, link: string) {
  if (!personId || personId === ctx.actor) return;
  await ctx.store.insert('notifications', {
    personId,
    message: message.slice(0, 500),
    linkPath: link,
    createdAt: nowIso(ctx),
    readFlag: false,
  });
}
