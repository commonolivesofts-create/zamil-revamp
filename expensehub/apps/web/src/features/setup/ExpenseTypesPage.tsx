// FR-POL-01 expense types (OQ-32: placeholders until Finance confirms).
import type { ExpenseTypeDto } from '@expensehub/shared';
import {
  ArrowDownToLine,
  Check,
  FileText,
  Info,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useOutletContext } from 'react-router';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { ReportPager } from '../../components/ui/ReportPager';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tag } from '../../components/ui/Tag';
import { cn } from '../../lib/cn';
import { downloadCsv, printPdf } from '../../lib/report-export';
import { formatSar } from '../../lib/format';
import { ExpenseTypeDrawer } from './ExpenseTypeDrawer';
import { useExpenseTypes } from './hooks';
import type { SetupOutletContext } from './SetupLayout';

const PAGE_SIZE = 10;
type ExpenseTypeFilters = { query: string; category: string; status: string };
const EMPTY_FILTERS: ExpenseTypeFilters = { query: '', category: 'all', status: 'all' };

export function ExpenseTypesPage() {
  const { t } = useTranslation();
  const { setHeaderActions } = useOutletContext<SetupOutletContext>();
  const types = useExpenseTypes();
  const [editing, setEditing] = useState<ExpenseTypeDto | null>(null);
  const [open, setOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<ExpenseTypeFilters>(EMPTY_FILTERS);
  const [draft, setDraft] = useState<ExpenseTypeFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const openDrawer = useCallback((type: ExpenseTypeDto | null) => {
    setEditing(type);
    setOpen(true);
  }, []);

  const receipt = useCallback(
    (type: ExpenseTypeDto) =>
      type.receiptOverSar === null
        ? t('expenseTypes.receiptNever')
        : Number(type.receiptOverSar) === 0
          ? t('expenseTypes.receiptAlways')
          : t('expenseTypes.receiptAboveLabel', { amount: formatSar(type.receiptOverSar) }),
    [t],
  );

  const anyPlaceholder = types.data?.items.some((type) => type.isPlaceholder);
  const filtered = useMemo(
    () =>
      (types.data?.items ?? []).filter((type) => {
        const query = filters.query.trim().toLowerCase();
        const matchesQuery =
          !query ||
          `${type.name} ${type.typeCode} ${type.naturalAccount} ${t(`expenseTypes.categories.${type.category}`)}`
            .toLowerCase()
            .includes(query);
        const matchesCategory = filters.category === 'all' || type.category === filters.category;
        const matchesStatus =
          filters.status === 'all' ||
          (filters.status === 'active'
            ? type.active
            : filters.status === 'inactive'
              ? !type.active
              : type.isPlaceholder);
        return matchesQuery && matchesCategory && matchesStatus;
      }),
    [types.data, filters, t],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeFilters = Object.values(filters).filter((value) => value && value !== 'all').length;

  const exportColumns = useMemo(
    () => [
      {
        label: t('expenseTypes.type'),
        value: (type: ExpenseTypeDto) => `${type.name} (${type.typeCode})`,
      },
      {
        label: t('expenseTypes.category'),
        value: (type: ExpenseTypeDto) => t(`expenseTypes.categories.${type.category}`),
      },
      { label: t('expenseTypes.account'), value: (type: ExpenseTypeDto) => type.naturalAccount },
      {
        label: t('expenseTypes.limit'),
        value: (type: ExpenseTypeDto) =>
          type.defaultLimitSar
            ? `${formatSar(type.defaultLimitSar)} · ${t(`expenseTypes.actions.${type.limitAction}`)}`
            : t('expenseTypes.noLimit'),
      },
      { label: t('expenseTypes.receipt'), value: receipt },
      {
        label: t('expenseTypes.rules'),
        value: (type: ExpenseTypeDto) => {
          const rules = [
            type.justificationReq && t('expenseTypes.flags.justification'),
            type.attendeesReq && t('expenseTypes.flags.attendees'),
            type.vatEligible && t('expenseTypes.flags.vat'),
          ].filter(Boolean);
          return rules.join(', ') || t('setup.listing.none');
        },
      },
      {
        label: t('expenseTypes.status'),
        value: (type: ExpenseTypeDto) =>
          [
            type.isPlaceholder && t('setup.placeholder'),
            type.active ? t('setup.active') : t('setup.inactive'),
          ]
            .filter(Boolean)
            .join(', '),
      },
    ],
    [receipt, t],
  );

  const updateDraft = (key: keyof ExpenseTypeFilters, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const applyFilters = (event: FormEvent) => {
    event.preventDefault();
    setFilters(draft);
    setPage(1);
    setFiltersOpen(false);
  };
  const resetFilters = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };
  const exportCsv = useCallback(
    () => downloadCsv(filtered, exportColumns, 'expense_types'),
    [exportColumns, filtered],
  );
  const exportPdf = useCallback(() => {
    const opened = printPdf(
      filtered,
      exportColumns,
      t('setup.listing.exportTitle'),
      t('setup.listing.exportMeta', {
        count: filtered.length,
        date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date()),
      }),
    );
    if (!opened) toast.error(t('setup.listing.popupBlocked'));
  }, [exportColumns, filtered, t]);

  const headerActions = useMemo(
    () => (
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
          aria-controls="expense-type-filters"
          onClick={() => {
            setDraft(filters);
            setFiltersOpen((isOpen) => !isOpen);
          }}
        >
          <SlidersHorizontal aria-hidden />
          {t('setup.listing.filter')}
          {activeFilters > 0 && <span className="eh-setup__filter-count">{activeFilters}</span>}
        </Button>
        <Button className="eh-setup__header-action" size="sm" onClick={() => openDrawer(null)}>
          <Plus aria-hidden />
          {t('expenseTypes.new')}
        </Button>
      </>
    ),
    [activeFilters, exportCsv, exportPdf, filtered.length, filters, filtersOpen, openDrawer, t],
  );

  useEffect(() => {
    setHeaderActions(headerActions);
    return () => setHeaderActions(null);
  }, [headerActions, setHeaderActions]);

  return (
    <>
      <div className="eh-setup__toolbar">
        <div className="eh-setup__toolbar-note">
          {anyPlaceholder && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Info aria-hidden className="size-4 shrink-0 text-info" />
              {t('setup.placeholderHint')}
            </p>
          )}
        </div>
      </div>

      <Card className="eh-setup__list-card overflow-hidden">
        <div className="eh-setup__table-head">
          <div>
            <h2>{t('expenseTypes.tableTitle')}</h2>
            <p>{t('expenseTypes.tableDescription')}</p>
          </div>
        </div>
        <div
          id="expense-type-filters"
          className={`eh-setup__filter-panel${filtersOpen ? ' is-open' : ''}`}
          aria-hidden={!filtersOpen}
        >
          {filtersOpen && (
            <form
              className="eh-setup__filter-form"
              onSubmit={applyFilters}
              aria-label={t('setup.listing.filterLabel')}
            >
              <label className="eh-setup__filter-field eh-setup__filter-search">
                <span>{t('setup.listing.search')}</span>
                <span className="eh-setup__search-input">
                  <Search aria-hidden />
                  <Input
                    value={draft.query}
                    onChange={(event) => updateDraft('query', event.target.value)}
                    placeholder={t('setup.listing.searchExpenseTypes')}
                  />
                </span>
              </label>
              <label className="eh-setup__filter-field">
                <span>{t('setup.listing.category')}</span>
                <Select
                  value={draft.category}
                  onChange={(event) => updateDraft('category', event.target.value)}
                >
                  <option value="all">{t('setup.listing.allCategories')}</option>
                  <option value="STANDARD">{t('expenseTypes.categories.STANDARD')}</option>
                  <option value="MILEAGE">{t('expenseTypes.categories.MILEAGE')}</option>
                </Select>
              </label>
              <label className="eh-setup__filter-field">
                <span>{t('setup.listing.status')}</span>
                <Select
                  value={draft.status}
                  onChange={(event) => updateDraft('status', event.target.value)}
                >
                  <option value="all">{t('setup.listing.allStatuses')}</option>
                  <option value="active">{t('setup.active')}</option>
                  <option value="inactive">{t('setup.inactive')}</option>
                  <option value="placeholder">{t('setup.placeholder')}</option>
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

        <div className="overflow-x-auto">
          <table className="eh-setup__data-table w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium uppercase tracking-wide text-muted">
                <th scope="col" className="px-5 py-3 text-start">
                  {t('expenseTypes.type')}
                </th>
                <th scope="col" className="px-3 py-3 text-start">
                  {t('expenseTypes.category')}
                </th>
                <th scope="col" className="px-3 py-3 text-start">
                  {t('expenseTypes.account')}
                </th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 text-end">
                  {t('expenseTypes.limit')}
                </th>
                <th scope="col" className="px-3 py-3 text-start">
                  {t('expenseTypes.receipt')}
                </th>
                <th scope="col" className="px-3 py-3 text-start">
                  {t('expenseTypes.rules')}
                </th>
                <th scope="col" className="px-5 py-3 text-center">
                  {t('expenseTypes.status')}
                </th>
              </tr>
            </thead>
            <tbody>
              {types.isPending &&
                Array.from({ length: 5 }, (_, index) => (
                  <tr key={index}>
                    <td colSpan={7} className="px-5 py-3">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                ))}
              {!types.isPending &&
                visible.map((type, rowIndex) => {
                  return (
                    <tr
                      key={type.typeId}
                      className={cn('eh-setup__data-row', !type.active && 'is-inactive')}
                      style={{ '--eh-setup-row-index': rowIndex } as CSSProperties}
                    >
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          className="eh-setup__type-cell group flex items-center rounded-input text-start"
                          onClick={() => openDrawer(type)}
                          aria-label={`${t('setup.edit')} ${type.name}`}
                        >
                          <span className="eh-setup__type-mark" aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="eh-setup__type-name block group-hover:underline">
                              {type.name}
                            </span>
                            <span className="eh-setup__type-code block">{type.typeCode}</span>
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        {t(`expenseTypes.categories.${type.category}`)}
                        {type.unitRateSar && (
                          <span className="block text-xs text-muted tabular">
                            SAR {Number(type.unitRateSar).toFixed(2)}/km
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono text-xs">{type.naturalAccount}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-end tabular">
                        {type.defaultLimitSar ? (
                          <>
                            {formatSar(type.defaultLimitSar)}
                            <span
                              className={cn(
                                'block text-xs',
                                type.limitAction === 'BLOCK' ? 'text-block' : 'text-warn',
                              )}
                            >
                              {t(`expenseTypes.actions.${type.limitAction}`)}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted">{t('expenseTypes.noLimit')}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">{receipt(type)}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {type.justificationReq && (
                            <Tag>{t('expenseTypes.flags.justification')}</Tag>
                          )}
                          {type.attendeesReq && <Tag>{t('expenseTypes.flags.attendees')}</Tag>}
                          {type.vatEligible && <Tag tone="info">{t('expenseTypes.flags.vat')}</Tag>}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <div className="flex flex-wrap justify-center gap-1">
                          {type.isPlaceholder && <Tag tone="warn">{t('setup.placeholder')}</Tag>}
                          {type.active ? (
                            <Tag tone="pass">{t('setup.active')}</Tag>
                          ) : (
                            <Tag>{t('setup.inactive')}</Tag>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              {!types.isPending && visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-sm text-muted">
                    {types.data?.items.length
                      ? t('setup.listing.noMatches')
                      : t('setup.listing.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <ReportPager
            page={page}
            pages={pageCount}
            total={filtered.length}
            pageSize={PAGE_SIZE}
            onPage={setPage}
            label={t('setup.listing.expenseTypePages')}
          />
        )}
      </Card>

      <ExpenseTypeDrawer open={open} onOpenChange={setOpen} type={editing} />
    </>
  );
}
