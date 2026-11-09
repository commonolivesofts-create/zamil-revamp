// FR-SET-04 role assignment per user and BU (OQ-02 proposal: assigned here, with backups).
import {
  ASSIGNABLE_ROLES,
  BUSINESS_UNITS,
  roleAssignmentCreateSchema,
  type AssignableRole,
  type EmployeeRef,
  type RoleAssignmentDto,
} from '@expensehub/shared';
import { Search, UserPlus, X } from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Drawer } from '../../components/ui/Drawer';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { Switch } from '../../components/ui/Switch';
import { Tag } from '../../components/ui/Tag';
import { cn } from '../../lib/cn';
import { formatDate } from '../../lib/format';
import { useCurrentUser } from '../../lib/session';
import { useAssignRole, useEmployeeSearch, useEndRole, useRoleAssignments } from './hooks';

function todayRiyadh(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
}

export function RolesPage() {
  const { t } = useTranslation();
  const me = useCurrentUser();
  const assignments = useRoleAssignments();
  const endRole = useEndRole();
  const [showEnded, setShowEnded] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [ending, setEnding] = useState<RoleAssignmentDto | null>(null);

  const visible = (assignments.data?.items ?? []).filter(
    (a) => showEnded || a.current || a.startDate > todayRiyadh(),
  );

  const confirmEnd = async () => {
    if (!ending) return;
    try {
      await endRole.mutateAsync(ending.assignmentId);
      toast.success(t('rolesPage.endedToast'));
      setEnding(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t('rolesPage.description')}</p>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-muted" htmlFor="show-ended">
            <Switch id="show-ended" checked={showEnded} onCheckedChange={setShowEnded} />
            {t('rolesPage.showEnded')}
          </label>
          <Button onClick={() => setAssignOpen(true)}>
            <UserPlus aria-hidden />
            {t('rolesPage.assign')}
          </Button>
        </div>
      </div>

      {assignments.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {ASSIGNABLE_ROLES.map((role) => {
            const holders = visible.filter((a) => a.roleCode === role);
            return (
              <Card key={role} className="overflow-hidden">
                <h2 className="flex items-center justify-between border-b border-border px-5 py-3 font-semibold">
                  {t(`roles.${role}`)}
                  <span className="text-xs font-normal text-muted tabular">{holders.length}</span>
                </h2>
                {holders.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted">{t('rolesPage.empty')}</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {holders.map((a) => (
                      <li
                        key={a.assignmentId}
                        className={cn(
                          'flex items-center gap-3 px-5 py-3',
                          !a.current && 'opacity-60',
                        )}
                      >
                        <Avatar name={a.fullName} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{a.fullName}</p>
                          <p className="text-xs text-muted">
                            {a.personNumber} ·{' '}
                            {a.endDate
                              ? t('rolesPage.periodEnd', {
                                  start: formatDate(a.startDate),
                                  end: formatDate(a.endDate),
                                })
                              : t('rolesPage.period', { start: formatDate(a.startDate) })}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                          <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                            {a.businessUnit ?? t('common.allUnits')}
                          </span>
                          {a.isBackup && <Tag>{t('common.backup')}</Tag>}
                          {!a.current && <Tag>{t('rolesPage.ended')}</Tag>}
                        </div>
                        {/* SoD: nobody ends their own roles (the API refuses it too). */}
                        {a.current && a.personId !== me.user.personId && (
                          <Button variant="ghost" size="sm" onClick={() => setEnding(a)}>
                            {t('rolesPage.end')}
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <AssignDrawer open={assignOpen} onOpenChange={setAssignOpen} />
      <ConfirmDialog
        open={ending !== null}
        onOpenChange={(open) => !open && setEnding(null)}
        title={t('rolesPage.end')}
        body={
          ending
            ? t('rolesPage.endConfirm', {
                name: ending.fullName,
                role: t(`roles.${ending.roleCode}`),
              })
            : undefined
        }
        confirmLabel={t('rolesPage.end')}
        pending={endRole.isPending}
        onConfirm={() => void confirmEnd()}
      />
    </>
  );
}

function AssignDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const assign = useAssignRole();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const search = useEmployeeSearch(deferred);
  const [employee, setEmployee] = useState<EmployeeRef | null>(null);
  const [role, setRole] = useState<AssignableRole>('APPROVER_HR');
  const [bu, setBu] = useState('');
  const [isBackup, setIsBackup] = useState(false);
  const [startDate, setStartDate] = useState(todayRiyadh());
  const [endDate, setEndDate] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setEmployee(null);
    setRole('APPROVER_HR');
    setBu('');
    setIsBackup(false);
    setStartDate(todayRiyadh());
    setEndDate('');
    setErrors({});
  }, [open]);

  const submit = async () => {
    const parsed = roleAssignmentCreateSchema.safeParse({
      personId: employee?.personId ?? 0,
      roleCode: role,
      businessUnit: bu || null,
      isBackup,
      startDate,
      endDate: endDate || null,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    try {
      await assign.mutateAsync(parsed.data);
      toast.success(t('rolesPage.assigned'));
      onOpenChange(false);
    } catch (err) {
      setErrors({ form: (err as Error).message });
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={t('rolesPage.assignTitle')}
      description={t('rolesPage.assignBody')}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('setup.cancel')}
          </Button>
          <Button loading={assign.isPending} onClick={() => void submit()}>
            {t('rolesPage.assign')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {errors.form && (
          <p role="alert" className="rounded-input bg-block/10 px-3 py-2 text-sm text-block">
            {errors.form}
          </p>
        )}

        {employee ? (
          <div className="space-y-1.5">
            <span className="block text-sm font-medium">{t('rolesPage.employee')}</span>
            <div className="flex items-center gap-3 rounded-input border border-border px-3 py-2">
              <Avatar name={employee.fullName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{employee.fullName}</p>
                <p className="truncate text-xs text-muted">
                  {employee.personNumber} · {employee.jobName} · {employee.businessUnit}
                </p>
              </div>
              <button
                type="button"
                aria-label={t('common.close')}
                onClick={() => setEmployee(null)}
                className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          </div>
        ) : (
          <Field
            label={t('rolesPage.employee')}
            error={errors.personId ? t('rolesPage.searchEmployee') : undefined}
          >
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('rolesPage.searchEmployee')}
                className="ps-9"
              />
            </div>
          </Field>
        )}
        {!employee && (
          <ul className="-mt-3 max-h-64 overflow-y-auto rounded-input border border-border">
            {(search.data?.items ?? []).length === 0 ? (
              <li className="px-3 py-3 text-sm text-muted">{t('rolesPage.noResults')}</li>
            ) : (
              search.data?.items.map((e) => (
                <li key={e.personId}>
                  <button
                    type="button"
                    onClick={() => setEmployee(e)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-start hover:bg-surface-2"
                  >
                    <Avatar name={e.fullName} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{e.fullName}</span>
                      <span className="block truncate text-xs text-muted">
                        {e.personNumber} · {e.jobName} · {e.businessUnit}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('rolesPage.role')} error={errors.roleCode}>
            <Select value={role} onChange={(e) => setRole(e.target.value as AssignableRole)}>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('rolesPage.businessUnit')} error={errors.businessUnit}>
            <Select value={bu} onChange={(e) => setBu(e.target.value)}>
              <option value="">{t('rolesPage.allUnits')}</option>
              {BUSINESS_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('rolesPage.startDate')} error={errors.startDate}>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label={t('rolesPage.endDate')} error={errors.endDate}>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <div className="flex items-center justify-between rounded-card border border-border px-4 py-3">
          <label htmlFor="assign-backup" className="text-sm">
            {t('rolesPage.backup')}
          </label>
          <Switch id="assign-backup" checked={isBackup} onCheckedChange={setIsBackup} />
        </div>
      </div>
    </Drawer>
  );
}
