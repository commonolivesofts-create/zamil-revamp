import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import {
  Badge,
  Dialog,
  ResourceState,
} from '@/features/security-administration/components/AdminUi.jsx'
import { cellText, downloadCsv, loadAllRows, printPdf } from '../reportExport.js'
import { ReportPager } from './ReportPager.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { COMMON_TEXT, INSIGHT_TEXT as T } from '../../hrRecruitmentText.js'
import { businessToday } from '../hrFormat.js'
import { Card } from './InsightCards.jsx'
import { clampRange } from '../insightDates.js'
import '@/styles/hr-recruitment.css'
import '@/styles/hr-insight-report.css'
import '@/styles/report-table.css'
import '@/styles/hr-recruitment-responsive.css'

const PAGE_SIZE = 15
// Slightly longer than the CSS close animation so the panel finishes gliding
// out before it unmounts; otherwise the exit snaps off mid-flight.
const DRAWER_EXIT_MS = 420
const DRAWER_MIN_WIDTH = 420
const DRAWER_STEP = 24
// A widened drawer always leaves a sliver of the page in view.
const clampDrawerWidth = (value) =>
  Math.round(
    Math.min(Math.max(value, DRAWER_MIN_WIDTH), Math.max(DRAWER_MIN_WIDTH, window.innerWidth - 24)),
  )
const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const clock = (date) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
const omit = (query, keys) =>
  Object.fromEntries(Object.entries(query).filter(([key]) => !keys.includes(key)))
const only = (query, keys) =>
  Object.fromEntries(Object.entries(query).filter(([key]) => keys.includes(key)))

// Counts of list queries (page size 1, the total only); one load asks the
// server once per distinct query. `countIn` limits a date window to the
// report's own date filter.
function createRequestGate(maxConcurrent) {
  let active = 0
  const queue = []
  const abortError = () =>
    Object.assign(new Error('The request was cancelled.'), {
      name: 'AbortError',
    })
  const drain = () => {
    while (active < maxConcurrent && queue.length) {
      const entry = queue.shift()
      entry.signal?.removeEventListener('abort', entry.onAbort)
      if (entry.signal?.aborted) {
        entry.reject(abortError())
        continue
      }
      active += 1
      Promise.resolve()
        .then(entry.run)
        .then(entry.resolve, entry.reject)
        .finally(() => {
          active -= 1
          drain()
        })
    }
  }
  return (run, signal) =>
    new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError())
        return
      }
      const entry = { run, signal, resolve, reject }
      entry.onAbort = () => {
        const index = queue.indexOf(entry)
        if (index !== -1) {
          queue.splice(index, 1)
          reject(abortError())
        }
      }
      signal?.addEventListener('abort', entry.onAbort, { once: true })
      queue.push(entry)
      drain()
    })
}

function counter(list, signal, requestGate) {
  const memo = new Map()
  const count = (query) => {
    const clean = Object.entries(query)
      .filter(([, value]) => value !== '' && value !== null && value !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
    const key = JSON.stringify(clean)
    if (!memo.has(key))
      memo.set(
        key,
        requestGate(
          () =>
            list({ ...Object.fromEntries(clean), page: 1, limit: 1 }, { signal }).then(
              (result) => result.pagination.total,
            ),
          signal,
        ),
      )
    return memo.get(key)
  }
  const countIn = (query, range) => {
    const window = clampRange(range, query)
    return window
      ? count({ ...query, dateFrom: window.from, dateTo: window.to })
      : Promise.resolve(0)
  }
  return { count, countIn }
}

// The recruitment report layout: header and actions, a collapsible filter
// form, a row of compact overview cards (the last one the breakdown), the
// full-width server-paged table, and a summary drawer per row. Everything
// shown is counted or listed by the server.
//   initial: every query key with its starting value (quick filters and form fields);
//   required: keys that always keep a value (picking the active one again keeps it);
//   fields: the form filters [{ key, label, type: search | select | date, options?, placeholder? }];
//   columns: [{ key, label, sort?, render(row), sub?(row) }], the first one opens the summary;
//   cards: [{ key, load({ query, today, count, countIn, omit }), render(data, ctx) }],
//     ctx: { query, today, pick(patch) → { active, onPick } };
//   groups: [{ key, title, tone, items: [{ key, label, patch }] }], or a function of today returning them;
//   summary(row, today) → { heading, pill, facts: [[label, value]], timing?: { tone, text } },
//     or omit it when the drawer shows only the row's detail component;
//   breadcrumb, demo (the demo-data badge), tools (extra header buttons),
//   onRefresh (runs before Refresh reloads), validate(draft) → { key: message }
//   (checked on Apply) and pathOf (without it the summary has no Open link) are optional;
//   CSV and PDF export every filtered row with the table's columns (a column's
//   text(row) overrides its rendered text, export: false leaves it out, subLabel
//   exports its sub line as a column of its own); exportable={false} hides them.
export function InsightReport({
  variant,
  title,
  subtitle,
  heading,
  resourceKey,
  list,
  create,
  openLabel,
  empty,
  initial,
  required = [],
  fields,
  columns,
  defaultSort,
  numberOf,
  rowKey,
  pathOf,
  cards,
  groups: groupsOf = [],
  summary,
  renderDetail,
  highlight = null,
  highlightLabel = 'Suggestions',
  // A first-class action that opens another page (for example the standalone
  // Hiring suggestions page) instead of expanding a panel inside the report.
  // headerLink: { to, label, icon?, title? }
  headerLink = null,
  // Optional row selection for reports with a bulk row action (for example
  // deleting several records at once): a leading checkbox column, a select-all
  // box in the header, and the page's own tools beside the table heading.
  // rowSelection: { selectedKeys, onToggle(row), onToggleAll?(rows, checked),
  //   label?(row), disabled?(row) → reason }
  rowSelection = null,
  tableTools = null,
  // Extra action(s) rendered in the drawer's sticky bottom bar, e.g. a primary
  // "Create interview assessment" shortcut. Receives the selected row.
  drawerActions = null,
  // Secondary action(s) rendered after the Open/Copy buttons, e.g. "Hiring
  // suggestions", so the primary action always leads the bar.
  drawerActionsAfter = null,
  // Marks a shorter table for the same labelled record-card layout on laptop
  // widths that wide tables already use, so it cannot overflow a small screen.
  denseTable = false,
  // Bump to reload the report after a bulk action performed by the page.
  reloadToken = 0,
  closeInDetail = false,
  resizableDrawer = false,
  breadcrumb = COMMON_TEXT.breadcrumb,
  demo = false,
  tools = null,
  printLabel = T.print,
  onRefresh,
  validate,
  exportable = true,
}) {
  const id = useId()
  const navigate = useNavigate()
  const permissions = usePermissions()
  const canCreate = create && (!create.permission || permissions.can(create.permission))
  const fieldKeys = fields.map((field) => field.key)
  const [highlightOpen, setHighlightOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [errors, setErrors] = useState({})
  const [draft, setDraft] = useState(() => only(initial, fieldKeys))
  const [query, setQuery] = useState(initial)
  const [sort, setSort] = useState(defaultSort)
  const [page, setPage] = useState(1)
  const reportRef = useRef(null)
  const countRequestGate = useRef(null)
  if (countRequestGate.current == null) countRequestGate.current = createRequestGate(3)
  const [selected, setSelected] = useState(null)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef(0)
  const [exporting, setExporting] = useState(null)
  const [exportError, setExportError] = useState(null)
  const today = businessToday()
  const groups = typeof groupsOf === 'function' ? groupsOf(today) : groupsOf
  const activeFilters = Object.entries(query).filter(
    ([key, value]) => value && !required.includes(key),
  ).length

  const records = useResource(
    `${resourceKey}:${reloadToken}:${JSON.stringify({ query, sort, page })}`,
    async (signal) => ({
      ...(await list(
        {
          ...query,
          page,
          limit: PAGE_SIZE,
          sortBy: sort.key,
          sortDir: sort.order,
        },
        { signal },
      )),
      loadedAt: new Date(),
    }),
  )
  const overview = useResource(
    `${resourceKey}:overview:${reloadToken}:${JSON.stringify(query)}:${today}`,
    (signal) => {
      const { count, countIn } = counter(list, signal, countRequestGate.current)
      return Promise.all(
        cards.map((card) =>
          card.load({
            query,
            today,
            count,
            countIn,
            omit: (keys) => omit(query, keys),
          }),
        ),
      )
    },
  )
  const breakdown = useResource(
    groups.length ? `${resourceKey}:breakdown:${reloadToken}:${JSON.stringify(query)}` : null,
    async (signal) => {
      const { count } = counter(list, signal, countRequestGate.current)
      return Promise.all(
        groups.map((group) =>
          Promise.all(
            group.items.map((item) =>
              count({ ...omit(query, Object.keys(item.patch)), ...item.patch }),
            ),
          ),
        ),
      )
    },
  )

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  const isActive = (patch) => Object.entries(patch).every(([key, value]) => query[key] === value)
  // Picks a quick filter; picking the active one again clears it (required keys stay).
  const select = (patch) => {
    const keys = Object.keys(patch)
    const active = isActive(patch)
    if (active && keys.every((key) => required.includes(key))) return
    const next = active
      ? Object.fromEntries(keys.map((key) => [key, required.includes(key) ? query[key] : '']))
      : patch
    setQuery((current) => ({ ...current, ...next }))
    setDraft((current) => ({ ...current, ...only(next, fieldKeys) }))
    setPage(1)
  }
  const pick = (patch) => ({
    active: isActive(patch),
    onPick: () => select(patch),
  })
  const ctx = { query, today, pick }
  const refresh = () => {
    onRefresh?.()
    for (const resource of [records, overview, breakdown]) resource.reload()
  }
  const setDraftValue = (key) => (event) => {
    setDraft((current) => ({ ...current, [key]: event.target.value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }
  const apply = (event) => {
    event.preventDefault()
    const found = Object.fromEntries(
      Object.entries(validate?.(draft) ?? {}).filter(([, message]) => message),
    )
    setErrors(found)
    if (Object.keys(found).length) {
      document.getElementById(`${id}-${Object.keys(found)[0]}`)?.focus()
      return
    }
    setQuery((current) => ({ ...current, ...draft }))
    setPage(1)
  }
  const reset = () => {
    setErrors({})
    setDraft(only(initial, fieldKeys))
    setQuery({ ...initial, ...only(query, required) })
    setPage(1)
  }
  const exportColumns = columns
    .filter((column) => column.export !== false)
    .flatMap((column) => [
      { label: column.label, value: (row) => column.text?.(row) ?? cellText(column.render(row)) },
      ...(column.sub && column.subLabel
        ? [{ label: column.subLabel, value: (row) => cellText(column.sub(row)) }]
        : []),
    ])
  // Exports every row of the current filter and sort (paged from the server).
  const runExport = async (kind) => {
    setExporting(kind)
    setExportError(null)
    try {
      const rows = await loadAllRows(list, {
        ...query,
        sortBy: sort.key,
        sortDir: sort.order,
      })
      if (kind === 'csv') downloadCsv(rows, exportColumns, resourceKey)
      else printPdf(rows, exportColumns, title)
    } catch (error) {
      setExportError(error?.message || T.exportFailed)
    } finally {
      setExporting(null)
    }
  }
  const sortBy = (key) => {
    setSort((current) => ({
      key,
      order: current.key === key && current.order === 'asc' ? 'desc' : 'asc',
    }))
    setPage(1)
  }
  const changeSortColumn = (event) => {
    const key = event.target.value
    setSort((current) => ({
      key,
      order: current.key === key ? current.order : 'asc',
    }))
    setPage(1)
  }
  const ariaSort = (key) =>
    sort.key === key ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'
  const open = (row) => {
    window.clearTimeout(closeTimer.current)
    setClosing(false)
    setSelected(row)
  }
  // The drawer plays its exit animation before it unmounts.
  const close = () => {
    if (closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(
      () => {
        setSelected(null)
        setClosing(false)
      },
      reducedMotion() ? 0 : DRAWER_EXIT_MS,
    )
  }
  const [first, ...rest] = columns
  const sortableColumns = columns.filter(
    (column, index) =>
      column.sort && columns.findIndex((candidate) => candidate.sort === column.sort) === index,
  )
  const fixedColumnWidth = (column) => {
    if (column.key === 'ticket') return 130
    if (/^(status|outcome)$/.test(column.key)) return 100
    return 0
  }
  const columnWeight = (column) => {
    if (
      /^(actions|assessment|offer|position|candidate|employee|name|requester|scheduledBy)$/.test(
        column.key,
      )
    )
      return 1.8
    if (/^(department|division|section|pendingAt)$/.test(column.key)) return 1.3
    return 1
  }
  const totalWeight = columns.reduce(
    (sum, column) => sum + (fixedColumnWidth(column) ? 0 : columnWeight(column)),
    0,
  )
  const fixedWidth = columns.reduce((sum, column) => sum + fixedColumnWidth(column), 0)

  return (
    <div
      ref={reportRef}
      className={`zrv-hr zrv-hr--${variant} zrv-hr--compact zrv-ir zrv-ir--fitted zrv-ir--responsive`}
    >
      <header className="zrv-ir-head">
        <div className="zrv-ir-head__title">
          <nav aria-label="Breadcrumb">
            <ol className="zrv-ir-crumb">
              {breadcrumb.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </nav>
          <h1 className="zrv-hr-title">
            {title}
            {demo && (
              <span title={COMMON_TEXT.demoNote}>
                {' '}
                <Badge tone="warn">{COMMON_TEXT.demoBadge}</Badge>
              </span>
            )}
          </h1>
          {subtitle && <p className="zrv-hr-sub">{subtitle}</p>}
          {records.data?.loadedAt && (
            <span className="zrv-ir-stamp" role="status">
              <i aria-hidden="true" />
              {T.updated(clock(records.data.loadedAt))}
            </span>
          )}
        </div>
        <div className="zrv-ir-head__actions">
          {headerLink && (
            <Link className="zrv-ir-btn" to={headerLink.to} title={headerLink.title}>
              <OrvexaIcon name={headerLink.icon || 'arrow-up-right'} size={16} />
              {headerLink.label}
            </Link>
          )}
          {highlight && (
            <button
              type="button"
              className={`zrv-ir-btn zrv-ir-btn--suggestions${highlightOpen ? ' zrv-ir-is-on' : ''}`}
              aria-expanded={highlightOpen}
              aria-controls={`${id}-highlight`}
              onClick={() => setHighlightOpen((value) => !value)}
            >
              <OrvexaIcon name="badge-check" size={16} />
              {highlightLabel}
              <span className="zrv-ir-btn__chevron" aria-hidden="true">
                <OrvexaIcon name="chevron-down" size={14} />
              </span>
            </button>
          )}
          <button
            type="button"
            className={`zrv-ir-btn zrv-ir-btn--utility${filtersOpen ? ' zrv-ir-is-on' : ''}`}
            aria-expanded={filtersOpen}
            aria-controls={`${id}-filters`}
            aria-label={T.filter}
            title={T.filter}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <OrvexaIcon name="sliders-horizontal" size={16} />
            <span className="zrv-ir-btn__label">{T.filter}</span>
            {activeFilters > 0 && <span className="zrv-ir-btn__badge">{activeFilters}</span>}
          </button>
          <button
            type="button"
            className="zrv-ir-btn zrv-ir-btn--utility"
            aria-label={T.refresh}
            title={T.refresh}
            onClick={refresh}
            disabled={records.refreshing}
          >
            <OrvexaIcon name="refresh-cw" size={16} />
            <span className="zrv-ir-btn__label">{T.refresh}</span>
          </button>
          <button
            type="button"
            className="zrv-ir-btn zrv-ir-btn--utility"
            aria-label={printLabel}
            title={printLabel}
            onClick={() => window.print()}
          >
            <OrvexaIcon name="printer" size={16} />
            <span className="zrv-ir-btn__label">{printLabel}</span>
          </button>
          {exportable && (
            <>
              <button
                type="button"
                className="zrv-ir-btn zrv-ir-btn--utility"
                aria-label={T.exportCsv}
                title={T.exportCsv}
                onClick={() => runExport('csv')}
                disabled={Boolean(exporting) || !records.data?.pagination?.total}
              >
                <OrvexaIcon name="download" size={16} />
                <span className="zrv-ir-btn__label">
                  {exporting === 'csv' ? T.exporting : T.exportCsv}
                </span>
              </button>
              <button
                type="button"
                className="zrv-ir-btn zrv-ir-btn--utility"
                aria-label={T.exportPdf}
                title={T.exportPdf}
                onClick={() => runExport('pdf')}
                disabled={Boolean(exporting) || !records.data?.pagination?.total}
              >
                <OrvexaIcon name="file-text" size={16} />
                <span className="zrv-ir-btn__label">
                  {exporting === 'pdf' ? T.exporting : T.exportPdf}
                </span>
              </button>
            </>
          )}
          {tools}
          {canCreate && (
            <button
              type="button"
              className="zrv-ir-btn zrv-ir-btn--primary"
              onClick={() => navigate(create.path)}
            >
              <OrvexaIcon name="plus" size={16} />
              {create.label}
            </button>
          )}
        </div>
      </header>
      {exportError && (
        <p className="zrv-ir-error" role="alert">
          {exportError}{' '}
          <button type="button" onClick={() => setExportError(null)}>
            {T.close}
          </button>
        </p>
      )}

      {highlight && (
        <div id={`${id}-highlight`} className="zrv-ir-highlight" hidden={!highlightOpen}>
          {highlightOpen && highlight}
        </div>
      )}

      <div
        id={`${id}-filters`}
        className={`zrv-ir-collapse${filtersOpen ? ' zrv-ir-is-open' : ''}`}
        inert={!filtersOpen}
      >
        <div className="zrv-ir-collapse__inner">
          <form
            className="zrv-ir-filters"
            style={{ '--fields': fields.length }}
            onSubmit={apply}
            aria-label={T.filter}
          >
            {fields.map((field) => (
              <label
                key={field.key}
                className={`zrv-ir-field${field.type === 'search' ? ' zrv-ir-field--search' : ''}`}
                htmlFor={`${id}-${field.key}`}
              >
                <span>{field.label}</span>
                {field.type === 'select' ? (
                  <select
                    id={`${id}-${field.key}`}
                    value={draft[field.key]}
                    onChange={setDraftValue(field.key)}
                  >
                    <option value="">{T.all}</option>
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'date' ? (
                  <input
                    id={`${id}-${field.key}`}
                    type="date"
                    value={draft[field.key]}
                    onChange={setDraftValue(field.key)}
                    aria-invalid={Boolean(errors[field.key]) || undefined}
                    aria-describedby={errors[field.key] ? `${id}-${field.key}-error` : undefined}
                  />
                ) : (
                  <span className="zrv-ir-search">
                    <OrvexaIcon name="search" size={16} />
                    <input
                      id={`${id}-${field.key}`}
                      type="search"
                      maxLength={100}
                      placeholder={field.placeholder}
                      value={draft[field.key]}
                      onChange={setDraftValue(field.key)}
                    />
                  </span>
                )}
                {errors[field.key] && (
                  <small id={`${id}-${field.key}-error`} className="zrv-auth-field-error">
                    {errors[field.key]}
                  </small>
                )}
              </label>
            ))}
            <div className="zrv-ir-filters__actions">
              <button type="submit" className="zrv-ir-btn zrv-ir-btn--primary">
                <OrvexaIcon name="check" size={15} />
                {T.apply}
              </button>
              <button type="button" className="zrv-ir-btn" onClick={reset}>
                <OrvexaIcon name="rotate-ccw" size={15} />
                {T.reset}
              </button>
            </div>
          </form>
        </div>
      </div>

      <section
        className="zrv-ir-overview"
        aria-label={T.overview}
        aria-busy={overview.status !== 'ready' || undefined}
      >
        {overview.status === 'error' ? (
          <p className="zrv-ir-error zrv-ir-overview__error" role="alert">
            {T.unavailable}{' '}
            <button type="button" onClick={overview.reload}>
              {T.refresh}
            </button>
          </p>
        ) : (
          cards.map((card, index) => (
            <div key={card.key} className="zrv-ir-overview__slot">
              {card.render(overview.data?.[index], ctx)}
            </div>
          ))
        )}
        {groups.length > 0 && (
          <div className="zrv-ir-overview__slot">
            <Card index={cards.length} icon="list-filter" label={T.breakdown} theme="primary">
              {breakdown.status === 'error' ? (
                <p className="zrv-ir-error" role="alert">
                  {T.breakdownUnavailable}{' '}
                  <button type="button" onClick={breakdown.reload}>
                    {T.refresh}
                  </button>
                </p>
              ) : (
                <div className="zrv-ir-breaks">
                  {groups.map((group, index) => (
                    <Breakdown
                      key={group.key}
                      group={group}
                      counts={breakdown.data?.[index]}
                      isActive={isActive}
                      onPick={select}
                    />
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </section>

      <div className="zrv-ir-main">
        <section className="zrv-ir-card zrv-ir-stream" aria-labelledby={`${id}-heading`}>
          <header className="zrv-ir-card__head">
            <h2 id={`${id}-heading`}>{heading}</h2>
            {tableTools && <div className="zrv-ir-tabletools">{tableTools}</div>}
          </header>
          <ResourceState
            resource={records}
            label={heading.toLowerCase()}
            empty={empty}
            isEmpty={(data) => !data.items.length}
            loadingVariant="table"
            skeletonColumns={columns.length}
            skeletonRows={8}
            // The page header and stats are already rendered (with their own
            // loading states); only the table below them needs a skeleton.
            skeletonPageChrome={false}
          >
            {(data) => (
              <>
                {sortableColumns.length > 0 && (
                  <div className="zrv-ir-mobile-sort" role="group" aria-label={T.sortBy}>
                    <label htmlFor={`${id}-mobile-sort`}>
                      <span>{T.sortBy}</span>
                      <select id={`${id}-mobile-sort`} value={sort.key} onChange={changeSortColumn}>
                        {sortableColumns.map((column) => (
                          <option key={column.sort} value={column.sort}>
                            {column.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="zrv-ir-btn zrv-ir-mobile-sort__direction"
                      onClick={() => sortBy(sort.key)}
                      aria-label={T.changeSortDirection(
                        sort.order === 'asc' ? T.descending : T.ascending,
                      )}
                    >
                      <OrvexaIcon
                        name={sort.order === 'asc' ? 'arrow-up' : 'arrow-down'}
                        size={16}
                      />
                      {sort.order === 'asc' ? T.ascending : T.descending}
                    </button>
                  </div>
                )}
                <div
                  className="zrv-ir-tablewrap"
                  tabIndex={0}
                  role="region"
                  aria-label={heading}
                  aria-busy={records.refreshing || undefined}
                >
                  <table
                    className={`zrv-ir-table zrv-report-table${columns.length > 10 || denseTable ? ' zrv-ir-table--wide' : ''}${rowSelection ? ' zrv-ir-table--picks' : ''}`}
                  >
                    <caption className="zrv-hr-sr">{heading}</caption>
                    <colgroup>
                      {rowSelection && <col style={{ width: '44px' }} />}
                      {columns.map((column) => (
                        <col
                          key={column.key}
                          style={{
                            width: fixedColumnWidth(column)
                              ? `${fixedColumnWidth(column)}px`
                              : `calc((100% - ${fixedWidth + (rowSelection ? 44 : 0)}px) * ${columnWeight(column) / totalWeight})`,
                          }}
                        />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        {rowSelection && (
                          <th scope="col" className="zrv-ir-col-pick">
                            <SelectAll
                              rows={data.items}
                              selectedKeys={rowSelection.selectedKeys}
                              rowKey={rowKey}
                              blocked={rowSelection.disabled}
                              onToggleAll={rowSelection.onToggleAll}
                            />
                          </th>
                        )}
                        {columns.map((column) => (
                          <th
                            key={column.key}
                            scope="col"
                            aria-sort={column.sort ? ariaSort(column.sort) : undefined}
                          >
                            {column.sort ? (
                              <button type="button" onClick={() => sortBy(column.sort)}>
                                {column.label}
                                <OrvexaIcon
                                  name={
                                    sort.key !== column.sort
                                      ? 'chevrons-up-down'
                                      : sort.order === 'asc'
                                        ? 'chevron-up'
                                        : 'chevron-down'
                                  }
                                  size={13}
                                />
                              </button>
                            ) : (
                              column.label
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((row, index) => (
                        <tr
                          key={rowKey(row)}
                          style={{ '--i': index }}
                          className={
                            selected && rowKey(selected) === rowKey(row)
                              ? 'zrv-ir-is-on'
                              : undefined
                          }
                          onClick={() => open(row)}
                        >
                          {rowSelection &&
                            (() => {
                              const key = rowKey(row)
                              const picked = rowSelection.selectedKeys.includes(key)
                              const blocked = picked ? null : rowSelection.disabled?.(row)
                              return (
                                <td
                                  className="zrv-ir-col-pick"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <input
                                    type="checkbox"
                                    checked={picked}
                                    disabled={Boolean(blocked)}
                                    onChange={() => rowSelection.onToggle(row)}
                                    title={blocked || undefined}
                                    aria-label={`Select ${rowSelection.label?.(row) ?? key}`}
                                  />
                                </td>
                              )
                            })()}
                          <td className={`zrv-ir-col-${first.key}`}>
                            <button
                              type="button"
                              className="zrv-ir-num"
                              onClick={(event) => {
                                event.stopPropagation()
                                open(row)
                              }}
                            >
                              {first.render(row)}
                            </button>
                            {first.sub && <small>{first.sub(row)}</small>}
                          </td>
                          {rest.map((column) => (
                            <td
                              key={column.key}
                              className={`zrv-ir-col-${column.key}`}
                              data-label={column.label}
                            >
                              {column.render(row)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ReportPager
                  page={data.pagination.page}
                  pages={data.pagination.totalPages}
                  total={data.pagination.total}
                  disabled={records.refreshing}
                  label={T.pages(heading)}
                  onPage={setPage}
                />
              </>
            )}
          </ResourceState>
        </section>
      </div>

      {selected && (
        <Summary
          row={selected}
          detail={summary ? summary(selected, today) : null}
          number={numberOf(selected)}
          path={pathOf?.(selected)}
          extra={
            // The detail button calls onClose from its click handler, after render.
            // eslint-disable-next-line react-hooks/refs
            renderDetail?.(selected, {
              onClose: close,
              onChanged: (updated) => {
                setSelected((current) =>
                  current && rowKey(current) === rowKey(selected)
                    ? { ...current, ...updated }
                    : current,
                )
                refresh()
              },
            })
          }
          openLabel={openLabel}
          closeInDetail={closeInDetail}
          drawerActions={drawerActions ? drawerActions(selected) : null}
          drawerActionsAfter={drawerActionsAfter ? drawerActionsAfter(selected) : null}
          resizable={resizableDrawer}
          closing={closing}
          onClose={close}
        />
      )}
    </div>
  )
}

// Selects (or clears) every row on the current page. A partial selection is
// shown as indeterminate so the box never claims more than it has selected.
function SelectAll({ rows, selectedKeys, rowKey, blocked, onToggleAll }) {
  const ref = useRef(null)
  const selected = rows.filter((row) => selectedKeys.includes(rowKey(row))).length
  const all = rows.length > 0 && selected === rows.length
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = selected > 0 && !all
  }, [selected, all])
  const noneAllowed = rows.length === 0 || rows.every((row) => blocked?.(row))
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={all}
      disabled={noneAllowed || !onToggleAll}
      onChange={(event) => onToggleAll?.(rows, event.target.checked)}
      aria-label="Select all rows on this page"
      title="Select all rows on this page"
    />
  )
}

function Breakdown({ group, counts, isActive, onPick }) {
  const max = Math.max(1, ...(counts ?? []))
  return (
    <div className={`zrv-ir-break zrv-ir-tone--${group.tone}`}>
      <h3>{group.title}</h3>
      <ul>
        {group.items.map((item, index) => (
          <li key={item.key}>
            <button
              type="button"
              aria-pressed={isActive(item.patch)}
              onClick={() => onPick(item.patch)}
            >
              <span>{item.label}</span>
              <span className="zrv-ir-break__track" aria-hidden="true">
                <i
                  style={{
                    transform: `scaleX(${(counts?.[index] ?? 0) / max})`,
                  }}
                />
              </span>
              <b>{counts ? counts[index] : <i className="zrv-ir-skel" aria-hidden="true" />}</b>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Side summary of one listed record (the list's own fields; the full record
// opens on its form). Without `detail` it shows only the detail component,
// keeping the record number as the drawer's label for screen readers. It
// slides in and, while `closing`, slides out.
function Summary({
  row,
  detail,
  number,
  path,
  openLabel,
  closeInDetail,
  drawerActions,
  drawerActionsAfter,
  resizable,
  closing,
  onClose,
  extra,
}) {
  const [copiedOf, setCopiedOf] = useState(null)
  const [drawerWidth, setDrawerWidth] = useState(null)
  const drag = useRef(null)
  const startResize = (event) => {
    const dialog = event.currentTarget.closest('.zrv-dialog')
    if (!dialog) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = {
      x: event.clientX,
      width: dialog.getBoundingClientRect().width,
    }
  }
  const resize = (event) => {
    if (!drag.current) return
    setDrawerWidth(clampDrawerWidth(drag.current.width + drag.current.x - event.clientX))
  }
  const stopResize = (event) => {
    drag.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }
  // The grip also widens and narrows the drawer from the keyboard.
  const keyResize = (event) => {
    const step =
      event.key === 'ArrowLeft' ? DRAWER_STEP : event.key === 'ArrowRight' ? -DRAWER_STEP : 0
    if (!step) return
    event.preventDefault()
    const dialog = event.currentTarget.closest('.zrv-dialog')
    setDrawerWidth(
      clampDrawerWidth(
        (drawerWidth ?? dialog?.getBoundingClientRect().width ?? DRAWER_MIN_WIDTH) + step,
      ),
    )
  }
  const copied = copiedOf === row
  const canCopy = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.writeText)
  const copy = () =>
    navigator.clipboard.writeText(String(number)).then(
      () => setCopiedOf(row),
      () => setCopiedOf(null),
    )
  return (
    <div
      className={`zrv-hr-rp-drawer zrv-ir-drawer${detail ? '' : ' zrv-ir-drawer--plain'}${resizable ? ' zrv-ir-drawer--resizable' : ''}${closing ? ' zrv-ir-is-closing' : ''}`}
      style={drawerWidth ? { '--zrv-ir-drawer-width': `${drawerWidth}px` } : undefined}
    >
      <Dialog title={String(number)} onClose={onClose}>
        {(!detail || resizable) && (
          <button
            type="button"
            className="zrv-ir-drawer__grip"
            aria-label={T.resizeDrawer}
            title={T.resizeDrawer}
            onPointerDown={startResize}
            onPointerMove={resize}
            onPointerUp={stopResize}
            onPointerCancel={stopResize}
            onKeyDown={keyResize}
          />
        )}
        {!closeInDetail && (
          <button
            type="button"
            className="zrv-hr-rp-drawer__x"
            onClick={onClose}
            aria-label={T.close}
          >
            <OrvexaIcon name="x" size={18} />
          </button>
        )}
        <div key={String(number)} className="zrv-ir-drawer__body">
          {detail && (
            <>
              <div
                className={`zrv-ir-drawer__hero${detail.avatar ? ' zrv-ir-drawer__hero--profile' : ''}`}
              >
                {detail.avatar && (
                  <span className="zrv-ir-drawer__avatar" aria-hidden="true">
                    {detail.avatar}
                  </span>
                )}
                <span className="zrv-ir-drawer__identity">
                  {detail.eyebrow && <small>{detail.eyebrow}</small>}
                  <b>{detail.heading || COMMON_TEXT.dash}</b>
                  {detail.meta && <em>{detail.meta}</em>}
                </span>
                {detail.pill}
              </div>
              <dl className="zrv-ir-drawer__facts">
                {(detail.employeeFacts ?? detail.facts).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || COMMON_TEXT.dash}</dd>
                  </div>
                ))}
              </dl>
              {detail.timing && (
                <div className={`zrv-ir-drawer__due zrv-ir-is-${detail.timing.tone}`}>
                  <span>{T.timing}</span>
                  <b>{detail.timing.text}</b>
                </div>
              )}
            </>
          )}
          {extra}
          {(detail || drawerActions || drawerActionsAfter) && (
            <div className="zrv-ir-drawer__actions">
              {drawerActions}
              {path && (
                <Link className="zrv-ir-btn zrv-ir-btn--primary" to={path}>
                  <OrvexaIcon name="external-link" size={16} />
                  {openLabel}
                </Link>
              )}
              {canCopy && (
                <button type="button" className="zrv-ir-btn" onClick={copy}>
                  <OrvexaIcon name={copied ? 'check' : 'copy'} size={16} />
                  {copied ? T.copied : T.copy}
                </button>
              )}
              {drawerActionsAfter}
              <span className="zrv-hr-sr" role="status">
                {copied ? T.copied : ''}
              </span>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  )
}
