// FR-SET-02 prerequisite exceptions report (API §10: Adm, Fin for their BUs).
import {
  BUSINESS_UNITS,
  PREREQUISITE_CODES,
  prerequisitesResponseSchema,
  type BusinessUnit,
  type PrerequisitesResponse,
} from '@expensehub/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  Check,
  CircleCheck,
  CircleX,
  FileText,
  PartyPopper,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { useCallback, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { PageHeader } from '../../components/ui/PageHeader';
import { ReportPager } from '../../components/ui/ReportPager';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tag } from '../../components/ui/Tag';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { downloadCsv, printPdf } from '../../lib/report-export';

const PAGE_SIZE = 10;
type PrerequisiteRow = PrerequisitesResponse['items'][number];
type PrerequisiteStatus = 'all' | 'ready' | 'blocked';
type PrerequisiteFilters = {
  query: string;
  businessUnit: BusinessUnit | null;
  status: PrerequisiteStatus;
};
const DEFAULT_FILTERS: PrerequisiteFilters = {
  query: '',
  businessUnit: null,
  status: 'blocked',
};

export function PrerequisitesPage() {
  const { t } = useTranslation();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<PrerequisiteFilters>(DEFAULT_FILTERS);
  const [draft, setDraft] = useState<PrerequisiteFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const failingOnly = filters.status === 'blocked';

  const query = useQuery({
    queryKey: ['prerequisites', filters.businessUnit, failingOnly],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (filters.businessUnit) params.set('bu', filters.businessUnit);
      if (failingOnly) params.set('failingOnly', 'true');
      return api(`/setup/prerequisites?${params}`, prerequisitesResponseSchema, { signal });
    },
    placeholderData: (previous) => previous,
  });

  const filtered = useMemo(() => {
    const search = filters.query.trim().toLowerCase();
    return (query.data?.items ?? []).filter((row) => {
      const matchesStatus =
        filters.status === 'all' || (filters.status === 'ready' ? row.ok : !row.ok);
      const matchesSearch =
        !search ||
        [
          row.fullName,
          row.personNumber,
          row.jobName,
          row.businessUnit,
          ...row.checks.flatMap((check) => [check.code, check.message]),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(search);
      return matchesStatus && matchesSearch;
    });
  }, [filters, query.data]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeFilters =
    Number(Boolean(filters.query.trim())) +
    Number(Boolean(filters.businessUnit)) +
    Number(filters.status !== 'all');

  const exportColumns = useMemo(
    () => [
      { label: t('prereq.person'), value: (row: PrerequisiteRow) => row.fullName },
      { label: t('prereq.personNumber'), value: (row: PrerequisiteRow) => row.personNumber },
      { label: t('prereq.position'), value: (row: PrerequisiteRow) => row.jobName ?? '' },
      { label: t('prereq.businessUnit'), value: (row: PrerequisiteRow) => row.businessUnit },
      {
        label: t('prereq.missingRequirements'),
        value: (row: PrerequisiteRow) => {
          const missing = row.checks
            .filter((check) => !check.ok)
            .map((check) => t(`prereq.${check.code}`));
          return missing.length ? missing.join(', ') : t('prereq.noneMissing');
        },
      },
      {
        label: t('prereq.status'),
        value: (row: PrerequisiteRow) => t(row.ok ? 'prereq.ready' : 'prereq.blocked'),
      },
    ],
    [t],
  );

  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setFilters(draft);
    setPage(1);
    setFiltersOpen(false);
  };
  const resetFilters = () => {
    setDraft(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  };
  const exportCsv = useCallback(
    () => downloadCsv(filtered, exportColumns, 'prerequisites'),
    [exportColumns, filtered],
  );
  const exportPdf = useCallback(() => {
    const opened = printPdf(
      filtered,
      exportColumns,
      t('prereq.exportTitle'),
      t('prereq.exportMeta', {
        count: filtered.length,
        date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date()),
      }),
    );
    if (!opened) toast.error(t('setup.listing.popupBlocked'));
  }, [exportColumns, filtered, t]);

  const headerActions = (
    <>
      <Button
        className="eh-setup__header-action"
        variant="secondary"
        size="sm"
        onClick={exportCsv}
        disabled={!filtered.length}
      >
        <ArrowDownToLine aria-hidden />
        {t('setup.listing.csv')}
      </Button>
      <Button
        className="eh-setup__header-action"
        variant="secondary"
        size="sm"
        onClick={exportPdf}
        disabled={!filtered.length}
      >
        <FileText aria-hidden />
        {t('setup.listing.pdf')}
      </Button>
      <Button
        className={cn(
          'eh-setup__header-action eh-setup__filter-button',
          (filtersOpen || activeFilters > 0) && 'is-active',
        )}
        variant="secondary"
        size="sm"
        aria-expanded={filtersOpen}
        aria-controls="prerequisite-filters"
        onClick={() => {
          setDraft(filters);
          setFiltersOpen((isOpen) => !isOpen);
        }}
      >
        <SlidersHorizontal aria-hidden />
        {t('setup.listing.filter')}
        {activeFilters > 0 && <span className="eh-setup__filter-count">{activeFilters}</span>}
      </Button>
    </>
  );

  return (
    <>
      <PageHeader
        title={t('prereq.title')}
        description={t('prereq.description')}
        actions={headerActions}
      />

      <Card className="eh-setup__list-card overflow-hidden">
        <div className="eh-setup__table-head">
          <div>
            <h2>{t('prereq.tableTitle')}</h2>
            <p>{t('prereq.tableDescription')}</p>
          </div>
        </div>
        <div
          id="prerequisite-filters"
          className={`eh-setup__filter-panel${filtersOpen ? ' is-open' : ''}`}
          aria-hidden={!filtersOpen}
        >
          {filtersOpen && (
            <form
              className="eh-setup__filter-form"
              onSubmit={applyFilters}
              aria-label={t('prereq.filterLabel')}
            >
              <label className="eh-setup__filter-field eh-setup__filter-search">
                <span>{t('setup.listing.search')}</span>
                <span className="eh-setup__search-input">
                  <Search aria-hidden />
                  <Input
                    value={draft.query}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, query: event.target.value }))
                    }
                    placeholder={t('prereq.searchPlaceholder')}
                  />
                </span>
              </label>
              <label className="eh-setup__filter-field">
                <span>{t('prereq.businessUnit')}</span>
                <Select
                  value={draft.businessUnit ?? 'all'}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      businessUnit:
                        event.target.value === 'all' ? null : (event.target.value as BusinessUnit),
                    }))
                  }
                >
                  <option value="all">{t('prereq.allBusinessUnits')}</option>
                  {BUSINESS_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="eh-setup__filter-field">
                <span>{t('prereq.status')}</span>
                <Select
                  value={draft.status}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      status: event.target.value as PrerequisiteStatus,
                    }))
                  }
                >
                  <option value="all">{t('prereq.allStatuses')}</option>
                  <option value="blocked">{t('prereq.blocked')}</option>
                  <option value="ready">{t('prereq.ready')}</option>
                </Select>
              </label>
              <div className="eh-setup__filter-actions">
                <Button type="submit">
                  <Check aria-hidden />
                  {t('setup.listing.applyFilters')}
                </Button>
                <Button type="button" variant="secondary" onClick={resetFilters}>
                  <RotateCcw aria-hidden />
                  {t('setup.listing.resetFilters')}
                </Button>
              </div>
            </form>
          )}
        </div>
        {query.isPending ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="p-8 text-center">
            <p className="text-sm text-block">{query.error.message}</p>
            <Button variant="secondary" className="mt-3" onClick={() => void query.refetch()}>
              {t('app.retry')}
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          query.data.items.length === 0 ? (
            <EmptyState icon={PartyPopper} title={t('prereq.empty')} body={t('prereq.emptyBody')} />
          ) : (
            <EmptyState
              icon={Search}
              title={t('prereq.noMatches')}
              body={t('prereq.noMatchesBody')}
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="eh-setup__data-table w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/50 text-start text-xs font-medium uppercase tracking-wide text-muted">
                  <th scope="col" className="px-5 py-3 text-start">
                    {t('prereq.person')}
                  </th>
                  {PREREQUISITE_CODES.map((code) => (
                    <th key={code} scope="col" className="px-3 py-3 text-center">
                      {t(`prereq.${code}`)}
                    </th>
                  ))}
                  <th scope="col" className="px-5 py-3 text-center">
                    {t('prereq.status')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, rowIndex) => (
                  <tr
                    key={row.personId}
                    className="eh-setup__data-row"
                    style={{ '--eh-setup-row-index': rowIndex } as CSSProperties}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={row.fullName} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{row.fullName}</p>
                          <p className="truncate text-xs text-muted">
                            {row.personNumber} · {row.jobName} · {row.businessUnit}
                          </p>
                        </div>
                      </div>
                    </td>
                    {row.checks.map((check) => (
                      <td key={check.code} className="px-3 py-3 text-center">
                        {check.ok ? (
                          <CircleCheck
                            aria-label={check.message}
                            className="inline size-4 text-pass-text"
                          />
                        ) : (
                          <span title={check.message} className="inline-flex">
                            <CircleX aria-label={check.message} className="size-4 text-block" />
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-5 py-3 text-center">
                      {row.ok ? (
                        <Tag tone="pass">{t('prereq.ready')}</Tag>
                      ) : (
                        <Tag tone="block">{t('prereq.blocked')}</Tag>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > 0 && (
          <ReportPager
            page={page}
            pages={pageCount}
            total={filtered.length}
            pageSize={PAGE_SIZE}
            onPage={setPage}
            label={t('prereq.pages')}
          />
        )}
      </Card>
    </>
  );
}
