// D-33 dev Mail page: the notification outbox rendered as emails. Works signed in or not, so a
// password link can be opened before anyone can sign in. Dev builds only.
import { devMailResponseSchema } from '@expensehub/shared';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Inbox, MailOpen } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Logo } from '../../components/brand/Logo';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
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
  const selected = items.find((m) => m.id === selectedId) ?? items[0];

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/80 backdrop-blur-md">
        <div className="flex h-16 w-full items-center gap-3 px-4 sm:px-6">
          <Logo variant="mark" />
          <span className="font-semibold">{t('mail.title')}</span>
          <Tag tone="warn">{t('common.devOnly')}</Tag>
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

      <main id="main" className="w-full px-4 py-6 sm:px-6">
        <p className="mb-5 text-sm text-muted">{t('mail.description')}</p>
        {items.length === 0 ? (
          <Card>
            <EmptyState icon={Inbox} title={t('mail.empty')} body={t('mail.emptyBody')} />
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <Card className="overflow-hidden">
              <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
                {items.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      aria-current={selected?.id === m.id}
                      className={cn(
                        'block w-full px-4 py-3 text-start transition-colors hover:bg-surface-2',
                        selected?.id === m.id && 'bg-brand/8',
                      )}
                    >
                      <span className="flex items-center justify-between gap-2 text-xs text-muted">
                        <span className="truncate">{m.to.name}</span>
                        <time dateTime={m.createdAt}>
                          {timeFormat.format(new Date(m.createdAt))}
                        </time>
                      </span>
                      <span className="mt-0.5 block truncate text-sm font-medium">{m.subject}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>

            {selected ? (
              <Card className="p-6">
                <div className="flex items-start gap-3 border-b border-border pb-4">
                  <Avatar name={selected.to.name} />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold">{selected.subject}</h2>
                    <p className="text-sm text-muted">
                      {t('mail.to')}: {selected.to.name} &lt;
                      {selected.to.email ?? t('mail.noEmail')}&gt;
                    </p>
                  </div>
                  <Tag>{selected.templateCode}</Tag>
                </div>
                <p className="whitespace-pre-line py-5 text-sm leading-6">{selected.text}</p>
                {selected.action && (
                  <Button asChild>
                    <a href={selected.action.url}>
                      {selected.action.label}
                      <ExternalLink aria-hidden />
                    </a>
                  </Button>
                )}
              </Card>
            ) : (
              <Card>
                <EmptyState icon={MailOpen} title={t('mail.select')} />
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
