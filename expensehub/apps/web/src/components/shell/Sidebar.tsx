// UI-UX §3: full sidebar ≥ 1024 px, icon rail 640–1023 px, hidden below (bottom tabs).
import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router';
import { cn } from '../../lib/cn';
import { devToolsEnabled, useCurrentUser } from '../../lib/session';
import { Logo } from '../brand/Logo';
import { Avatar } from '../ui/Avatar';
import { SECTION_ORDER, visibleNav, type NavItem } from './navigation';

export function Sidebar() {
  const { t } = useTranslation();
  const me = useCurrentUser();
  const items = visibleNav(me, devToolsEnabled(me));

  return (
    <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-border bg-surface md:flex md:w-72">
      <div className="flex h-[72px] shrink-0 items-center px-5">
        <Link to="/" aria-label={t('app.name')} className="rounded-input">
          <Logo variant="full" />
        </Link>
      </div>

      <nav aria-label={t('nav.mainMenu')} className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
        {SECTION_ORDER.map((section) => {
          const sectionItems = items.filter((i) => i.section === section);
          if (sectionItems.length === 0) return null;
          return (
            <div key={section} className="mb-4 last:mb-0">
              <p className="mb-1 px-3 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                {t(`nav.sections.${section}`)}
              </p>
              <ul className="space-y-0.5">
                {sectionItems.map((item) => (
                  <li key={item.id}>
                    <SidebarLink item={item} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="flex items-center gap-3 border-t border-border p-4">
        <Avatar name={me.user.fullName} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{me.user.fullName}</p>
          <p className="truncate text-xs text-muted">
            {me.user.jobName ?? t('roles.EMPLOYEE')} · {me.user.businessUnit}
          </p>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({ item }: { item: NavItem }) {
  const { t } = useTranslation();
  const label = t(`nav.${item.id}`);
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={!item.prefix}
      title={label}
      className={({ isActive }) =>
        cn(
          'group relative flex h-10 items-center gap-3 rounded-input px-3 text-sm font-medium transition-colors',
          'justify-start',
          isActive
            ? 'bg-brand/10 text-brand-solid dark:text-brand'
            : 'text-muted hover:bg-surface-2 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              aria-hidden
              className="absolute inset-y-2 start-0 w-[3px] rounded-e-full bg-brand"
            />
          )}
          <Icon aria-hidden className="size-[18px] shrink-0" strokeWidth={isActive ? 2 : 1.75} />
          <span className="truncate">{label}</span>
          {item.milestone && (
            <span className="ms-auto hidden rounded-pill bg-surface-2 px-1.5 py-px text-[10px] font-medium text-muted lg:inline">
              {item.milestone}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}
