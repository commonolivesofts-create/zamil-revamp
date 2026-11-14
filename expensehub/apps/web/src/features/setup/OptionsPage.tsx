// FR-SET-01 system options, grouped; account combinations per business unit (OQ-14 proposal).
import { BUSINESS_UNITS, type SystemOptionDto } from '@expensehub/shared';
import { Check } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Segmented } from '../../components/ui/Segmented';
import { Skeleton } from '../../components/ui/Skeleton';
import { Switch } from '../../components/ui/Switch';
import { ApiError } from '../../lib/api';
import { useOptions, useUpdateOption } from './hooks';

const GROUPS = [
  {
    id: 'general',
    keys: ['VAT_RATE', 'VAT_RECOVERY', 'RATE_TYPE', 'RATE_STALE_DAYS', 'TRIP_DATE_TOLERANCE_DAYS'],
  },
  {
    id: 'approvals',
    keys: ['APPROVAL_MAX_LEVELS', 'CEO_THRESHOLD_SAR', 'REMINDER_DAYS', 'ESCALATION_DAYS'],
  },
  {
    id: 'payables',
    keys: [
      'INVOICE_SEND_MODE',
      'ATTACH_RECEIPTS_TO_INVOICE',
      'TAX_CLASSIFICATION_CODE',
      'FUSION_INVOICE_TYPE',
      'FUSION_INVOICE_SOURCE',
      'FUSION_PAYMENT_METHOD',
      'FUSION_PAY_GROUP',
      'FUSION_PAYMENT_TERMS',
      'FUSION_INVOICE_DFF',
    ],
  },
  { id: 'sync', keys: ['TRIP_ABSENCE_TYPES', 'TRIP_DESTINATION_FIELD', 'QUICKPAY_ELEMENTS'] },
] as const;

const KNOWN = new Set<string>(GROUPS.flatMap((g) => g.keys));

function useSaveOption(option: SystemOptionDto) {
  const { t } = useTranslation();
  const update = useUpdateOption();
  const [error, setError] = useState<string | null>(null);
  const save = async (value: string) => {
    setError(null);
    try {
      await update.mutateAsync({
        key: option.optionKey,
        bu: option.businessUnit,
        optionValue: value,
        version: option.version,
      });
      toast.success(t('options.updated'));
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'VERSION_CONFLICT'
          ? t('setup.conflict')
          : (err as Error).message,
      );
    }
  };
  return { save, error, pending: update.isPending };
}

function OptionRow({ option }: { option: SystemOptionDto }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(option.optionValue);
  const { save, error, pending } = useSaveOption(option);
  const dirty = value !== option.optionValue;
  const id = `opt-${option.optionKey}`;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (dirty) void save(value);
  };

  const control =
    option.valueType === 'BOOL' ? (
      <Switch
        id={id}
        checked={value === 'Y'}
        onCheckedChange={(on) => {
          setValue(on ? 'Y' : 'N');
          void save(on ? 'Y' : 'N');
        }}
      />
    ) : option.optionKey === 'INVOICE_SEND_MODE' ? (
      <Segmented
        id={id}
        label={option.optionKey}
        value={value as 'MANUAL' | 'AUTO'}
        onChange={(v) => {
          setValue(v);
          void save(v);
        }}
        options={[
          { value: 'MANUAL', label: 'MANUAL' },
          { value: 'AUTO', label: 'AUTO' },
        ]}
      />
    ) : (
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          className={
            option.valueType === 'NUMBER' ? 'w-40 text-end tabular' : 'font-mono text-xs sm:w-80'
          }
        />
        {dirty && (
          <Button type="submit" size="sm" className="h-10" loading={pending}>
            {t('setup.save')}
          </Button>
        )}
      </div>
    );

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <label htmlFor={id} className="block font-mono text-sm font-medium">
          {option.optionKey}
        </label>
        <p className="text-sm text-muted">
          {option.description}
          {option.valueType === 'JSON' && ` · ${t('options.jsonHint')}`}
        </p>
        {error && <p className="mt-1 text-xs font-medium text-block">{error}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </form>
  );
}

function AccountCell({ option }: { option: SystemOptionDto | undefined }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(option?.optionValue ?? '');
  const { save, error, pending } = useSaveOption(option!);
  if (!option) return <td className="px-3 py-2 text-muted">—</td>;
  const dirty = value !== option.optionValue;
  return (
    <td className="px-3 py-2 align-top">
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) void save(value);
        }}
      >
        <Input
          aria-label={`${option.optionKey} ${option.businessUnit}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          className="h-9 min-w-56 font-mono text-xs"
        />
        {dirty && (
          <Button type="submit" size="icon" aria-label={t('setup.save')} loading={pending}>
            {!pending && <Check aria-hidden />}
          </Button>
        )}
      </form>
      {error && <p className="mt-1 text-xs font-medium text-block">{error}</p>}
    </td>
  );
}

export function OptionsPage() {
  const { t } = useTranslation();
  const options = useOptions();

  if (options.isPending) {
    return <Skeleton className="h-96 w-full" />;
  }
  const items = options.data?.items ?? [];
  const byKey = (key: string) => items.filter((o) => o.optionKey === key && o.businessUnit === '*');
  const accountKeys = [
    ...new Set(items.filter((o) => o.optionKey.startsWith('ACCT_')).map((o) => o.optionKey)),
  ];
  const others = items.filter((o) => !KNOWN.has(o.optionKey) && !o.optionKey.startsWith('ACCT_'));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">{t('options.description')}</p>
      {GROUPS.map((group) => (
        <Card key={group.id}>
          <h2 className="border-b border-border px-5 py-3 font-semibold">
            {t(`options.groups.${group.id}`)}
          </h2>
          <div className="divide-y divide-border">
            {group.keys.flatMap(byKey).map((o) => (
              <OptionRow key={`${o.optionKey}-${o.version}`} option={o} />
            ))}
            {group.id === 'general' &&
              others.map((o) => (
                <OptionRow key={`${o.optionKey}-${o.businessUnit}-${o.version}`} option={o} />
              ))}
          </div>
        </Card>
      ))}

      <Card className="overflow-hidden">
        <h2 className="border-b border-border px-5 py-3 font-semibold">
          {t('options.groups.accounts')}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2/50 text-xs font-medium uppercase tracking-wide text-muted">
                <th scope="col" className="px-5 py-2.5 text-start">
                  {t('options.option')}
                </th>
                {BUSINESS_UNITS.map((bu) => (
                  <th key={bu} scope="col" className="px-3 py-2.5 text-start">
                    {bu}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {accountKeys.map((key) => {
                const sample = items.find((o) => o.optionKey === key);
                return (
                  <tr key={key}>
                    <th scope="row" className="px-5 py-2 text-start align-top font-normal">
                      <span className="block font-mono text-sm font-medium">{key}</span>
                      <span className="text-xs text-muted">{sample?.description}</span>
                    </th>
                    {BUSINESS_UNITS.map((bu) => {
                      const option = items.find(
                        (o) => o.optionKey === key && o.businessUnit === bu,
                      );
                      return <AccountCell key={`${bu}-${option?.version}`} option={option} />;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
