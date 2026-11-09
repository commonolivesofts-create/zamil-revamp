// UI-UX §5.1 role-aware home blocks (FR-DSH-01/02/03): employee, approver, finance — stacked for
// people holding several roles. Every figure comes from the dashboard API (real data only).
import { parseSar } from '@expensehub/shared';
import {
  AlertTriangle,
  ArrowRight,
  Camera,
  CircleDollarSign,
  FileClock,
  FilePen,
  Flag,
  Hourglass,
  Landmark,
  ListChecks,
  Plus,
  Receipt,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { DonutChart, MonthBars } from '../../components/ui/Charts';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatCard } from '../../components/ui/StatCard';
import { cn } from '../../lib/cn';
import { formatRelative, formatSar } from '../../lib/format';
import { useApproverDashboard, useEmployeeDashboard, useFinanceDashboard } from './hooks';

const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const formatMonth = (month: string) => monthFormat.format(new Date(`${month}-01T00:00:00Z`));

function SectionTitle({
  id,
  children,
  action,
}: {
  id: string;
  children: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 id={id} className="text-sm font-semibold uppercase tracking-wide text-muted">
        {children}
      </h2>
      {action && (
        <Link
          to={action.to}
          className="text-sm font-medium text-brand-solid hover:underline dark:text-brand"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

// ─── Employee (FR-DSH-01) ───────────────────────────────────────────────────

export function EmployeeSection() {
  const { t } = useTranslation();
  const d = useEmployeeDashboard().data;

  return (
    <section aria-labelledby="dash-employee" className="space-y-4">
      <h2 id="dash-employee" className="sr-only">
        {t('dashboard.employeeTitle')}
      </h2>
      {/* UI-UX §5.1: dark summary card — "On its way". */}
      <div className="flex flex-col gap-5 rounded-card bg-hero p-6 text-hero-fg shadow-raised sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-hero-muted">{t('dashboard.onItsWay')}</p>
          {d ? (
            <p className="mt-1 text-display font-semibold tabular" data-testid="on-its-way">
              {formatSar(d.onItsWay.amountSar)}
            </p>
          ) : (
            <Skeleton className="mt-2 h-9 w-48 bg-white/10" />
          )}
          <p className="mt-1 text-sm text-hero-muted">
            {d ? t('dashboard.onItsWaySub', { count: d.onItsWay.count }) : ' '}
            {d && d.paidLast90Days.count > 0 && (
              <>
                {' '}
                · {t('dashboard.paidRecently', { amount: formatSar(d.paidLast90Days.amountSar) })}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="inverse">
            <Link to="/expenses/new">
              <Camera aria-hidden />
              {t('dashboard.scanReceipt')}
            </Link>
          </Button>
          <Button asChild>
            <Link to="/expenses/new">
              <Plus aria-hidden />
              {t('nav.newExpense')}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Receipt}
          label={t('dashboard.unreported')}
          value={d ? d.unreported.count : '—'}
          sub={d && formatSar(d.unreported.amountSar)}
          to="/expenses"
        />
        <StatCard
          icon={FilePen}
          label={t('dashboard.drafts')}
          value={d ? d.drafts.count : '—'}
          sub={d && formatSar(d.drafts.amountSar)}
          to="/reports"
        />
        <StatCard
          icon={CircleDollarSign}
          label={t('dashboard.openAdvance')}
          value={d?.openAdvance ? formatSar(d.openAdvance.amountSar) : '—'}
          sub={t('dashboard.advancesPhase2')}
        />
        <StatCard
          icon={Wallet}
          label={t('dashboard.quickPaysPending')}
          value={d ? d.quickPaysPending.count : '—'}
          sub={d && formatSar(d.quickPaysPending.amountSar)}
          to="/status"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 font-semibold">{t('dashboard.byCategory')}</h3>
          {!d ? (
            <Skeleton className="h-36" />
          ) : d.spendByCategory.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">{t('dashboard.noSpend')}</p>
          ) : (
            <DonutChart
              data={d.spendByCategory.map((c) => ({ label: c.typeName, amountSar: c.amountSar }))}
              centerLabel={t('dashboard.last90')}
              caption={t('dashboard.byCategory')}
              otherLabel={t('dashboard.other')}
            />
          )}
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 font-semibold">{t('dashboard.trend')}</h3>
          {!d ? (
            <Skeleton className="h-36" />
          ) : d.monthlyTrend.every((m) => parseSar(m.amountSar) === 0) ? (
            <p className="py-10 text-center text-sm text-muted">{t('dashboard.noSpend')}</p>
          ) : (
            <MonthBars
              data={d.monthlyTrend}
              caption={t('dashboard.trend')}
              formatMonth={formatMonth}
            />
          )}
        </Card>
      </div>
    </section>
  );
}

// ─── Approver (FR-DSH-02) ───────────────────────────────────────────────────

export function ApproverSection() {
  const { t } = useTranslation();
  const d = useApproverDashboard(true).data;
  return (
    <section aria-labelledby="dash-approver">
      <SectionTitle
        id="dash-approver"
        action={{ to: '/approvals', label: t('dashboard.openInbox') }}
      >
        {t('dashboard.approverTitle')}
      </SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={ListChecks}
          label={t('dashboard.waitingForYou')}
          value={d ? d.pending.count : '—'}
          sub={d && formatSar(d.pending.amountSar)}
          to="/approvals"
          tone={d && d.pending.count > 0 ? 'warn' : 'neutral'}
        />
        <StatCard
          icon={Hourglass}
          label={t('dashboard.oldest')}
          value={d?.oldestSince ? formatRelative(d.oldestSince) : '—'}
          sub={
            d && d.infoRequested > 0
              ? t('dashboard.infoRequested', { count: d.infoRequested })
              : undefined
          }
          to="/approvals"
        />
        <StatCard
          icon={Flag}
          label={t('dashboard.flagged')}
          value={d ? d.flagged : '—'}
          to="/approvals"
        />
        {d && d.audit.count > 0 ? (
          <StatCard
            icon={ShieldCheck}
            label={t('dashboard.audit')}
            value={d.audit.count}
            sub={formatSar(d.audit.amountSar)}
            to="/audit"
            tone="warn"
          />
        ) : (
          <StatCard
            icon={ShieldCheck}
            label={t('dashboard.decided')}
            value={d ? d.decidedThisMonth : '—'}
          />
        )}
      </div>
    </section>
  );
}

// ─── Finance (FR-DSH-03) ────────────────────────────────────────────────────

export function FinanceSection({ payables }: { payables: boolean }) {
  const { t } = useTranslation();
  const d = useFinanceDashboard(true).data;
  const totalPipeline = d ? d.pipeline.reduce((s, p) => s + parseSar(p.amountSar), 0) : 0;

  return (
    <section aria-labelledby="dash-finance" className="space-y-4">
      <SectionTitle
        id="dash-finance"
        action={
          payables ? { to: '/finance/payables', label: t('dashboard.openPayables') } : undefined
        }
      >
        {t('dashboard.financeTitle', { units: d?.businessUnits.join(' · ') ?? '' })}
      </SectionTitle>

      {d && (d.integrationErrors.failingJobs.length > 0 || d.integrationErrors.last24h > 0) && (
        <Link
          to="/admin/integrations"
          className="flex items-center gap-3 rounded-card border border-block/30 bg-block/5 px-4 py-3 text-sm hover:bg-block/10"
        >
          <AlertTriangle aria-hidden className="size-4 shrink-0 text-block" />
          <span className="flex-1">
            {t('dashboard.integrationErrors', { count: d.integrationErrors.last24h })}
            {d.integrationErrors.failingJobs.length > 0 && (
              <span className="text-muted">
                {' '}
                · {d.integrationErrors.failingJobs.map((f) => f.jobName).join(', ')}
              </span>
            )}
          </span>
          <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Landmark}
          label={t('dashboard.ready')}
          value={d ? formatSar(d.readyForPayment.amountSar) : '—'}
          sub={d && t('dashboard.reports', { count: d.readyForPayment.count })}
          to={payables ? '/finance/payables' : undefined}
        />
        <StatCard
          icon={FileClock}
          label={t('dashboard.invoiced')}
          value={d ? formatSar(d.invoicedUnpaid.amountSar) : '—'}
          sub={d && t('dashboard.reports', { count: d.invoicedUnpaid.count })}
          to={payables ? '/finance/payables?tab=INVOICED' : undefined}
        />
        <StatCard
          icon={CircleDollarSign}
          label={t('dashboard.paidMonth')}
          value={d ? formatSar(d.paidThisMonth.amountSar) : '—'}
          sub={d && t('dashboard.reports', { count: d.paidThisMonth.count })}
          to={payables ? '/finance/payables?tab=PAID' : undefined}
        />
        <StatCard
          icon={Wallet}
          label={t('dashboard.quickPaysToInvoice')}
          value={d ? d.quickPaysPending.count : '—'}
          sub={d && formatSar(d.quickPaysPending.amountSar)}
          to={payables ? '/finance/quick-pays' : undefined}
          tone={d && d.sendErrors > 0 ? 'block' : 'neutral'}
        />
      </div>

      {/* FR-DSH-03 pipeline by stage. */}
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">{t('dashboard.pipeline')}</h3>
        {!d ? (
          <Skeleton className="h-16" />
        ) : (
          <>
            <div className="flex h-3 overflow-hidden rounded-pill bg-surface-2" aria-hidden>
              {d.pipeline.map((p, i) => {
                const share = totalPipeline ? (parseSar(p.amountSar) / totalPipeline) * 100 : 0;
                return share > 0 ? (
                  <span
                    key={p.status}
                    style={{ width: `${share}%`, background: `var(--color-chart-${i + 1})` }}
                  />
                ) : null;
              })}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {d.pipeline.map((p, i) => (
                <div key={p.status}>
                  <dt className="flex items-center gap-1.5 text-xs text-muted">
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ background: `var(--color-chart-${i + 1})` }}
                    />
                    {t(`reports.status.${p.status}`)}
                    {p.status === 'PAID' && ` · ${t('dashboard.thisMonth')}`}
                  </dt>
                  <dd
                    className={cn('text-sm font-semibold tabular', p.count === 0 && 'text-muted')}
                  >
                    {formatSar(p.amountSar)}
                    <span className="ms-1 text-xs font-normal text-muted">({p.count})</span>
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}
      </Card>
    </section>
  );
}
