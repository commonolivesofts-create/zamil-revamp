// D-36 dev Fusion simulator (dev builds only): what Payables does in Oracle Fusion — validate,
// pay (payment process request), cancel, void — on the mock invoices ExpenseHub created. Each
// action runs the INT-09 status poll. The "Open in Fusion test pod" link is for use from M8.
import {
  SIMULATOR_ACTIONS,
  type DevFusionState,
  type SimulatorActionName,
} from '@expensehub/shared';
import { Bug, ExternalLink, FlaskConical, ServerCog } from 'lucide-react';
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
    <div>
      <PageHeader
        eyebrow={t('devFusion.eyebrow')}
        title={t('devFusion.title')}
        description={t('devFusion.description')}
        actions={
          data && (
            <a
              href={`${data.fusionPodUrl}/fscmUI/faces/FuseWelcome`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-input border border-border bg-surface px-4 text-sm font-medium shadow-card hover:bg-surface-2"
            >
              <ExternalLink aria-hidden className="size-4" />
              {t('payables.openPod')}
            </a>
          )
        }
      />

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Card className="flex items-center justify-between gap-4 p-4">
          <div>
            <label htmlFor="auto-advance" className="flex items-center gap-2 font-medium">
              <FlaskConical aria-hidden className="size-4 text-brand" />
              {t('devFusion.autoAdvance')}
            </label>
            <p className="text-xs text-muted">{t('devFusion.autoAdvanceHint')}</p>
          </div>
          <Switch
            id="auto-advance"
            checked={data?.autoAdvance ?? false}
            disabled={!data || auto.isPending}
            onCheckedChange={(v) =>
              void auto.mutateAsync(v).catch((err: Error) => toast.error(err.message))
            }
          />
        </Card>
        <Card className="flex items-center justify-between gap-4 p-4">
          <div>
            <p className="flex items-center gap-2 font-medium">
              <Bug aria-hidden className="size-4 text-block" />
              {t('devFusion.failNext')}
            </p>
            <p className="text-xs text-muted">
              {data?.pendingFailures.length
                ? t('devFusion.failPending', {
                    status: data.pendingFailures[0]!.httpStatus ?? 'network',
                  })
                : t('devFusion.failHint')}
            </p>
          </div>
          <Button
            variant="secondary"
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

      <Card className="overflow-hidden">
        {!data ? (
          <Skeleton className="m-5 h-24" />
        ) : data.invoices.length === 0 ? (
          <EmptyState
            icon={ServerCog}
            title={t('devFusion.empty')}
            body={t('devFusion.emptyBody')}
          />
        ) : (
          <ul className="divide-y divide-border">
            {data.invoices.map((i) => (
              <li
                key={i.invoiceId}
                className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-medium">{i.invoiceNumber}</span>
                    <Tag
                      tone={
                        i.canceled
                          ? 'block'
                          : i.validationStatus === 'Validated'
                            ? 'pass'
                            : 'neutral'
                      }
                    >
                      {i.validationStatus}
                    </Tag>
                    <Tag tone={i.paidStatus === 'Paid' ? 'pass' : 'neutral'}>{i.paidStatus}</Tag>
                  </p>
                  <p className="text-sm text-muted">
                    {i.supplier} ({i.supplierNumber}) · {i.businessUnit} ·{' '}
                    {formatDate(i.invoiceDate)} · {t('devFusion.lines', { count: i.lines })} ·{' '}
                    {t('devFusion.attachments', { count: i.attachments })} · ID {i.invoiceId}
                  </p>
                  {i.payments.map((p) => (
                    <p key={p.paymentNumber} className="text-xs text-muted">
                      {t('devFusion.payment', {
                        ref: p.paymentNumber,
                        date: formatDate(p.paymentDate),
                        status: p.status,
                      })}
                    </p>
                  ))}
                  {i.ref && (
                    <Link
                      to={i.ref.kind === 'REPORT' ? `/reports/${i.ref.id}` : '/finance/quick-pays'}
                      className="text-xs font-medium text-brand-solid hover:underline dark:text-brand"
                    >
                      {t(`devFusion.ref.${i.ref.kind}`, { status: i.ref.status })}
                    </Link>
                  )}
                </div>
                <p className="text-lg font-semibold tabular">{formatSar(i.amount)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {allowed(i).map((action) => (
                    <Button
                      key={action}
                      size="sm"
                      variant={
                        action === 'pay' ? 'primary' : action === 'validate' ? 'secondary' : 'ghost'
                      }
                      className={
                        action === 'cancel' || action === 'void' ? 'text-block' : undefined
                      }
                      disabled={act.isPending}
                      onClick={() =>
                        act
                          .mutateAsync({ invoiceId: i.invoiceId, action })
                          .then(() => toast.success(t(`devFusion.done.${action}`)))
                          .catch((err: Error) => toast.error(err.message))
                      }
                      aria-label={`${t(`devFusion.actions.${action}`)} ${i.invoiceNumber}`}
                    >
                      {t(`devFusion.actions.${action}`)}
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
