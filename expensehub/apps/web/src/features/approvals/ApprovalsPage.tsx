// UI-UX §5.4 approval inbox (FR-DSH-02, FR-APR-04): claimant + BU, report, purpose, amount, age,
// flags; inline Approve / Reject (reason); row → drawer; bulk approve only for rows without flags.
import type { InboxItem } from '@expensehub/shared';
import { CheckCheck, Inbox, Search } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { ReasonDialog } from '../../components/ui/ReasonDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tag } from '../../components/ui/Tag';
import { cn } from '../../lib/cn';
import { formatRelative, formatSar } from '../../lib/format';
import { useDecision, useInbox } from '../reports/hooks';
import { ReportDrawer } from '../reports/ReportDrawer';

type ApprovalFilter = 'all' | 'approvals' | 'audits' | 'flagged';

export function ApprovalsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const openId = params.get('report');
  const inbox = useInbox();
  const decision = useDecision();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rejecting, setRejecting] = useState<InboxItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<ApprovalFilter>('all');
  const [query, setQuery] = useState('');

  const items = inbox.data ?? [];
  const clean = items.filter((i) => i.flags.length === 0 && i.kind === 'APPROVAL');
  const chosen = clean.filter((i) => selected.has(i.stepId));
  const counts: Record<ApprovalFilter, number> = {
    all: items.length,
    approvals: items.filter((i) => i.kind === 'APPROVAL').length,
    audits: items.filter((i) => i.kind === 'AUDIT').length,
    flagged: items.filter((i) => i.flags.length > 0).length,
  };
  const needle = query.trim().toLocaleLowerCase();
  const visibleItems = items.filter((row) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'approvals' && row.kind === 'APPROVAL') ||
      (filter === 'audits' && row.kind === 'AUDIT') ||
      (filter === 'flagged' && row.flags.length > 0);
    const matchesQuery =
      !needle ||
      [row.claimantName, row.reportNumber ?? '', row.purpose, row.stepName, row.businessUnit]
        .join(' ')
        .toLocaleLowerCase()
        .includes(needle);
    return matchesFilter && matchesQuery;
  });

  const changeFilter = (next: ApprovalFilter) => {
    setFilter(next);
    setSelected(new Set());
  };

  const changeQuery = (next: string) => {
    setQuery(next);
    setSelected(new Set());
  };

  const approve = async (rows: InboxItem[]) => {
    setBusy(true);
    let ok = 0;
    for (const row of rows) {
      try {
        await decision.mutateAsync({ stepId: row.stepId, decision: 'approve' });
        ok++;
      } catch (err) {
        toast.error(`${row.reportNumber}: ${(err as Error).message}`);
      }
    }
    setBusy(false);
    setSelected(new Set());
    if (ok) toast.success(t('approvals.approved', { count: ok }));
  };

  return (
    <div className="eh-approvals" aria-busy={inbox.isPending || undefined}>
      <PageHeader
        eyebrow={t('approvals.eyebrow')}
        title={t('approvals.title')}
        description={t('approvals.description')}
        actions={
          chosen.length > 0 && (
            <Button loading={busy} onClick={() => void approve(chosen)}>
              <CheckCheck aria-hidden />
              {t('approvals.bulk', { count: chosen.length })}
            </Button>
          )
        }
      />

      <div className="eh-approvals__toolbar">
        <div
          className="eh-reports__filters eh-approvals__filters"
          role="group"
          aria-label={t('approvals.filterLabel')}
        >
          {(['all', 'approvals', 'audits', 'flagged'] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => changeFilter(key)}
              className={cn('eh-reports__filter', filter === key && 'is-active')}
            >
              {t(`approvals.filters.${key}`)}
              <span className="eh-reports__filter-count tabular">{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="eh-reports__search eh-approvals__search">
          <Search
            aria-hidden
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
            placeholder={t('approvals.search')}
            aria-label={t('approvals.search')}
            className="eh-reports__search-input ps-9"
          />
        </div>
      </div>

      <Card className="eh-approvals__list overflow-hidden">
        {inbox.isPending ? (
          <ul className="eh-approvals__rows divide-y divide-border" aria-hidden="true">
            {Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="eh-approvals__loading-row">
                <Skeleton className="size-4" />
                <Skeleton className="size-9 rounded-full" />
                <div className="eh-approvals__loading-copy">
                  <Skeleton className="h-3 w-36" />
                  <Skeleton className="h-4 w-56 max-w-full" />
                  <Skeleton className="h-3 w-40 max-w-full" />
                </div>
                <div className="eh-approvals__loading-total">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="eh-approvals__loading-actions h-8 w-28" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <EmptyState icon={Inbox} title={t('approvals.empty')} body={t('approvals.emptyBody')} />
        ) : visibleItems.length === 0 ? (
          <EmptyState icon={Search} title={t('approvals.noMatch')} />
        ) : (
          <ul
            className="eh-approvals__rows divide-y divide-border"
            aria-label={t('approvals.title')}
          >
            {visibleItems.map((row) => {
              const flagged = row.flags.length > 0 || row.kind === 'AUDIT';
              return (
                <li
                  key={row.stepId}
                  className={cn(
                    'eh-approvals__row',
                    flagged && 'is-flagged',
                    row.kind === 'AUDIT' && 'is-audit',
                    selected.has(row.stepId) && 'is-selected',
                  )}
                >
                  <input
                    type="checkbox"
                    className="eh-approvals__select accent-[var(--color-brand-solid)] disabled:opacity-30"
                    disabled={flagged}
                    title={row.flags.length > 0 ? t('approvals.flaggedNoBulk') : undefined}
                    checked={selected.has(row.stepId)}
                    onChange={() =>
                      setSelected((s) => {
                        const next = new Set(s);
                        if (next.has(row.stepId)) next.delete(row.stepId);
                        else next.add(row.stepId);
                        return next;
                      })
                    }
                    aria-label={t('approvals.select', { number: row.reportNumber })}
                  />
                  <Avatar name={row.claimantName} className="eh-approvals__avatar" />
                  <button
                    type="button"
                    onClick={() => void navigate(`/approvals?report=${row.reportId}`)}
                    className="eh-approvals__summary"
                  >
                    <span className="eh-approvals__meta">
                      <span className="eh-approvals__claimant">{row.claimantName}</span>
                      <span className="eh-approvals__context">
                        {row.businessUnit} <span aria-hidden="true">·</span>{' '}
                        <span className="font-mono">{row.reportNumber}</span>{' '}
                        <span aria-hidden="true">·</span>{' '}
                        {t('approvals.asStep', { step: row.stepName })}
                      </span>
                    </span>
                    <span className="eh-approvals__purpose">{row.purpose}</span>
                    <span className="eh-approvals__flags">
                      {row.kind === 'AUDIT' && <Tag tone="info">{t('audit.tag')}</Tag>}
                      {row.flags.map((f) => (
                        <Tag key={f} tone={f === 'INFO_REQUESTED' ? 'info' : 'warn'}>
                          {t(`approvals.flags.${f}`)}
                        </Tag>
                      ))}
                    </span>
                  </button>
                  <div className="eh-approvals__amount">
                    <span>{formatSar(row.totalSar)}</span>
                    <span>
                      {t('approvals.waiting', { when: formatRelative(row.pendingSince) })}
                    </span>
                  </div>
                  <div className="eh-approvals__actions">
                    {row.kind === 'AUDIT' ? (
                      <Button asChild size="sm">
                        <Link to={`/audit/${row.reportId}`}>{t('audit.open')}</Link>
                      </Button>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="text-block"
                          onClick={() => setRejecting(row)}
                          aria-label={t('approvals.rejectRow', { number: row.reportNumber })}
                        >
                          {t('reports.actions.reject')}
                        </Button>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => void approve([row])}
                          aria-label={t('approvals.approveRow', { number: row.reportNumber })}
                        >
                          {t('reports.actions.approve')}
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <ReasonDialog
        open={rejecting !== null}
        onOpenChange={(o) => !o && setRejecting(null)}
        title={t('reports.rejectTitle', { number: rejecting?.reportNumber ?? '' })}
        body={t('reports.rejectBody')}
        label={t('reports.reason')}
        confirmLabel={t('reports.actions.reject')}
        tone="danger"
        pending={decision.isPending}
        onConfirm={async (comment) => {
          try {
            await decision.mutateAsync({ stepId: rejecting!.stepId, decision: 'reject', comment });
            toast.success(t('reports.decided.reject'));
            setRejecting(null);
          } catch (err) {
            toast.error((err as Error).message);
          }
        }}
      />

      <ReportDrawer
        reportId={openId ? Number(openId) : null}
        onClose={() => void navigate('/approvals')}
      />
    </div>
  );
}
