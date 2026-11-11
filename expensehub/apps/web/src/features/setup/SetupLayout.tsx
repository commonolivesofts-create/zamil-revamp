// FR-SET-01/04/05: one header and tab bar for every setup page.
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { PageHeader } from '../../components/ui/PageHeader';
import { cn } from '../../lib/cn';

export type SetupOutletContext = { setHeaderActions: (actions: ReactNode | null) => void };

const TABS = [
  { to: 'expense-types', key: 'expenseTypes' },
  { to: 'approval-rules', key: 'approvalRules' },
  { to: 'audit-rules', key: 'auditRules' },
  { to: 'options', key: 'options' },
  { to: 'roles', key: 'roles' },
  { to: 'history', key: 'history' },
] as const;

export function SetupLayout() {
  const { t } = useTranslation();
  const [headerActions, setHeaderActions] = useState<ReactNode>(null);
  const outletContext = useMemo(() => ({ setHeaderActions }), [setHeaderActions]);
  return (
    <>
      <PageHeader
        eyebrow={t('setup.eyebrow')}
        title={t('setup.title')}
        description={t('setup.description')}
        actions={headerActions}
      />
      <nav aria-label={t('setup.title')} className="eh-setup__tabs">
        <ul className="eh-setup__tab-list">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    'eh-setup__tab relative inline-flex h-9 items-center text-sm font-medium transition-colors whitespace-nowrap',
                    isActive ? 'text-ink' : 'text-muted hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {t(`setup.tabs.${tab.key}`)}
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand"
                      />
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet context={outletContext} />
    </>
  );
}
