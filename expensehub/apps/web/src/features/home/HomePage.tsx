// Role-aware home (UI-UX §5.1, FR-DSH-01/02/03): the employee block for everyone, then the
// approver and finance blocks for those who hold the roles (stacked — no role switcher). Every
// figure is real (dashboard API); FR-SET-02 says what blocks a submit and who fixes it.
import { hasAnyCapability, isApprover } from '@expensehub/shared';
import { ArrowRight, CircleX, FileText, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { visibleNav } from '../../components/shell/navigation';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusPill } from '../../components/ui/StatusPill';
import { ProgressBar } from '../../components/ui/Stepper';
import { Tag } from '../../components/ui/Tag';
import { formatSar } from '../../lib/format';
import { devToolsEnabled, useCurrentUser } from '../../lib/session';
import { useMyReports } from '../reports/hooks';
import { ApproverSection, EmployeeSection, FinanceSection } from './DashboardSections';

function greetingKey(now: Date): 'home.morning' | 'home.afternoon' | 'home.evening' {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: 'Asia/Riyadh',
    }).format(now),
  );
  return hour < 12 ? 'home.morning' : hour < 17 ? 'home.afternoon' : 'home.evening';
}

export function HomePage() {
  const { t } = useTranslation();
  const me = useCurrentUser();
  const firstName = me.user.fullName.split(' ')[0] ?? me.user.fullName;
  const failing = me.prerequisites.checks.filter((c) => !c.ok);
  const shortcuts = visibleNav(me, devToolsEnabled(me)).filter((i) => i.id !== 'home');
  const approver = isApprover(me.capabilities);
  const finance = hasAnyCapability(me.capabilities, ['FINANCE_AP', 'ACCOUNTANT']);
  const recent = (useMyReports().data ?? []).slice(0, 5);

  return (
    <div className="eh-dashboard">
      <header className="eh-dashboard__header flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="eh-dashboard__title font-semibold">
            {t(greetingKey(new Date()), { name: firstName })}
          </h1>
          <p className="eh-dashboard__subtitle mt-1.5 text-sm text-muted">
            {t('home.subtitle', {
              job: me.user.jobName ?? t('roles.EMPLOYEE'),
              bu: me.user.businessUnit,
              number: me.user.personNumber,
            })}
          </p>
        </div>
        {me.prerequisites.ok && (
          <Tag tone="pass" className="eh-dashboard__ready py-1">
            {t('home.readyTitle')}
          </Tag>
        )}
      </header>

      {/* FR-SET-02 / FR-POL-06: say what blocks submit and who fixes it. */}
      {!me.prerequisites.ok && (
        <Card className="border-warn/40 p-5">
          <div className="flex items-start gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warn/10 text-warn">
              <ShieldAlert aria-hidden className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{t('home.blockedTitle')}</p>
              <p className="text-sm text-muted">{t('home.blockedBody')}</p>
              <ul className="mt-3 space-y-2">
                {failing.map((check) => (
                  <li
                    key={check.code}
                    className="flex flex-col gap-2 rounded-input bg-surface-2 p-3 sm:flex-row sm:items-center"
                  >
                    <span className="flex flex-1 items-start gap-2 text-sm">
                      <CircleX aria-hidden className="mt-0.5 size-4 shrink-0 text-block" />
                      {check.message}
                    </span>
                    {check.contact && (
                      <Tag tone="warn" className="self-start sm:self-auto">
                        {t(`home.contact${check.contact}`)}
                      </Tag>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <EmployeeSection />

      <Card className="eh-dashboard__reports">
        <div className="eh-dashboard__section-heading flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">{t('home.claimsTitle')}</h2>
          {recent.length > 0 && (
            <Link
              to="/reports"
              className="text-sm font-medium text-brand-solid hover:underline dark:text-brand"
            >
              {t('home.allReports')}
            </Link>
          )}
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={t('home.claimsEmpty')}
            body={t('home.claimsEmptyBody')}
            action={
              <Button asChild variant="secondary">
                <Link to="/expenses/new">{t('nav.newExpense')}</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((r) => (
              <li key={r.reportId}>
                <Link
                  to={`/reports/${r.reportId}`}
                  className="eh-dashboard__report-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-3.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{r.purpose}</span>
                    <span className="font-mono text-xs text-muted">
                      {r.reportNumber ?? t('reports.draftTitle')}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold tabular">{formatSar(r.totalSar)}</span>
                    <StatusPill status={r.status} />
                  </span>
                  <ProgressBar status={r.status} className="col-span-2" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {approver && <ApproverSection />}
      {finance && <FinanceSection payables={me.capabilities.includes('FINANCE_AP')} />}

      <section aria-labelledby="shortcuts">
        <h2
          id="shortcuts"
          className="eh-dashboard__shortcut-heading mb-3 text-sm font-semibold uppercase tracking-wide text-muted"
        >
          {t('home.shortcutsTitle')}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <Link
                  to={item.to}
                  className="eh-dashboard__shortcut group flex items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-card transition-shadow hover:shadow-raised"
                >
                  <span className="grid size-9 place-items-center rounded-input bg-surface-2 text-muted transition-colors group-hover:text-brand">
                    <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
                  </span>
                  <span className="flex-1 text-sm font-medium">{t(`nav.${item.id}`)}</span>
                  <ArrowRight
                    aria-hidden
                    className="size-4 text-muted transition-transform group-hover:translate-x-0.5 rtl:rotate-180"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
