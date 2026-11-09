// FR-APR-01 approval chains: STANDARD (OQ-01 proposal) and the CEO's own claims (D-37).
import { APPROVAL_CHAINS, type ApprovalChain, type ApprovalRuleDto } from '@expensehub/shared';
import { ChevronRight, Info, Pencil, Plus, UserRound, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tag } from '../../components/ui/Tag';
import { cn } from '../../lib/cn';
import { formatSar } from '../../lib/format';
import { ApprovalRuleDrawer } from './ApprovalRuleDrawer';
import { useApprovalRules, useOptions } from './hooks';

export function ApprovalRulesPage() {
  const { t } = useTranslation();
  const rules = useApprovalRules();
  const options = useOptions();
  const [drawer, setDrawer] = useState<{
    chain: ApprovalChain;
    rule: ApprovalRuleDto | null;
  } | null>(null);

  const ceoThreshold =
    options.data?.items.find((o) => o.optionKey === 'CEO_THRESHOLD_SAR' && o.businessUnit === '*')
      ?.optionValue ?? null;

  const conditionText = (rule: ApprovalRuleDto) =>
    rule.conditionType === 'ALWAYS'
      ? t('approvalRules.conditionAlways')
      : t('approvalRules.conditionAbove', {
          amount: rule.conditionAmountSar
            ? formatSar(rule.conditionAmountSar)
            : t('approvalRules.thresholdOption', {
                amount: ceoThreshold ? formatSar(Number(ceoThreshold).toFixed(2)) : '…',
              }),
        });

  const approverText = (rule: ApprovalRuleDto) =>
    rule.approverSource === 'SUPERVISOR'
      ? t('approvalRules.supervisor')
      : rule.approverSource === 'SUPERVISOR_HIERARCHY'
        ? t('approvalRules.hierarchy')
        : t(`roles.${rule.roleCode!}`);

  if (rules.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 text-sm text-muted">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
        {t('approvalRules.selfApproval')}
      </p>

      {APPROVAL_CHAINS.map((chain) => {
        const steps = (rules.data?.items ?? []).filter((r) => r.chainCode === chain);
        const active = steps.filter((s) => s.active);
        return (
          <Card key={chain} className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2 className="font-semibold">{t(`approvalRules.chains.${chain}`)}</h2>
                <p className="text-sm text-muted">{t(`approvalRules.chainHints.${chain}`)}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDrawer({ chain, rule: null })}
              >
                <Plus aria-hidden />
                {t('approvalRules.addStep')}
              </Button>
            </div>

            {/* The chain at a glance. */}
            <ol className="flex flex-wrap items-center gap-2 bg-surface-2/40 px-5 py-4">
              {active.map((step, index) => (
                <li key={step.ruleId} className="flex items-center gap-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-sm font-medium',
                      step.isAuditStep
                        ? 'border-brand/40 bg-brand/10 text-brand-solid dark:text-brand'
                        : 'border-border bg-surface',
                    )}
                  >
                    <span className="grid size-5 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold text-muted">
                      {index + 1}
                    </span>
                    {step.stepName}
                    {step.conditionType === 'TOTAL_GT' && (
                      <span className="text-xs font-normal text-muted">
                        &gt;{' '}
                        {step.conditionAmountSar
                          ? formatSar(step.conditionAmountSar)
                          : ceoThreshold
                            ? formatSar(Number(ceoThreshold).toFixed(2))
                            : '…'}
                      </span>
                    )}
                  </span>
                  {index < active.length - 1 && (
                    <ChevronRight aria-hidden className="size-4 text-muted rtl:rotate-180" />
                  )}
                </li>
              ))}
            </ol>

            <ul className="divide-y divide-border">
              {steps.map((step) => (
                <li
                  key={step.ruleId}
                  className={cn(
                    'flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3',
                    !step.active && 'opacity-60',
                  )}
                >
                  <span className="w-6 text-sm font-semibold text-muted tabular">{step.seq}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{step.stepName}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      {step.approverSource !== 'ROLE' ? (
                        <Users aria-hidden className="size-3.5" />
                      ) : (
                        <UserRound aria-hidden className="size-3.5" />
                      )}
                      {approverText(step)} · {conditionText(step)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    {step.isAuditStep && <Tag tone="info">{t('approvalRules.auditTag')}</Tag>}
                    {step.active ? (
                      <Tag tone="pass">{t('setup.active')}</Tag>
                    ) : (
                      <Tag>{t('setup.inactive')}</Tag>
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`${t('setup.edit')} ${step.stepName}`}
                    onClick={() => setDrawer({ chain, rule: step })}
                  >
                    <Pencil aria-hidden />
                    {t('setup.edit')}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}

      <ApprovalRuleDrawer
        open={drawer !== null}
        onOpenChange={(open) => !open && setDrawer(null)}
        chain={drawer?.chain ?? 'STANDARD'}
        rule={drawer?.rule ?? null}
        nextSeq={
          Math.max(
            0,
            ...(rules.data?.items ?? [])
              .filter((r) => r.chainCode === drawer?.chain)
              .map((r) => r.seq),
          ) + 1
        }
      />
    </div>
  );
}
