// ⌘K / Ctrl+K command menu: jump to any page the user may see, or run an action.
import { Command } from 'cmdk';
import { LogOut, Monitor, Moon, Plus, Search, Sun } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useLogout } from '../../features/auth/hooks';
import { devToolsEnabled, useCurrentUser } from '../../lib/session';
import { THEME_PREFERENCES, setThemePreference } from '../../lib/theme';
import { visibleNav } from './navigation';

const themeIcons = { system: Monitor, light: Sun, dark: Moon } as const;

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const me = useCurrentUser();
  const navigate = useNavigate();
  const logout = useLogout();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  const run = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={t('palette.label')}
      overlayClassName="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] motion-safe:animate-fade-in dark:bg-black/60"
      contentClassName="fixed inset-x-4 top-[12vh] z-50 mx-auto max-w-xl overflow-hidden rounded-card border border-border bg-surface text-ink shadow-raised motion-safe:animate-pop"
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        <Search aria-hidden className="size-4 shrink-0 text-muted" />
        <Command.Input
          placeholder={t('palette.placeholder')}
          className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        />
        <kbd className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted">Esc</kbd>
      </div>
      <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted">
        <Command.Empty className="py-10 text-center text-sm text-muted">
          {t('palette.empty')}
        </Command.Empty>

        <Command.Group heading={t('palette.pages')}>
          {visibleNav(me, devToolsEnabled(me)).map((item) => {
            const Icon = item.icon;
            const label = t(`nav.${item.id}`);
            return (
              <Item
                key={item.id}
                value={`${label} ${item.to}`}
                onSelect={run(() => navigate(item.to))}
              >
                <Icon aria-hidden />
                {label}
                {item.milestone && (
                  <span className="ms-auto text-xs text-muted">
                    {t('common.comingIn', { id: item.milestone })}
                  </span>
                )}
              </Item>
            );
          })}
        </Command.Group>

        <Command.Group heading={t('palette.actions')}>
          <Item value={t('nav.newExpense')} onSelect={run(() => navigate('/expenses/new'))}>
            <Plus aria-hidden />
            {t('nav.newExpense')}
          </Item>
          {THEME_PREFERENCES.map((pref) => {
            const Icon = themeIcons[pref];
            const label = t('palette.theme', { value: t(`theme.${pref}`) });
            return (
              <Item key={pref} value={label} onSelect={run(() => setThemePreference(pref))}>
                <Icon aria-hidden />
                {label}
              </Item>
            );
          })}
          <Item value={t('shell.signOut')} onSelect={run(() => logout.mutate())}>
            <LogOut aria-hidden />
            {t('shell.signOut')}
          </Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}

function Item({
  value,
  onSelect,
  children,
}: {
  value: string;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-10 cursor-default select-none items-center gap-3 rounded-input px-2.5 text-sm data-[selected=true]:bg-surface-2 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted"
    >
      {children}
    </Command.Item>
  );
}
