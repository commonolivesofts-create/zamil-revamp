// FR-SET-05 setup history: who, when, old → new. Read-only (append-only table, DB-05).
import { SETUP_TABLES, type SetupTable } from '@expensehub/shared';
import { ArrowRight, History } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../components/ui/Avatar';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tag } from '../../components/ui/Tag';
import { cn } from '../../lib/cn';
import { changedFields } from '../../lib/diff';
import { formatDateTime } from '../../lib/format';
import { useSetupHistory } from './hooks';

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function HistoryPage() {
  const { t } = useTranslation();
  const [table, setTable] = useState<SetupTable | undefined>(undefined);
  const history = useSetupHistory(table);

  const chip = (active: boolean) =>
    cn(
      'h-8 rounded-pill border px-3 text-sm font-medium transition-colors',
      active
        ? 'border-transparent bg-ink text-surface'
        : 'border-border bg-surface text-muted hover:text-ink',
    );

  return (
    <>
      <p className="mb-4 text-sm text-muted">{t('history.description')}</p>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={table === undefined}
          className={chip(table === undefined)}
          onClick={() => setTable(undefined)}
        >
          {t('history.all')}
        </button>
        {SETUP_TABLES.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={table === name}
            className={chip(table === name)}
            onClick={() => setTable(name)}
          >
            {t(`history.tables.${name}`)}
          </button>
        ))}
      </div>

      <Card>
        {history.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : !history.data?.items.length ? (
          <EmptyState icon={History} title={t('history.empty')} />
        ) : (
          <ol className="divide-y divide-border">
            {history.data.items.map((item) => {
              const created = item.oldJson === null;
              const changes = created ? [] : changedFields(item);
              return (
                <li key={item.id} className="flex gap-3 px-5 py-4">
                  <Avatar name={item.actor?.fullName ?? t('history.system')} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">
                        {item.actor?.fullName ?? t('history.system')}
                      </span>{' '}
                      <span className="text-muted">
                        {created ? t('history.created') : t('history.changed')}
                      </span>{' '}
                      <Tag className="mx-1">
                        {t(`history.tables.${item.tableName as SetupTable}`)}
                      </Tag>
                      <span className="font-mono text-xs">{item.rowKey}</span>
                    </p>
                    {changes.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {changes.map((c) => (
                          <li key={c.key} className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="font-mono text-muted">{c.key}</span>
                            <span className="rounded bg-block/10 px-1.5 py-0.5 font-mono text-block line-through decoration-block/50">
                              {show(c.from)}
                            </span>
                            <ArrowRight aria-hidden className="size-3 text-muted rtl:rotate-180" />
                            <span className="rounded bg-pass/10 px-1.5 py-0.5 font-mono text-pass-text">
                              {show(c.to)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <time dateTime={item.at} className="shrink-0 text-xs text-muted">
                    {formatDateTime(item.at)}
                  </time>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </>
  );
}
