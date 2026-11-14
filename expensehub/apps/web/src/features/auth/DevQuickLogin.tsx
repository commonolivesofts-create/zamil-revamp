// D-33 dev-only quick sign-in as any seeded demo user (D-35). Loaded only in dev builds and
// only shown when the API exposes /auth/dev-users. It signs in as a real user with that
// user's real roles — it is not a role switcher.
import { Check, Copy, Zap } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../../components/ui/Avatar';
import { Card } from '../../components/ui/Card';
import { Spinner } from '../../components/ui/Spinner';
import { Tag } from '../../components/ui/Tag';
import { cn } from '../../lib/cn';
import { useDevLogin, useDevUsers } from './devHooks';

export default function DevQuickLogin({ onSignedIn }: { onSignedIn: () => void }) {
  const { t } = useTranslation();
  const users = useDevUsers();
  const devLogin = useDevLogin();
  const [copied, setCopied] = useState(false);

  if (users.isError) {
    return <p className="mt-8 text-center text-xs text-muted">{t('login.devUnavailable')}</p>;
  }
  if (!users.data) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(users.data.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the password is visible anyway.
    }
  };

  return (
    <Card className="mt-8 overflow-hidden" data-testid="dev-quick-login">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Zap aria-hidden className="size-4 text-warn" />
            {t('login.devTitle')}
          </p>
          <p className="mt-0.5 text-xs text-muted">{t('login.devHint')}</p>
        </div>
        <Tag tone="warn">{t('common.devOnly')}</Tag>
      </div>
      <div className="flex items-center gap-2 border-b border-border bg-surface-2/60 px-4 py-2 text-xs text-muted">
        {t('login.devPassword')}
        <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-ink ring-1 ring-border">
          {users.data.password}
        </code>
        <button
          type="button"
          onClick={() => void copy()}
          className="ms-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium hover:text-ink"
        >
          {copied ? (
            <Check aria-hidden className="size-3.5" />
          ) : (
            <Copy aria-hidden className="size-3.5" />
          )}
          {copied ? t('common.copied') : t('common.copy')}
        </button>
      </div>
      <ul className="grid max-h-[26rem] gap-px overflow-y-auto bg-border sm:grid-cols-2">
        {users.data.users.map((user) => {
          const pending = devLogin.isPending && devLogin.variables === user.personNumber;
          return (
            <li key={user.personNumber} className="bg-surface">
              <button
                type="button"
                title={user.scenario}
                disabled={devLogin.isPending}
                onClick={() => devLogin.mutate(user.personNumber, { onSuccess: onSignedIn })}
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-surface-2 disabled:opacity-60',
                  pending && 'bg-surface-2',
                )}
              >
                <Avatar name={user.fullName} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{user.fullName}</span>
                  <span className="block truncate text-xs text-muted">{user.persona}</span>
                </span>
                {pending ? (
                  <Spinner className="size-4 text-muted" />
                ) : (
                  <span className="rounded-pill bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-muted">
                    {user.businessUnit}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {devLogin.error && (
        <p role="alert" className="border-t border-border px-4 py-2 text-xs text-block">
          {devLogin.error.message}
        </p>
      )}
    </Card>
  );
}
