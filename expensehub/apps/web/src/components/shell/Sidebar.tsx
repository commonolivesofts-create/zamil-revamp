// The desktop rail expands on hover/focus like the Zamil shell; smaller screens keep full nav.
import { useState } from 'react';
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
  const [collapseAfterNav, setCollapseAfterNav] = useState(false);
  const items = visibleNav(me, devToolsEnabled(me));

  return (
    <aside
      data-collapse-after-nav={collapseAfterNav}
      onMouseEnter={() => setCollapseAfterNav(false)}
      onMouseLeave={() => setCollapseAfterNav(false)}
      className="eh-sidebar sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-border bg-surface md:flex md:w-72"
    >
      <div className="eh-sidebar__brand flex h-[72px] shrink-0 items-center border-b px-5">
        <Link to="/" aria-label={t('app.name')} className="eh-sidebar__logo rounded-input">
          <Logo variant="full" />
        </Link>
      </div>

      <nav
        aria-label={t('nav.mainMenu')}
        className="eh-sidebar__nav min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2"
      >
        {SECTION_ORDER.map((section) => {
          const sectionItems = items.filter((i) => i.section === section);
          if (sectionItems.length === 0) return null;
          return (
            <div key={section} className="mb-4 last:mb-0">
              <p className="eh-sidebar__heading mb-1 px-3 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                {t(`nav.sections.${section}`)}
              </p>
              <ul className="space-y-0.5">
                {sectionItems.map((item) => (
                  <li key={item.id}>
                    <SidebarLink item={item} onNavigate={() => setCollapseAfterNav(true)} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="eh-sidebar__user flex items-center gap-3 border-t border-border p-4">
        <Avatar name={me.user.fullName} />
        <div className="eh-sidebar__user-copy min-w-0">
          <p className="truncate text-sm font-medium">{me.user.fullName}</p>
          <p className="truncate text-xs text-muted">
            {me.user.jobName ?? t('roles.EMPLOYEE')} · {me.user.businessUnit}
          </p>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const { t } = useTranslation();
  const label = t(`nav.${item.id}`);
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={!item.prefix}
      aria-label={label}
      title={label}
      onClick={(event) => {
        if (event.detail > 0) {
          onNavigate();
          event.currentTarget.blur();
        }
      }}
      className={({ isActive }) =>
        cn(
          'eh-sidebar__link group relative flex h-10 items-center gap-3 rounded-input px-3 text-sm font-medium transition-colors',
          'justify-start',
          isActive
            ? 'bg-brand/10 text-brand-solid dark:text-brand'
            : 'text-muted hover:bg-surface-2 hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span className="eh-sidebar__icon grid size-11 shrink-0 place-items-center rounded-[14px]">
            <Icon aria-hidden className="size-[19px]" strokeWidth={isActive ? 2 : 1.75} />
          </span>
          <span className="eh-sidebar__label min-w-0 truncate">{label}</span>
          {item.milestone && (
            <span className="eh-sidebar__meta ms-auto hidden rounded-pill bg-surface-2 px-1.5 py-px text-[10px] font-medium text-muted lg:inline">
              {item.milestone}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}
