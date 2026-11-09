// Screens that later milestones build. Honest placeholder: what it will do and when.
import { Hammer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { navItem, type NavId } from '../../components/shell/navigation';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Tag } from '../../components/ui/Tag';

type ComingSoonKey =
  | 'expenses'
  | 'newExpense'
  | 'reports'
  | 'status'
  | 'approvals'
  | 'audit'
  | 'payables'
  | 'quickPays'
  | 'setup'
  | 'integrations';

export function ComingSoonPage({
  id,
  description,
  title,
  milestone,
}: {
  id: NavId;
  description: ComingSoonKey;
  title?: string;
  milestone?: string;
}) {
  const { t } = useTranslation();
  const item = navItem(id);
  const Icon = item.icon;
  const ms = milestone ?? item.milestone ?? '';

  return (
    <>
      <PageHeader
        eyebrow={t('common.milestone', { id: ms })}
        title={title ?? t(`nav.${id}`)}
        description={t(`comingSoon.${description}`)}
      />
      <Card className="relative overflow-hidden p-8 sm:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -end-16 -top-16 size-64 rounded-full bg-brand/10 blur-3xl"
        />
        <div className="relative flex flex-col items-center text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-surface-2 text-brand ring-1 ring-inset ring-border">
            <Icon aria-hidden className="size-7" strokeWidth={1.5} />
          </span>
          <Tag tone="info" className="mt-5">
            {t('common.comingIn', { id: ms })}
          </Tag>
          <p className="mt-3 max-w-md text-sm text-muted">
            <Hammer aria-hidden className="me-1.5 inline size-4 align-[-3px]" />
            {t('comingSoon.body', { id: ms })}
          </p>
        </div>
      </Card>
    </>
  );
}
