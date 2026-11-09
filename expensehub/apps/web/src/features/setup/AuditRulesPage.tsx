// FR-AUD-01 audit selection rules (OQ-33 proposal), edited in place.
import type { AuditRuleDto } from '@expensehub/shared';
import { Dices, FileWarning, Files, Receipt, Scale } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { Switch } from '../../components/ui/Switch';
import { ApiError } from '../../lib/api';
import { useAuditRules, useUpdateAuditRule } from './hooks';

const ICONS = {
  ANY_WARNING: FileWarning,
  MISSING_RECEIPT: Receipt,
  TOTAL_GT: Scale,
  RANDOM_PCT: Dices,
  DUPLICATE: Files,
} as const;

export function AuditRulesPage() {
  const { t } = useTranslation();
  const rules = useAuditRules();
  return (
    <>
      <p className="mb-4 text-sm text-muted">{t('auditRules.description')}</p>
      <Card className="divide-y divide-border">
        {rules.isPending
          ? Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="p-5">
                <Skeleton className="h-10 w-full" />
              </div>
            ))
          : rules.data?.items.map((rule) => (
              <AuditRuleRow key={`${rule.ruleCode}-${rule.version}`} rule={rule} />
            ))}
      </Card>
    </>
  );
}

function AuditRuleRow({ rule }: { rule: AuditRuleDto }) {
  const { t } = useTranslation();
  const update = useUpdateAuditRule();
  const [active, setActive] = useState(rule.active);
  const [param, setParam] = useState(rule.paramNumber === null ? '' : String(rule.paramNumber));
  const [error, setError] = useState<string | null>(null);
  const hasParam = rule.ruleCode === 'TOTAL_GT' || rule.ruleCode === 'RANDOM_PCT';
  const dirty = active !== rule.active || (hasParam && param !== String(rule.paramNumber ?? ''));
  const Icon = ICONS[rule.ruleCode];

  const save = async () => {
    setError(null);
    try {
      await update.mutateAsync({
        code: rule.ruleCode,
        body: { paramNumber: hasParam ? Number(param) : null, active, version: rule.version },
      });
      toast.success(t('auditRules.updated'));
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'VERSION_CONFLICT'
          ? t('setup.conflict')
          : (err as Error).message,
      );
    }
  };

  return (
    <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
      <span className="grid size-10 shrink-0 place-items-center rounded-input bg-surface-2 text-muted">
        <Icon aria-hidden className="size-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t(`auditRules.names.${rule.ruleCode}`)}</p>
        <p className="text-sm text-muted">{t(`auditRules.texts.${rule.ruleCode}`)}</p>
        {error && <p className="mt-1 text-xs font-medium text-block">{error}</p>}
      </div>
      <div className="flex items-center gap-3">
        {hasParam && (
          <div className="relative w-36">
            <Input
              aria-label={t(`auditRules.names.${rule.ruleCode}`)}
              inputMode="decimal"
              value={param}
              onChange={(e) => setParam(e.target.value)}
              className="pe-12 text-end tabular"
            />
            <span className="pointer-events-none absolute inset-y-0 end-3 grid place-items-center text-xs text-muted">
              {rule.ruleCode === 'TOTAL_GT' ? 'SAR' : '%'}
            </span>
          </div>
        )}
        <Switch checked={active} onCheckedChange={setActive} label={t('setup.active')} />
        <Button
          size="sm"
          variant={dirty ? 'primary' : 'secondary'}
          disabled={!dirty}
          loading={update.isPending}
          onClick={() => void save()}
        >
          {t('setup.save')}
        </Button>
      </div>
    </div>
  );
}
