// FR-POL-01 expense-type editor. Validation = the shared contract (same rules as the API).
import {
  EXPENSE_CATEGORIES,
  EXPENSE_TYPE_ICONS,
  expenseTypeCreateSchema,
  expenseTypeUpdateSchema,
  type ExpenseTypeDto,
} from '@expensehub/shared';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Drawer } from '../../components/ui/Drawer';
import { Field } from '../../components/ui/Field';
import { Input } from '../../components/ui/Input';
import { Segmented } from '../../components/ui/Segmented';
import { Select } from '../../components/ui/Select';
import { Switch } from '../../components/ui/Switch';
import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { EXPENSE_ICONS } from '../../lib/expense-icons';
import { applyServerErrors } from '../../lib/form-errors';
import { useAccounts, useCreateExpenseType, useUpdateExpenseType } from './hooks';

type ReceiptRule = 'never' | 'always' | 'above';

interface FormValues {
  typeCode: string;
  name: string;
  nameAr: string;
  category: ExpenseTypeDto['category'];
  naturalAccount: string;
  defaultLimitSar: string;
  limitAction: ExpenseTypeDto['limitAction'];
  receiptRule: ReceiptRule;
  receiptOverSar: string;
  justificationReq: boolean;
  attendeesReq: boolean;
  vatEligible: boolean;
  unitRateSar: string;
  icon: ExpenseTypeDto['icon'];
  sortOrder: number;
  isPlaceholder: boolean;
  active: boolean;
}

const FIELDS = [
  'typeCode',
  'name',
  'nameAr',
  'category',
  'naturalAccount',
  'defaultLimitSar',
  'limitAction',
  'receiptOverSar',
  'justificationReq',
  'attendeesReq',
  'vatEligible',
  'unit',
  'unitRateSar',
  'icon',
  'sortOrder',
  'isPlaceholder',
  'active',
] as const;

function toForm(t: ExpenseTypeDto | null): FormValues {
  return {
    typeCode: t?.typeCode ?? '',
    name: t?.name ?? '',
    nameAr: t?.nameAr ?? '',
    category: t?.category ?? 'STANDARD',
    naturalAccount: t?.naturalAccount ?? '',
    defaultLimitSar: t?.defaultLimitSar ?? '',
    limitAction: t?.limitAction ?? 'WARN',
    receiptRule:
      t?.receiptOverSar === null || t?.receiptOverSar === undefined
        ? t
          ? 'never'
          : 'always'
        : Number(t.receiptOverSar) === 0
          ? 'always'
          : 'above',
    receiptOverSar: t?.receiptOverSar && Number(t.receiptOverSar) > 0 ? t.receiptOverSar : '',
    justificationReq: t?.justificationReq ?? false,
    attendeesReq: t?.attendeesReq ?? false,
    vatEligible: t?.vatEligible ?? true,
    unitRateSar: t?.unitRateSar ?? '',
    icon: t?.icon ?? 'receipt',
    sortOrder: t?.sortOrder ?? 100,
    isPlaceholder: t?.isPlaceholder ?? false,
    active: t?.active ?? true,
  };
}

function toPayload(v: FormValues) {
  const unit = v.category === 'MILEAGE' ? 'KM' : null;
  return {
    name: v.name,
    nameAr: v.nameAr.trim() || null,
    category: v.category,
    naturalAccount: v.naturalAccount,
    defaultLimitSar: v.defaultLimitSar.trim() || null,
    limitAction: v.limitAction,
    receiptOverSar:
      v.receiptRule === 'never' ? null : v.receiptRule === 'always' ? '0' : v.receiptOverSar.trim(),
    justificationReq: v.justificationReq,
    attendeesReq: v.attendeesReq,
    vatEligible: v.vatEligible,
    unit,
    unitRateSar: v.category === 'MILEAGE' ? v.unitRateSar.trim() || null : null,
    icon: v.icon,
    sortOrder: Number(v.sortOrder),
    isPlaceholder: v.isPlaceholder,
    active: v.active,
  };
}

export function ExpenseTypeDrawer({
  open,
  onOpenChange,
  type,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create. */
  type: ExpenseTypeDto | null;
}) {
  const { t } = useTranslation();
  const accounts = useAccounts();
  const create = useCreateExpenseType();
  const update = useUpdateExpenseType();
  const form = useForm<FormValues>({ defaultValues: toForm(type) });
  const { register, control, watch, handleSubmit, setError, reset, formState } = form;
  const category = watch('category');
  const receiptRule = watch('receiptRule');

  useEffect(() => {
    if (open) reset(toForm(type));
  }, [open, type, reset]);

  const onSubmit = handleSubmit(async (values) => {
    const payload = toPayload(values);
    const parsed = type
      ? expenseTypeUpdateSchema.safeParse({ ...payload, version: type.version })
      : expenseTypeCreateSchema.safeParse({ ...payload, typeCode: values.typeCode });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = String(issue.path[0] ?? '');
        const field =
          path === 'unit' ? 'category' : path === 'receiptOverSar' ? 'receiptOverSar' : path;
        setError(field as keyof FormValues, { message: issue.message });
      }
      return;
    }
    try {
      if (type) {
        await update.mutateAsync({
          typeId: type.typeId,
          body: parsed.data as Parameters<typeof update.mutateAsync>[0]['body'],
        });
        toast.success(t('expenseTypes.updated'));
      } else {
        await create.mutateAsync(parsed.data as Parameters<typeof create.mutateAsync>[0]);
        toast.success(t('expenseTypes.created'));
      }
      onOpenChange(false);
    } catch (err) {
      if (applyServerErrors(err, setError, FIELDS)) return;
      toast.error(
        err instanceof ApiError && err.code === 'VERSION_CONFLICT'
          ? t('setup.conflict')
          : String((err as Error).message),
      );
    }
  });

  const err = (name: keyof FormValues) => formState.errors[name]?.message;
  const pending = create.isPending || update.isPending;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={type ? t('expenseTypes.editTitle', { name: type.name }) : t('expenseTypes.newTitle')}
      description={t('expenseTypes.drawerBody')}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('setup.cancel')}
          </Button>
          <Button type="submit" form="expense-type-form" loading={pending}>
            {pending ? t('setup.saving') : t('setup.save')}
          </Button>
        </>
      }
    >
      <form id="expense-type-form" noValidate onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('expenseTypes.name')} error={err('name')}>
            <Input {...register('name')} />
          </Field>
          <Field
            label={t('expenseTypes.code')}
            error={err('typeCode')}
            hint={type ? undefined : t('expenseTypes.codeHint')}
          >
            <Input {...register('typeCode')} disabled={!!type} className="font-mono uppercase" />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">{t('expenseTypes.icon')}</legend>
          <Controller
            control={control}
            name="icon"
            render={({ field }) => (
              <div
                role="radiogroup"
                aria-label={t('expenseTypes.icon')}
                className="grid grid-cols-6 gap-1.5 sm:grid-cols-9"
              >
                {EXPENSE_TYPE_ICONS.map((name) => {
                  const Icon = EXPENSE_ICONS[name];
                  const selected = field.value === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={name}
                      title={name}
                      onClick={() => field.onChange(name)}
                      className={cn(
                        'grid aspect-square place-items-center rounded-input border transition-colors',
                        selected
                          ? 'border-brand bg-brand/10 text-brand-solid dark:text-brand'
                          : 'border-border text-muted hover:text-ink',
                      )}
                    >
                      <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
                    </button>
                  );
                })}
              </div>
            )}
          />
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('expenseTypes.category')} error={err('category')}>
            <Select {...register('category')}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`expenseTypes.categories.${c}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('expenseTypes.naturalAccount')} error={err('naturalAccount')}>
            <Select {...register('naturalAccount')}>
              <option value="">—</option>
              {accounts.data?.items
                .filter((a) => a.value.startsWith('5'))
                .map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.value} · {a.description}
                  </option>
                ))}
            </Select>
          </Field>
        </div>

        {category === 'MILEAGE' && (
          <Field label={t('expenseTypes.unitRate')} error={err('unitRateSar')}>
            <Input inputMode="decimal" className="tabular" {...register('unitRateSar')} />
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('expenseTypes.limit')}
            error={err('defaultLimitSar')}
            hint={t('expenseTypes.limitActionHint')}
          >
            <Input
              inputMode="decimal"
              placeholder={t('expenseTypes.noLimit')}
              className="tabular"
              {...register('defaultLimitSar')}
            />
          </Field>
          <div className="space-y-1.5">
            <span className="block text-sm font-medium" id="limit-action-label">
              {t('expenseTypes.limitAction')}
            </span>
            <Controller
              control={control}
              name="limitAction"
              render={({ field }) => (
                <Segmented
                  label={t('expenseTypes.limitAction')}
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: 'WARN', label: t('expenseTypes.actions.WARN') },
                    { value: 'BLOCK', label: t('expenseTypes.actions.BLOCK') },
                  ]}
                />
              )}
            />
          </div>
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-medium">{t('expenseTypes.receiptRule')}</span>
          <Controller
            control={control}
            name="receiptRule"
            render={({ field }) => (
              <Segmented
                label={t('expenseTypes.receiptRule')}
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: 'always', label: t('expenseTypes.receiptAlways') },
                  { value: 'above', label: t('expenseTypes.receiptAbove') },
                  { value: 'never', label: t('expenseTypes.receiptNever') },
                ]}
              />
            )}
          />
          {receiptRule === 'above' && (
            <Field label={t('expenseTypes.receiptAboveAmount')} error={err('receiptOverSar')}>
              <Input inputMode="decimal" className="tabular" {...register('receiptOverSar')} />
            </Field>
          )}
        </div>

        <div className="divide-y divide-border rounded-card border border-border">
          {(
            [
              ['justificationReq', t('expenseTypes.justificationReq')],
              ['attendeesReq', t('expenseTypes.attendeesReq')],
              ['vatEligible', t('expenseTypes.vatEligible')],
              ['isPlaceholder', t('expenseTypes.isPlaceholder')],
              ['active', t('setup.active')],
            ] as const
          ).map(([name, label]) => (
            <Controller
              key={name}
              control={control}
              name={name}
              render={({ field }) => (
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <label htmlFor={`et-${name}`} className="text-sm">
                    {label}
                  </label>
                  <Switch
                    id={`et-${name}`}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </div>
              )}
            />
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('expenseTypes.sortOrder')} error={err('sortOrder')}>
            <Input
              type="number"
              min={0}
              max={9999}
              {...register('sortOrder', { valueAsNumber: true })}
            />
          </Field>
          <Field label={t('expenseTypes.nameAr')} error={err('nameAr')}>
            <Input dir="rtl" lang="ar" {...register('nameAr')} />
          </Field>
        </div>
      </form>
    </Drawer>
  );
}
