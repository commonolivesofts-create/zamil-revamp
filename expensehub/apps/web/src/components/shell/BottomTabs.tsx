// UI-UX §3 mobile < 640 px: Home · Expenses · ＋ · Reports · More.
import { LogOut, MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useNavigate } from 'react-router';
import { useLogout } from '../../features/auth/hooks';
import { cn } from '../../lib/cn';
import { devToolsEnabled, useCurrentUser } from '../../lib/session';
import { Sheet } from '../ui/Sheet';
import { navItem, visibleNav, type NavId } from './navigation';

const TAB_IDS: NavId[] = ['home', 'expenses', 'reports'];

export function BottomTabs() {
  const { t } = useTranslation();
  const me = useCurrentUser();
  const navigate = useNavigate();
  const logout = useLogout();
  const [moreOpen, setMoreOpen] = useState(false);
  const [home, expenses, reports] = TAB_IDS.map(navItem);
  const moreItems = visibleNav(me, devToolsEnabled(me)).filter((i) => !TAB_IDS.includes(i.id));

  const tab = (item: NonNullable<typeof home>) => {
    const Icon = item.icon;
    return (
      <NavLink
        to={item.to}
        end
        className={({ isActive }) =>
          cn(
            'flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
            isActive ? 'text-brand-solid dark:text-brand' : 'text-muted',
          )
        }
      >
        <Icon aria-hidden className="size-5" strokeWidth={1.75} />
        {t(`nav.${item.id}`)}
      </NavLink>
    );
  };

  return (
    <>
      <nav
        aria-label={t('nav.mainMenu')}
        className="fixed inset-x-0 bottom-0 z-30 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        {tab(home!)}
        {tab(expenses!)}
        <div className="grid place-items-center">
          <Link
            to="/expenses/new"
            aria-label={t('nav.newExpense')}
            className="-mt-6 grid size-14 place-items-center rounded-full bg-brand-solid text-brand-fg shadow-raised ring-4 ring-canvas transition-transform active:scale-95"
          >
            <Plus aria-hidden className="size-6" strokeWidth={2.25} />
          </Link>
        </div>
        {tab(reports!)}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted"
        >
          <MoreHorizontal aria-hidden className="size-5" strokeWidth={1.75} />
          {t('nav.more')}
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen} title={t('nav.more')}>
        <ul className="divide-y divide-border">
          {moreItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 py-3.5 text-start text-sm font-medium"
                  onClick={() => {
                    setMoreOpen(false);
                    navigate(item.to);
                  }}
                >
                  <Icon aria-hidden className="size-5 text-muted" strokeWidth={1.75} />
                  {t(`nav.${item.id}`)}
                  {item.milestone && (
                    <span className="ms-auto rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                      {item.milestone}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              className="flex w-full items-center gap-3 py-3.5 text-start text-sm font-medium text-block"
              onClick={() => {
                setMoreOpen(false);
                logout.mutate();
              }}
            >
              <LogOut aria-hidden className="size-5" strokeWidth={1.75} />
              {t('shell.signOut')}
            </button>
          </li>
        </ul>
      </Sheet>
    </>
  );
}
