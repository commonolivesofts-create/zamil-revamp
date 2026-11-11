// System status (admins): live health of the API and its D-33 run modes.
import {
  Database,
  FlaskConical,
  Mail,
  RefreshCw,
  Server,
  Tag as TagIcon,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tag } from '../../components/ui/Tag';
import { cn } from '../../lib/cn';
import { formatDuration, formatTime } from '../../lib/format';
import { HEALTH_REFRESH_MS, useHealth, type HealthSnapshot } from './useHealth';

type Overall = 'ok' | 'degraded' | 'down';

const dotClass: Record<Overall, string> = { ok: 'bg-pass', degraded: 'bg-warn', down: 'bg-block' };

export function StatusPage() {
  const { t } = useTranslation();
  const health = useHealth();
  const online = health.status === 'success';
  const data = health.data;
  const overall: Overall = !online ? 'down' : data?.status === 'ok' ? 'ok' : 'degraded';

  return (
    <>
      <PageHeader
        eyebrow={t('status.eyebrow')}
        title={t('status.title')}
        description={t('status.subtitle', { seconds: HEALTH_REFRESH_MS / 1000 })}
        actions={
          <div className="eh-health__header-actions">
            <Tag tone={overall === 'ok' ? 'pass' : overall === 'degraded' ? 'warn' : 'block'}>
              {t(
                overall === 'ok'
                  ? 'status.operational'
                  : overall === 'degraded'
                    ? 'status.degraded'
                    : 'status.unreachable',
              )}
            </Tag>
            <Button
              variant="secondary"
              size="sm"
              loading={health.isFetching}
              onClick={() => void health.refetch()}
            >
              {!health.isFetching && <RefreshCw aria-hidden />}
              {t('status.checkNow')}
            </Button>
          </div>
        }
      />
      <div>
        {health.isPending ? (
          <HeroSkeleton />
        ) : (
          <Hero overall={overall} data={online ? data : undefined} />
        )}
      </div>

      <div className="mb-3 mt-6">
        <h2 className="text-sm font-bold">{t('status.servicesTitle')}</h2>
        <p className="mt-1 text-xs text-muted">{t('status.servicesDescription')}</p>
      </div>
      <section
        aria-label={t('status.eyebrow')}
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {health.isPending ? (
          Array.from({ length: 6 }, (_, i) => <ServiceCardSkeleton key={i} />)
        ) : (
          <ServiceCards online={online} data={data} />
        )}
      </section>

      <p className="eh-health__note mt-6 flex items-center gap-2 text-xs text-muted">
        <FlaskConical aria-hidden className="size-3.5" />
        {t('status.footer')}
      </p>
    </>
  );
}

function Hero({ overall, data }: { overall: Overall; data: HealthSnapshot | undefined }) {
  const { t } = useTranslation();
  const title = {
    ok: t('status.operational'),
    degraded: t('status.degraded'),
    down: t('status.unreachable'),
  }[overall];
  const meta = data
    ? t('status.checkedAt', { time: formatTime(data.checkedAt) })
    : t('status.unreachableHint');

  return (
    <section
      aria-live="polite"
      className={cn('eh-health__hero', overall === 'ok' && 'is-operational')}
    >
      <div
        aria-hidden
        className={cn(
          'eh-health__glow pointer-events-none absolute -top-28 -end-24 size-80 rounded-full opacity-20 blur-3xl',
          dotClass[overall],
        )}
      />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="relative flex size-3">
              {overall === 'ok' && (
                <span
                  className={cn(
                    'absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping',
                    dotClass[overall],
                  )}
                />
              )}
              <span className={cn('relative inline-flex size-3 rounded-full', dotClass[overall])} />
            </span>
            <h2 className="text-xl font-bold tracking-tight">{title}</h2>
          </div>
          <p className="mt-2 text-sm text-muted">{meta}</p>
        </div>

        <div className="flex items-end gap-5 sm:justify-end">
          {data && (
            <div className="eh-health__latency">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                {t('status.latency')}
              </p>
              <p className="tabular text-2xl font-bold tracking-tight">
                {data.latencyMs}
                <span className="ms-1 text-sm font-semibold text-muted">{t('status.ms')}</span>
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ServiceCards({ online, data }: { online: boolean; data: HealthSnapshot | undefined }) {
  const { t } = useTranslation();
  const unknown = <Tag>{t('status.tags.unknown')}</Tag>;
  const isDev = data ? data.env !== 'production' : true;

  return (
    <>
      <ServiceCard
        icon={Server}
        label={t('status.cards.api.label')}
        value={online ? t('status.cards.api.online') : t('status.cards.api.offline')}
        detail={
          online && data
            ? t('status.cards.api.detail', { uptime: formatDuration(data.uptimeSeconds) })
            : t('status.cards.api.offlineDetail')
        }
        tag={
          online ? (
            <Tag tone="pass">{t('status.tags.healthy')}</Tag>
          ) : (
            <Tag tone="block">{t('status.tags.down')}</Tag>
          )
        }
      />
      <ServiceCard
        icon={Database}
        label={t('status.cards.data.label')}
        value={data ? t(`status.cards.data.${data.dataMode}`) : t('status.unknown')}
        detail={
          !data
            ? undefined
            : data.db === 'error'
              ? t('status.cards.data.error')
              : t(`status.cards.data.${data.dataMode}Detail`)
        }
        tag={
          !data || !online ? (
            unknown
          ) : data.db === 'error' ? (
            <Tag tone="block">{t('status.tags.down')}</Tag>
          ) : data.dataMode === 'memory' ? (
            <Tag tone="info">{t('status.tags.dev')}</Tag>
          ) : (
            <Tag tone="pass">{t('status.tags.healthy')}</Tag>
          )
        }
      />
      <ServiceCard
        icon={Workflow}
        label={t('status.cards.fusion.label')}
        value={data ? t(`status.cards.fusion.${data.fusionMode}`) : t('status.unknown')}
        detail={data ? t(`status.cards.fusion.${data.fusionMode}Detail`) : undefined}
        tag={modeTag(data?.fusionMode === 'mock', data, online, unknown)}
      />
      <ServiceCard
        icon={Mail}
        label={t('status.cards.notify.label')}
        value={data ? t(`status.cards.notify.${data.notifyTransport}`) : t('status.unknown')}
        detail={data ? t(`status.cards.notify.${data.notifyTransport}Detail`) : undefined}
        tag={modeTag(data?.notifyTransport === 'outbox', data, online, unknown)}
      />
      <ServiceCard
        icon={FlaskConical}
        label={t('status.cards.env.label')}
        value={data ? t(`status.cards.env.${data.env}`) : t('status.unknown')}
        detail={
          data
            ? isDev
              ? t('status.cards.env.devDetail')
              : t('status.cards.env.prodDetail')
            : undefined
        }
        tag={!data ? unknown : isDev ? <Tag tone="warn">{t('status.tags.dev')}</Tag> : undefined}
      />
      <ServiceCard
        icon={TagIcon}
        label={t('status.cards.release.label')}
        value={data ? `v${data.version}` : t('status.unknown')}
        detail={t('status.cards.release.detail')}
      />
    </>
  );

  function modeTag(
    devMode: boolean,
    snapshot: HealthSnapshot | undefined,
    isOnline: boolean,
    fallback: ReactNode,
  ) {
    if (!snapshot || !isOnline) return fallback;
    return devMode ? (
      <Tag tone="info">{t('status.tags.dev')}</Tag>
    ) : (
      <Tag tone="pass">{t('status.tags.healthy')}</Tag>
    );
  }
}

function ServiceCard({
  icon: Icon,
  label,
  value,
  detail,
  tag,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
  tag?: ReactNode;
}) {
  return (
    <Card className="eh-health__service-card group p-4 transition-shadow duration-200 hover:shadow-raised">
      <div className="flex items-start justify-between gap-3">
        <span className="eh-health__service-icon grid size-9 place-items-center rounded-input bg-surface-2 text-brand-solid transition-colors">
          <Icon aria-hidden className="size-[18px]" strokeWidth={1.75} />
        </span>
        {tag}
      </div>
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
      {detail && <p className="mt-1 text-sm text-muted">{detail}</p>}
    </Card>
  );
}

function HeroSkeleton() {
  return (
    <div className="eh-health__hero" aria-busy="true">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="h-7 w-64 rounded-input bg-brand/10 motion-safe:animate-pulse" />
          <div className="mt-3 h-4 w-48 rounded-input bg-brand/10 motion-safe:animate-pulse" />
        </div>
        <div className="h-11 w-24 rounded-input bg-brand/10 motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

function ServiceCardSkeleton() {
  return (
    <Card className="eh-health__service-card p-4" aria-busy="true">
      <Skeleton className="size-9" />
      <Skeleton className="mt-4 h-3 w-20" />
      <Skeleton className="mt-2 h-5 w-32" />
      <Skeleton className="mt-2 h-4 w-44" />
    </Card>
  );
}
