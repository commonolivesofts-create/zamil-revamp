// D-33 dev Mail page: the notification outbox rendered as emails. Works signed in or not, so a
// password link can be opened before anyone can sign in. Dev builds only.
import { devMailResponseSchema } from '@expensehub/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Inbox, MailOpen, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Logo } from '../../components/brand/Logo';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tag } from '../../components/ui/Tag';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';

const timeFormat = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Riyadh',
});

export function MailPage() {
  const { t } = useTranslation();
  const mail = useQuery({
    queryKey: ['dev-mail'],
    queryFn: ({ signal }) => api('/dev/mail', devMailResponseSchema, { signal }),
    refetchInterval: 4000,
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const items = mail.data?.items ?? [];
  const selected = items.find((message) => message.id === selectedId) ?? items[0];

  return (
    <div className="eh-dev-mail min-h-dvh text-ink">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="flex h-14 w-full items-center gap-3 px-4 sm:px-6">
          <Logo variant="mark" />
          <span className="text-xs font-medium text-muted">{t('mail.eyebrow')}</span>
          <div className="ms-auto flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">
                <ArrowLeft aria-hidden className="rtl:rotate-180" />
                {t('mail.backToApp')}
              </Link>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" className="eh-dev-mail__main w-full px-4 py-5 sm:px-6">
        <PageHeader
          eyebrow={t('mail.eyebrow')}
          title={t('mail.title')}
          actions={
            <div className="eh-dev-mail__header-actions">
              <Tag tone="warn">{t('common.devOnly')}</Tag>
              <Button
                variant="secondary"
                size="sm"
                loading={mail.isFetching}
                onClick={() => void mail.refetch()}
              >
                {!mail.isFetching && <RefreshCw aria-hidden />}
                {t('mail.refresh')}
              </Button>
            </div>
          }
        />

        {mail.isPending ? (
          <div className="grid gap-3 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
            <Card className="eh-setup__list-card p-4" aria-busy="true">
              <Skeleton className="mb-4 h-5 w-28" />
              <div className="space-y-3">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="h-14 w-full" />
                ))}
              </div>
            </Card>
            <Card className="eh-setup__list-card p-5" aria-busy="true">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="mt-3 h-4 w-1/2" />
              <Skeleton className="mt-8 h-44 w-full" />
            </Card>
          </div>
        ) : mail.isError && !mail.data ? (
          <Card className="eh-setup__list-card p-8 text-center">
            <p className="text-sm text-block">{mail.error.message}</p>
            <Button variant="secondary" className="mt-3" onClick={() => void mail.refetch()}>
              {t('app.retry')}
            </Button>
          </Card>
        ) : items.length === 0 ? (
          <Card className="eh-setup__list-card overflow-hidden">
            <div className="eh-setup__table-head">
              <div>
                <h2>{t('mail.inbox')}</h2>
                <p>{t('mail.description')}</p>
              </div>
              <span className="eh-setup__count">0</span>
            </div>
            <EmptyState icon={Inbox} title={t('mail.empty')} body={t('mail.emptyBody')} />
          </Card>
        ) : (
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
            <Card className="eh-setup__list-card overflow-hidden">
              <div className="eh-setup__table-head">
                <div>
                  <h2>{t('mail.inbox')}</h2>
                  <p>{t('mail.inboxDescription')}</p>
                </div>
                <span className="eh-setup__count">
                  {t('mail.emailCount', { count: items.length })}
                </span>
              </div>
              <ul className="eh-dev-mail__inbox max-h-[68vh] divide-y divide-border overflow-y-auto">
                {items.map((message) => (
                  <li key={message.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(message.id)}
                      aria-current={selected?.id === message.id}
                      className={cn(
                        'eh-dev-mail__message block w-full px-4 py-3 text-start transition-colors hover:bg-surface-2',
                        selected?.id === message.id && 'is-selected',
                      )}
                    >
                      <span className="flex items-start justify-between gap-2 text-[10px] text-muted">
                        <span className="min-w-0 truncate">{message.to.name}</span>
                        <time className="shrink-0 tabular" dateTime={message.createdAt}>
                          {timeFormat.format(new Date(message.createdAt))}
                        </time>
                      </span>
                      <span className="mt-1 block break-words text-sm font-semibold">
                        {message.subject}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted">
                        {message.templateCode}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>

            {selected ? (
              <Card className="eh-setup__list-card min-w-0 overflow-hidden">
                <div className="eh-setup__table-head eh-dev-mail__message-head">
                  <div className="flex min-w-0 items-start gap-3">
                    <Avatar name={selected.to.name} />
                    <div className="min-w-0">
                      <h2 className="break-words">{selected.subject}</h2>
                      <p className="break-words">
                        {t('mail.to')}: {selected.to.name} &lt;
                        {selected.to.email ?? t('mail.noEmail')}&gt;
                      </p>
                    </div>
                  </div>
                  <Tag>{selected.templateCode}</Tag>
                </div>
                <div className="p-5 sm:p-6">
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4 text-xs text-muted">
                    <span>{t('mail.sentTo', { name: selected.to.name })}</span>
                    <time dateTime={selected.createdAt}>
                      {timeFormat.format(new Date(selected.createdAt))}
                    </time>
                  </div>
                  <p className="whitespace-pre-line break-words text-sm leading-6">
                    {selected.text}
                  </p>
                  {selected.action && (
                    <Button asChild className="mt-5">
                      <a href={selected.action.url}>
                        {selected.action.label}
                        <ExternalLink aria-hidden />
                      </a>
                    </Button>
                  )}
                </div>
              </Card>
            ) : (
              <Card className="eh-setup__list-card">
                <EmptyState icon={MailOpen} title={t('mail.select')} />
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
