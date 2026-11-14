// D-36 dev Fusion simulator (dev builds only): exercise Payables invoice status transitions.
import {
  SIMULATOR_ACTIONS,
  type DevFusionState,
  type SimulatorActionName,
} from '@expensehub/shared';
import type { CSSProperties } from 'react';
import { Bug, ExternalLink, FlaskConical, RefreshCw, ServerCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { Switch } from '../../components/ui/Switch';
import { Tag } from '../../components/ui/Tag';
import { formatDate, formatSar } from '../../lib/format';
import { useAutoAdvance, useDevFusion, useFailNext, useSimulatorAction } from './fusionHooks';

type Invoice = DevFusionState['invoices'][number];

/** Which simulator buttons make sense for an invoice's state. */
function allowed(i: Invoice): SimulatorActionName[] {
  if (i.canceled) return [];
  const paid = i.paidStatus === 'Paid';
  return SIMULATOR_ACTIONS.filter((a) =>
    a === 'validate'
      ? i.validationStatus !== 'Validated'
      : a === 'pay'
        ? !paid
        : a === 'cancel'
          ? !paid
          : paid,
  );
}

export function FusionSimulatorPage() {
  const { t } = useTranslation();
  const state = useDevFusion();
  const act = useSimulatorAction();
  const auto = useAutoAdvance();
  const failNext = useFailNext();
  const data = state.data;

  return (
    <div className="eh-dev-fusion">
      <PageHeader
        eyebrow={t('devFusion.eyebrow')}
        title={t('devFusion.title')}
        actions={
          <div className="eh-dev-fusion__header-actions">
            <Tag tone="warn">{t('common.devOnly')}</Tag>
            <Button
              variant="secondary"
              size="sm"
              loading={state.isFetching}
              onClick={() => void state.refetch()}
            >
              {!state.isFetching && <RefreshCw aria-hidden />}
              {t('devFusion.refresh')}
            </Button>
            {data && (
              <Button asChild variant="secondary" size="sm">
                <a
                  href={`${data.fusionPodUrl}/fscmUI/faces/FuseWelcome`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink aria-hidden />
                  {t('payables.openPod')}
                </a>
              </Button>
            )}
          </div>
        }
      />

      {state.isError && !data ? (
        <Card className="eh-setup__list-card p-8 text-center">
          <p className="text-sm text-block">{state.error.message}</p>
          <Button variant="secondary" className="mt-3" onClick={() => void state.refetch()}>
            {t('app.retry')}
          </Button>
        </Card>
      ) : (
        <>
          {state.isPending ? (
            <div className="eh-dev-fusion__controls" aria-busy="true">
              <Card className="eh-setup__list-card p-4">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="mt-2 h-4 w-3/4" />
              </Card>
              <Card className="eh-setup__list-card p-4">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="mt-2 h-4 w-3/4" />
              </Card>
            </div>
          ) : data ? (
            <div className="eh-dev-fusion__controls">
              <Card className="eh-setup__list-card eh-dev-fusion__control-card">
                <div className="min-w-0">
                  <label htmlFor="auto-advance" className="flex items-center gap-2 font-semibold">
                    <FlaskConical aria-hidden className="size-4 text-brand" />
                    {t('devFusion.autoAdvance')}
                  </label>
                  <p className="mt-1 text-xs text-muted">{t('devFusion.autoAdvanceHint')}</p>
                </div>
                <Switch
                  id="auto-advance"
                  checked={data.autoAdvance}
                  disabled={auto.isPending}
                  onCheckedChange={(value) =>
                    void auto.mutateAsync(value).catch((err: Error) => toast.error(err.message))
                  }
                />
              </Card>
              <Card className="eh-setup__list-card eh-dev-fusion__control-card">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold">
                    <Bug aria-hidden className="size-4 text-block" />
                    {t('devFusion.failNext')}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {data.pendingFailures.length
                      ? t('devFusion.failPending', {
                          status: data.pendingFailures[0]!.httpStatus ?? 'network',
                        })
                      : t('devFusion.failHint')}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={failNext.isPending}
                  onClick={() =>
                    failNext
                      .mutateAsync(400)
                      .then(() => toast.success(t('devFusion.failArmed')))
                      .catch((err: Error) => toast.error(err.message))
                  }
                >
                  {t('devFusion.failButton')}
                </Button>
              </Card>
            </div>
          ) : null}

          <Card className="eh-setup__list-card eh-dev-fusion__invoice-card">
            <div className="eh-setup__table-head eh-dev-fusion__table-head">
              <div>
                <h2>{t('devFusion.invoicesTitle')}</h2>
                <p>{t('devFusion.description')}</p>
              </div>
              {data && (
                <span className="eh-setup__count">
                  {t('devFusion.invoiceCount', { count: data.invoices.length })}
                </span>
              )}
            </div>

            {state.isPending ? (
              <div className="space-y-2 p-3" aria-busy="true">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : !data || data.invoices.length === 0 ? (
              <EmptyState
                icon={ServerCog}
                title={t('devFusion.empty')}
                body={t('devFusion.emptyBody')}
              />
            ) : (
              <table className="eh-setup__data-table eh-dev-fusion__table w-full">
                <thead>
                  <tr>
                    <th scope="col" className="text-start">
                      {t('devFusion.invoice')}
                    </th>
                    <th scope="col" className="text-start">
                      {t('devFusion.supplier')}
                    </th>
                    <th scope="col" className="text-center">
                      {t('devFusion.status')}
                    </th>
                    <th scope="col" className="text-end">
                      {t('devFusion.amount')}
                    </th>
                    <th scope="col" className="text-center">
                      {t('devFusion.actionsLabel')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((invoice, rowIndex) => (
                    <tr
                      key={invoice.invoiceId}
                      className="eh-setup__data-row"
                      style={{ '--eh-setup-row-index': rowIndex } as CSSProperties}
                    >
                      <td data-label={t('devFusion.invoice')}>
                        <span className="block break-words font-mono font-semibold">
                          {invoice.invoiceNumber}
                        </span>
                        <span className="mt-1 block text-[10px] text-muted">
                          ID {invoice.invoiceId} · {formatDate(invoice.invoiceDate)}
                        </span>
                        {invoice.ref && (
                          <Link
                            to={
                              invoice.ref.kind === 'REPORT'
                                ? `/reports/${invoice.ref.id}`
                                : '/finance/quick-pays'
                            }
                            className="mt-1 inline-block text-[10px] font-semibold text-brand-solid hover:underline dark:text-brand"
                          >
                            {t(`devFusion.ref.${invoice.ref.kind}`, { status: invoice.ref.status })}
                          </Link>
                        )}
                      </td>
                      <td data-label={t('devFusion.supplier')}>
                        <span className="block break-words font-semibold">{invoice.supplier}</span>
                        <span className="mt-1 block text-[10px] text-muted">
                          {invoice.supplierNumber} · {invoice.businessUnit}
                        </span>
                        <span className="mt-1 block text-[10px] text-muted">
                          {t('devFusion.lines', { count: invoice.lines })} ·{' '}
                          {t('devFusion.attachments', { count: invoice.attachments })}
                        </span>
                        {invoice.payments.map((payment) => (
                          <span
                            key={payment.paymentNumber}
                            className="mt-1 block text-[10px] text-muted"
                          >
                            {t('devFusion.payment', {
                              ref: payment.paymentNumber,
                              date: formatDate(payment.paymentDate),
                              status: payment.status,
                            })}
                          </span>
                        ))}
                      </td>
                      <td data-label={t('devFusion.status')} className="text-center">
                        <div className="eh-dev-fusion__status">
                          {invoice.canceled && <Tag tone="block">{t('devFusion.cancelled')}</Tag>}
                          <Tag
                            tone={
                              invoice.canceled
                                ? 'block'
                                : invoice.validationStatus === 'Validated'
                                  ? 'pass'
                                  : 'neutral'
                            }
                          >
                            {invoice.validationStatus}
                          </Tag>
                          <Tag tone={invoice.paidStatus === 'Paid' ? 'pass' : 'neutral'}>
                            {invoice.paidStatus}
                          </Tag>
                        </div>
                      </td>
                      <td data-label={t('devFusion.amount')} className="text-end">
                        <span className="font-semibold tabular">{formatSar(invoice.amount)}</span>
                      </td>
                      <td data-label={t('devFusion.actionsLabel')} className="text-center">
                        <div className="eh-dev-fusion__row-actions">
                          {allowed(invoice).map((action) => (
                            <Button
                              key={action}
                              size="sm"
                              variant={
                                action === 'pay'
                                  ? 'primary'
                                  : action === 'validate'
                                    ? 'secondary'
                                    : 'ghost'
                              }
                              className={
                                action === 'cancel' || action === 'void' ? 'text-block' : undefined
                              }
                              disabled={act.isPending}
                              onClick={() =>
                                act
                                  .mutateAsync({ invoiceId: invoice.invoiceId, action })
                                  .then(() => toast.success(t(`devFusion.done.${action}`)))
                                  .catch((err: Error) => toast.error(err.message))
                              }
                              aria-label={`${t(`devFusion.actions.${action}`)} ${invoice.invoiceNumber}`}
                            >
                              {t(`devFusion.actions.${action}`)}
                            </Button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
