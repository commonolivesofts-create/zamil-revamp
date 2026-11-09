// Employee sync: upsert from Fusion, deactivate people missing from a full extract, refuse an
// extract that would deactivate too many (a broken report must not empty the directory).
import type { SyncRun } from '@traininghub/shared';
import { audit, invalidateDirectory, nowIso, today, type Ctx } from '../../domain/ctx';
import type { EmployeeSource } from './employees';

export async function syncEmployees(ctx: Ctx, source: EmployeeSource, opts: { force?: boolean } = {}) {
  const startedAt = nowIso(ctx);
  const run = await ctx.store.insert('syncRuns', { kind: 'EMPLOYEES', statusCode: 'RUNNING', startedAt });
  const finish = async (statusCode: string, counts: Partial<SyncRun>, message: string) => {
    await ctx.store.update(
      'syncRuns',
      { id: run.id },
      { statusCode, finishedAt: nowIso(ctx), message: message.slice(0, 4000), ...counts },
    );
    return { id: run.id, statusCode, message, ...counts };
  };
  try {
    const { rows, report, skipped } = await source.fetchEmployees(today(ctx));
    const existing = await ctx.store.find('employees');
    const byId = new Map(existing.map((e) => [e.personId, e]));
    const seen = new Set(rows.map((r) => r.personId));
    const activeBefore = existing.filter((e) => e.activeFlag).length;
    const toDeactivate = existing.filter((e) => e.activeFlag && !seen.has(e.personId));
    const dropShare = activeBefore ? toDeactivate.length / activeBefore : 0;
    if (!rows.length && activeBefore)
      return finish('FAILED', { rowsRead: 0 }, `${report} returned no employees — nothing changed.`);
    if (dropShare > ctx.config.fusion.maxDrop && !opts.force)
      return finish(
        'BLOCKED',
        { rowsRead: rows.length },
        `${report} would deactivate ${toDeactivate.length} of ${activeBefore} active employees (${Math.round(dropShare * 100)}%). Check the report, or run the sync with force.`,
      );
    let inserted = 0;
    let updated = 0;
    const at = nowIso(ctx);
    await ctx.store.tx(async () => {
      for (const r of rows) {
        const row = {
          personId: r.personId,
          personNumber: r.personNumber,
          fullName: r.fullName,
          email: r.email,
          mobile: r.mobile,
          buCode: r.buCode,
          jobName: r.jobName,
          departmentName: r.departmentName,
          positionName: r.positionName,
          gradeName: r.gradeName,
          locationCode: r.locationCode,
          assignmentId: r.assignmentId,
          supervisorPersonId: r.supervisorPersonId,
          activeFlag: r.active,
          syncedAt: at,
        };
        const cur = byId.get(r.personId);
        if (!cur) {
          await ctx.store.insert('employees', row);
          inserted++;
          continue;
        }
        const changed = (Object.keys(row) as (keyof typeof row)[]).some(
          (k) => k !== 'syncedAt' && cur[k] !== row[k],
        );
        await ctx.store.update('employees', { personId: r.personId }, changed ? row : { syncedAt: at });
        if (changed) updated++;
      }
      for (const e of toDeactivate)
        await ctx.store.update('employees', { personId: e.personId }, { activeFlag: false, syncedAt: at });
      await bootstrapAdmins(ctx);
      await audit(
        { ...ctx },
        `Employee sync: ${inserted} new, ${updated} changed, ${toDeactivate.length} deactivated`,
        'SYNC',
        report,
      );
    });
    invalidateDirectory(ctx);
    return finish(
      'SUCCESS',
      { rowsRead: rows.length, inserted, updated, deactivated: toDeactivate.length },
      `${rows.length} employees from ${report}${skipped ? ` (${skipped} rows without id/number/name skipped)` : ''}.`,
    );
  } catch (e) {
    ctx.log.error({ err: e }, 'employee sync failed');
    return finish('FAILED', {}, (e as Error).message);
  }
}

/** BOOTSTRAP_ADMINS person numbers become System + HR admins while no System admin exists. */
export async function bootstrapAdmins(ctx: Ctx) {
  if (await ctx.store.count('userRoles', { roleCode: 'SYS_ADMIN' })) return;
  for (const num of ctx.config.bootstrapAdmins) {
    const e = await ctx.store.one('employees', { personNumber: num });
    if (!e) continue;
    for (const roleCode of ['SYS_ADMIN', 'HR_ADMIN'])
      await ctx.store.upsert('userRoles', ['personId', 'roleCode'], {
        personId: e.personId,
        roleCode,
        grantedAt: nowIso(ctx),
      });
  }
  invalidateDirectory(ctx);
}

export async function syncRuns(ctx: Ctx): Promise<SyncRun[]> {
  const rows = await ctx.store.find('syncRuns', {}, { orderBy: ['-startedAt'], limit: 20 });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.statusCode,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    rowsRead: r.rowsRead,
    inserted: r.inserted,
    updated: r.updated,
    deactivated: r.deactivated,
    message: r.message ?? '',
  }));
}
