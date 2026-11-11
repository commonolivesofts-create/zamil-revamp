import { Bell, BellOff, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../ui/Button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '../ui/DropdownMenu';
import { EmptyState } from '../ui/EmptyState';
import { UserMenu } from './UserMenu';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

export function TopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const { t } = useTranslation();
  return (
    <header className="eh-topbar sticky top-0 z-30 flex h-[72px] shrink-0 items-center gap-3 border-b border-border bg-canvas/85 backdrop-blur-xl">
      <button
        type="button"
        onClick={onOpenPalette}
        className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-input border border-border bg-canvas px-3 text-sm text-muted transition-colors hover:border-muted/50 hover:text-ink md:max-w-md"
      >
        <Search aria-hidden className="size-4 shrink-0" />
        <span className="truncate">{t('shell.search')}</span>
        <kbd className="ms-auto hidden shrink-0 rounded border border-border bg-surface px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted sm:inline">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>

      <div className="ms-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <Button asChild className="hidden sm:inline-flex">
          <Link to="/expenses/new">
            <Plus aria-hidden />
            {t('nav.newExpense')}
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t('shell.notifications')}
            className="grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink data-[state=open]:bg-surface-2"
          >
            <Bell aria-hidden className="size-[18px]" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80">
            <EmptyState
              className="py-6"
              icon={BellOff}
              title={t('shell.noNotifications')}
              body={t('shell.noNotificationsHint')}
            />
          </DropdownMenuContent>
        </DropdownMenu>

        <UserMenu />
      </div>
    </header>
  );
}
