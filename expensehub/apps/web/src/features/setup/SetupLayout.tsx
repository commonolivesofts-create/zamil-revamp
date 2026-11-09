// FR-SET-01/04/05: one header and tab bar for every setup page.
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router';
import { PageHeader } from '../../components/ui/PageHeader';
import { cn } from '../../lib/cn';

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
  return (
    <>
      <PageHeader
        eyebrow={t('setup.eyebrow')}
        title={t('setup.title')}
        description={t('setup.description')}
      />
      <nav
        aria-label={t('setup.title')}
        className="-mx-4 mb-6 overflow-x-auto border-b border-border px-4 sm:mx-0 sm:px-0"
      >
        <ul className="flex min-w-max gap-1">
          {TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    'relative inline-flex h-10 items-center px-3 text-sm font-medium transition-colors',
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
      <Outlet />
    </>
  );
}
