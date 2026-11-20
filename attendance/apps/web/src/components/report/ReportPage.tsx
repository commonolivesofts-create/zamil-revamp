// The generic report page: header with actions, collapsible filters, search, table, pager and
// CSV export. Each module only supplies a ReportConfig (see features/*).
import { useId, useState } from 'react';
import { errorMessage } from '../../lib/api';
import { ContentSkeleton } from '../Feedback';
import { OrvexaIcon } from '../OrvexaIcon';
import { DataTable } from './DataTable';
import { FilterPanel } from './FilterPanel';
import { ReportPager } from './ReportPager';
import type { FilterValues, ReportConfig } from './types';
import { compactFilters, useReport } from './useReport';

export function ReportPage<F extends FilterValues, T>({ config }: { config: ReportConfig<F, T> }) {
  const id = useId().replace(/:/g, '');
  const report = useReport(config);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { query } = report;
  const activeFilters = Object.keys(compactFilters(report.filters)).length;
  const heading = config.heading.toLowerCase();

  return (
    <div
      className={`zrv-hr zrv-hr--${config.id} zrv-hr--compact zrv-ir zrv-ir--fitted zrv-ir--responsive zat-report`}
    >
      <header className="zrv-ir-head">
        <div className="zrv-ir-head__title">
          <nav aria-label="Breadcrumb">
            <ol className="zrv-ir-crumb">
              {config.breadcrumb.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </nav>
          <h1 className="zrv-hr-title">{config.title}</h1>
          {config.subtitle && <p className="zrv-hr-sub">{config.subtitle}</p>}
        </div>
        <div className="zrv-ir-head__actions">
          <button
            type="button"
            className={`zrv-ir-btn${filtersOpen ? ' zrv-ir-is-on' : ''}`}
            aria-expanded={filtersOpen}
            aria-controls={`${id}-filters`}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <OrvexaIcon name="sliders-horizontal" size={16} />
            Filter
            {activeFilters > 0 && <span className="zrv-ir-btn__badge">{activeFilters}</span>}
          </button>
          <button
            type="button"
            className="zrv-ir-btn"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <OrvexaIcon name="refresh-cw" size={16} />
            Refresh
          </button>
          <button
            type="button"
            className="zrv-ir-btn zrv-ir-btn--primary"
            onClick={() => void report.exportCsv()}
            disabled={report.exporting || !query.data?.pagination.total}
          >
            <OrvexaIcon name="download" size={16} />
            {report.exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </header>

      <FilterPanel
        id={id}
        open={filtersOpen}
        fields={config.filters}
        applied={report.filters}
        initial={config.initialFilters}
        onApply={report.applyFilters}
      />

      <div className="zrv-ir-main">
        <section className="zrv-ir-card zrv-ir-stream" aria-labelledby={`${id}-heading`}>
          <header className="zrv-ir-card__head">
            <h2 id={`${id}-heading`}>{config.heading}</h2>
            <div className="zrv-ir-tabletools">
              <label className="zrv-ir-search" htmlFor={`${id}-search`}>
                <OrvexaIcon name="search" size={16} />
                <span className="sr-only">Search {heading}</span>
                <input
                  id={`${id}-search`}
                  type="search"
                  maxLength={100}
                  placeholder={config.searchPlaceholder}
                  value={report.searchInput}
                  onChange={(event) => report.setSearchInput(event.target.value)}
                />
              </label>
            </div>
          </header>

          {query.isPending ? (
            <ContentSkeleton label={`Loading ${heading}`} />
          ) : query.isError ? (
            <div className="zrv-admin-state zrv-admin-state--error" role="alert">
              <p>
                The {heading} could not be loaded. {errorMessage(query.error)}
              </p>
              <button type="button" className="btn-secondary" onClick={() => void query.refetch()}>
                Retry
              </button>
            </div>
          ) : query.data.items.length === 0 ? (
            <p className="zrv-admin-state" role="status">
              {config.emptyMessage}
            </p>
          ) : (
            <>
              <DataTable
                caption={config.heading}
                columns={config.columns}
                rows={query.data.items}
                rowKey={config.rowKey}
                firstRowNumber={(query.data.pagination.page - 1) * query.data.pagination.limit + 1}
                busy={query.isFetching}
              />
              <ReportPager
                id={id}
                page={query.data.pagination.page}
                pages={query.data.pagination.totalPages}
                total={query.data.pagination.total}
                limit={report.limit}
                onPage={report.setPage}
                onLimit={report.changeLimit}
                disabled={query.isFetching}
                label={`${config.heading} pages`}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
