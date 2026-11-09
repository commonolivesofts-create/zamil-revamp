import { ChevronDown, LogOut, Mail, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useLogout } from '../../features/auth/hooks';
import { devToolsEnabled, useCurrentUser } from '../../lib/session';
import { THEME_PREFERENCES, useTheme, type ThemePreference } from '../../lib/theme';
import { Avatar } from '../ui/Avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';

const themeIcons = { system: Monitor, light: Sun, dark: Moon } as const;

export function UserMenu() {
  const { t } = useTranslation();
  const me = useCurrentUser();
  const navigate = useNavigate();
  const logout = useLogout();
  const { preference, setPreference } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('shell.account')}
        className="flex items-center gap-1.5 rounded-pill p-0.5 pe-1.5 transition-colors hover:bg-surface-2 data-[state=open]:bg-surface-2"
      >
        <Avatar name={me.user.fullName} size="sm" />
        <ChevronDown aria-hidden className="size-3.5 text-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72">
        <div className="flex items-center gap-3 px-2.5 py-2">
          <Avatar name={me.user.fullName} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{me.user.fullName}</p>
            <p className="truncate text-xs text-muted">{me.user.email ?? me.user.jobName}</p>
            <p className="text-xs text-muted">
              {t('shell.personNumber', { value: me.user.personNumber })} · {me.user.businessUnit}
            </p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('theme.label')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => setPreference(value as ThemePreference)}
        >
          {THEME_PREFERENCES.map((pref) => {
            const Icon = themeIcons[pref];
            return (
              <DropdownMenuRadioItem key={pref} value={pref}>
                <Icon aria-hidden />
                {t(`theme.${pref}`)}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {import.meta.env.DEV && devToolsEnabled(me) && (
          <DropdownMenuItem onSelect={() => navigate('/dev/mail')}>
            <Mail aria-hidden />
            {t('nav.mail')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => logout.mutate()} disabled={logout.isPending}>
          <LogOut aria-hidden />
          {logout.isPending ? t('shell.signingOut') : t('shell.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
