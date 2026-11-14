// UI-UX §2 dark mode: follows the OS by default; System / Light / Dark override.
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';
import { THEME_PREFERENCES, useTheme, type ThemePreference } from '../lib/theme';

const icons: Record<ThemePreference, LucideIcon> = { system: Monitor, light: Sun, dark: Moon };

export function ThemeToggle() {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label={t('theme.label')}
      className="inline-flex items-center gap-0.5 rounded-pill border border-border bg-surface p-0.5 shadow-card"
    >
      {THEME_PREFERENCES.map((pref) => {
        const Icon = icons[pref];
        const selected = pref === preference;
        return (
          <button
            key={pref}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={t(`theme.${pref}`)}
            title={t(`theme.${pref}`)}
            onClick={() => setPreference(pref)}
            className={cn(
              'grid size-7 place-items-center rounded-pill text-muted transition-colors',
              'hover:text-ink',
              selected && 'bg-surface-2 text-ink shadow-card',
            )}
          >
            <Icon aria-hidden className="size-3.5" strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}
