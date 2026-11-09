// FR-SET-02 prerequisite exceptions report (API §10: Adm, Fin for their BUs).
import {
  BUSINESS_UNITS,
  PREREQUISITE_CODES,
  prerequisitesResponseSchema,
  type BusinessUnit,
} from '@expensehub/shared';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, CircleX, PartyPopper } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tag } from '../../components/ui/Tag';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';

export function PrerequisitesPage() {
  const { t } = useTranslation();
  const [bu, setBu] = useState<BusinessUnit | null>(null);
  const [failingOnly, setFailingOnly] = useState(true);

  const query = useQuery({
    queryKey: ['prerequisites', bu, failingOnly],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (bu) params.set('bu', bu);
      if (failingOnly) params.set('failingOnly', 'true');
      return api(`/setup/prerequisites?${params}`, prerequisitesResponseSchema, { signal });
    },
    placeholderData: (previous) => previous,
  });

  const chip = (active: boolean) =>
    cn(
      'h-8 rounded-pill border px-3 text-sm font-medium transition-colors',
      active
        ? 'border-transparent bg-ink text-surface'
        : 'border-border bg-surface text-muted hover:text-ink',
    );

  return (
    <>
      <PageHeader title={t('prereq.title')} description={t('prereq.description')} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[null, ...BUSINESS_UNITS].map((unit) => (
          <button
            key={unit ?? 'all'}
            type="button"
            aria-pressed={bu === unit}
            className={chip(bu === unit)}
            onClick={() => setBu(unit)}
          >
            {unit ?? t('prereq.all')}
          </button>
        ))}
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        <button
          type="button"
          aria-pressed={failingOnly}
          className={chip(failingOnly)}
          onClick={() => setFailingOnly((v) => !v)}
        >
          {t('prereq.failingOnly')}
        </button>
      </div>

      <Card className="overflow-hidden">
        {query.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="p-8 text-center">
            <p className="text-sm text-block">{query.error.message}</p>
            <Button variant="secondary" className="mt-3" onClick={() => void query.refetch()}>
              {t('app.retry')}
            </Button>
          </div>
        ) : query.data.items.length === 0 ? (
          <EmptyState icon={PartyPopper} title={t('prereq.empty')} body={t('prereq.emptyBody')} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/50 text-start text-xs font-medium uppercase tracking-wide text-muted">
                  <th scope="col" className="px-5 py-3 text-start">
                    {t('prereq.person')}
                  </th>
                  {PREREQUISITE_CODES.map((code) => (
                    <th key={code} scope="col" className="px-3 py-3 text-center">
                      {t(`prereq.${code}`)}
                    </th>
                  ))}
                  <th scope="col" className="px-5 py-3 text-end">
                    <span className="sr-only">{t('prereq.status')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {query.data.items.map((row) => (
                  <tr key={row.personId} className="transition-colors hover:bg-surface-2/40">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={row.fullName} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{row.fullName}</p>
                          <p className="truncate text-xs text-muted">
                            {row.personNumber} · {row.jobName} · {row.businessUnit}
                          </p>
                        </div>
                      </div>
                    </td>
                    {row.checks.map((check) => (
                      <td key={check.code} className="px-3 py-3 text-center">
                        {check.ok ? (
                          <CircleCheck
                            aria-label={check.message}
                            className="inline size-4 text-pass-text"
                          />
                        ) : (
                          <span title={check.message} className="inline-flex">
                            <CircleX aria-label={check.message} className="size-4 text-block" />
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-5 py-3 text-end">
                      {row.ok ? (
                        <Tag tone="pass">{t('prereq.ready')}</Tag>
                      ) : (
                        <Tag tone="block">{t('prereq.blocked')}</Tag>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
