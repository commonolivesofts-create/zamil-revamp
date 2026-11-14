// FR-APR-01 approval step editor (OQ-01 proposal, D-37). Same contract as the API.
import {
  APPROVER_ROLES,
  approvalRuleCreateSchema,
  approvalRuleUpdateSchema,
  type ApprovalChain,
  type ApprovalRuleDto,
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
import { applyServerErrors } from '../../lib/form-errors';
import { useCreateApprovalRule, useUpdateApprovalRule } from './hooks';

interface FormValues {
  seq: number;
  stepName: string;
  approverSource: ApprovalRuleDto['approverSource'];
  roleCode: string;
  conditionType: ApprovalRuleDto['conditionType'];
  conditionAmountSar: string;
  isAuditStep: boolean;
  active: boolean;
}

const FIELDS = [
  'seq',
  'stepName',
  'approverSource',
  'roleCode',
  'conditionType',
  'conditionAmountSar',
  'isAuditStep',
  'active',
] as const;

function toForm(rule: ApprovalRuleDto | null, nextSeq: number): FormValues {
  return {
    seq: rule?.seq ?? nextSeq,
    stepName: rule?.stepName ?? '',
    approverSource: rule?.approverSource ?? 'ROLE',
    roleCode: rule?.roleCode ?? '',
    conditionType: rule?.conditionType ?? 'ALWAYS',
    conditionAmountSar: rule?.conditionAmountSar ?? '',
    isAuditStep: rule?.isAuditStep ?? false,
    active: rule?.active ?? true,
  };
}

export function ApprovalRuleDrawer({
  open,
  onOpenChange,
  chain,
  rule,
  nextSeq,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chain: ApprovalChain;
  rule: ApprovalRuleDto | null;
  nextSeq: number;
}) {
  const { t } = useTranslation();
  const create = useCreateApprovalRule();
  const update = useUpdateApprovalRule();
  const { register, control, watch, handleSubmit, setError, reset, formState } =
    useForm<FormValues>({
      defaultValues: toForm(rule, nextSeq),
    });
  const source = watch('approverSource');
  const condition = watch('conditionType');

  useEffect(() => {
    if (open) reset(toForm(rule, nextSeq));
  }, [open, rule, nextSeq, reset]);

  const onSubmit = handleSubmit(async (v) => {
    const payload = {
      seq: Number(v.seq),
      stepName: v.stepName,
      approverSource: v.approverSource,
      roleCode: v.approverSource === 'ROLE' ? v.roleCode || null : null,
      conditionType: v.conditionType,
      conditionAmountSar:
        v.conditionType === 'TOTAL_GT' ? v.conditionAmountSar.trim() || null : null,
      isAuditStep: v.isAuditStep,
      active: v.active,
    };
    const parsed = rule
      ? approvalRuleUpdateSchema.safeParse({ ...payload, version: rule.version })
      : approvalRuleCreateSchema.safeParse({ ...payload, chainCode: chain });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        setError(String(issue.path[0]) as keyof FormValues, { message: issue.message });
      }
      return;
    }
    try {
      if (rule) {
        await update.mutateAsync({
          ruleId: rule.ruleId,
          body: parsed.data as Parameters<typeof update.mutateAsync>[0]['body'],
        });
        toast.success(t('approvalRules.updated'));
      } else {
        await create.mutateAsync(parsed.data as Parameters<typeof create.mutateAsync>[0]);
        toast.success(t('approvalRules.created'));
      }
      onOpenChange(false);
    } catch (err) {
      if (applyServerErrors(err, setError, FIELDS)) return;
      toast.error(
        err instanceof ApiError && err.code === 'VERSION_CONFLICT'
          ? t('setup.conflict')
          : (err as Error).message,
      );
    }
  });

  const err = (name: keyof FormValues) => formState.errors[name]?.message;
  const pending = create.isPending || update.isPending;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={
        rule
          ? t('approvalRules.editTitle', { name: rule.stepName })
          : t('approvalRules.newTitle', { chain: t(`approvalRules.chains.${chain}`) })
      }
      description={t('approvalRules.drawerBody')}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('setup.cancel')}
          </Button>
          <Button type="submit" form="approval-rule-form" loading={pending}>
            {pending ? t('setup.saving') : t('setup.save')}
          </Button>
        </>
      }
    >
      <form id="approval-rule-form" noValidate onSubmit={onSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[6rem_1fr]">
          <Field label={t('approvalRules.seq')} error={err('seq')}>
            <Input type="number" min={1} max={99} {...register('seq', { valueAsNumber: true })} />
          </Field>
          <Field label={t('approvalRules.stepName')} error={err('stepName')}>
            <Input {...register('stepName')} />
          </Field>
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-medium">{t('approvalRules.approverSource')}</span>
          <Controller
            control={control}
            name="approverSource"
            render={({ field }) => (
              <Segmented
                label={t('approvalRules.approverSource')}
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: 'SUPERVISOR', label: t('approvalRules.supervisor') },
                  { value: 'SUPERVISOR_HIERARCHY', label: t('approvalRules.hierarchy') },
                  { value: 'ROLE', label: t('approvalRules.role') },
                ]}
              />
            )}
          />
          {source === 'ROLE' && (
            <Field label={t('approvalRules.roleCode')} error={err('roleCode')}>
              <Select {...register('roleCode')}>
                <option value="">—</option>
                {APPROVER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {t(`roles.${role}`)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        <div className="space-y-2">
          <span className="block text-sm font-medium">{t('approvalRules.conditionType')}</span>
          <Controller
            control={control}
            name="conditionType"
            render={({ field }) => (
              <Segmented
                label={t('approvalRules.conditionType')}
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: 'ALWAYS', label: t('approvalRules.always') },
                  { value: 'TOTAL_GT', label: t('approvalRules.totalGt') },
                ]}
              />
            )}
          />
          {condition === 'TOTAL_GT' && (
            <Field
              label={t('approvalRules.conditionAmount')}
              error={err('conditionAmountSar')}
              hint={t('approvalRules.conditionAmountHint')}
            >
              <Input inputMode="decimal" className="tabular" {...register('conditionAmountSar')} />
            </Field>
          )}
        </div>

        <div className="divide-y divide-border rounded-card border border-border">
          {(
            [
              ['isAuditStep', t('approvalRules.isAuditStep')],
              ['active', t('setup.active')],
            ] as const
          ).map(([name, label]) => (
            <Controller
              key={name}
              control={control}
              name={name}
              render={({ field }) => (
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <label htmlFor={`ar-${name}`} className="text-sm">
                      {label}
                    </label>
                    <Switch
                      id={`ar-${name}`}
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </div>
                  {err(name) && <p className="mt-1 text-xs font-medium text-block">{err(name)}</p>}
                </div>
              )}
            />
          ))}
        </div>
      </form>
    </Drawer>
  );
}
