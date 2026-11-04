import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { Dialog, Pagination, ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { COMMON_TEXT, INSIGHT_TEXT as T } from '../../hrRecruitmentText.js'
import { businessToday } from '../hrFormat.js'
import { Card } from './InsightCards.jsx'
import { clampRange } from '../insightDates.js'
import '@/styles/hr-recruitment.css'
import '@/styles/hr-insight-report.css'

const PAGE_SIZE = 20
const DRAWER_EXIT_MS = 320
const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const clock = (date) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(date)
const omit = (query, keys) => Object.fromEntries(Object.entries(query).filter(([key]) => !keys.includes(key)))
const only = (query, keys) => Object.fromEntries(Object.entries(query).filter(([key]) => keys.includes(key)))

// Counts of list queries (page size 1, the total only); one load asks the
// server once per distinct query. `countIn` limits a date window to the
// report's own date filter.
function counter(list, signal) {
  const memo = new Map()
  const count = (query) => {
    const clean = Object.entries(query).filter(([, value]) => value !== '' && value !== null && value !== undefined).sort(([a], [b]) => a.localeCompare(b))
    const key = JSON.stringify(clean)
    if (!memo.has(key)) memo.set(key, list({ ...Object.fromEntries(clean), page: 1, limit: 1 }, { signal }).then((result) => result.pagination.total))
    return memo.get(key)
  }
  const countIn = (query, range) => {
    const window = clampRange(range, query)
    return window ? count({ ...query, dateFrom: window.from, dateTo: window.to }) : Promise.resolve(0)
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
//   summary(row, today) → { heading, pill, facts: [[label, value]], timing?: { tone, text } }.
export function InsightReport({
  variant, title, subtitle, heading, resourceKey, list, create, openLabel, empty,
  initial, required = [], fields, columns, defaultSort, numberOf, rowKey, pathOf, cards, groups: groupsOf = [], summary, renderDetail,
}) {
  const id = useId()
  const navigate = useNavigate()
  const permissions = usePermissions()
  const canCreate = create && (!create.permission || permissions.can(create.permission))
  const fieldKeys = fields.map((field) => field.key)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [draft, setDraft] = useState(() => only(initial, fieldKeys))
  const [query, setQuery] = useState(initial)
  const [sort, setSort] = useState(defaultSort)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef(0)
  const today = businessToday()
  const groups = typeof groupsOf === 'function' ? groupsOf(today) : groupsOf
  const activeFilters = Object.entries(query).filter(([key, value]) => value && !required.includes(key)).length

  const records = useResource(`${resourceKey}:${JSON.stringify({ query, sort, page })}`, async (signal) => ({
    ...(await list({ ...query, page, limit: PAGE_SIZE, sortBy: sort.key, sortDir: sort.order }, { signal })),
    loadedAt: new Date(),
  }))
  const overview = useResource(`${resourceKey}:overview:${JSON.stringify(query)}:${today}`, (signal) => {
    const { count, countIn } = counter(list, signal)
    return Promise.all(cards.map((card) => card.load({ query, today, count, countIn, omit: (keys) => omit(query, keys) })))
  })
  const breakdown = useResource(groups.length ? `${resourceKey}:breakdown:${JSON.stringify(query)}` : null, async (signal) => {
    const { count } = counter(list, signal)
    return Promise.all(groups.map((group) => Promise.all(group.items.map((item) => count({ ...omit(query, Object.keys(item.patch)), ...item.patch })))))
  })

  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  const isActive = (patch) => Object.entries(patch).every(([key, value]) => query[key] === value)
  // Picks a quick filter; picking the active one again clears it (required keys stay).
  const select = (patch) => {
    const keys = Object.keys(patch)
    const active = isActive(patch)
    if (active && keys.every((key) => required.includes(key))) return
    const next = active ? Object.fromEntries(keys.map((key) => [key, required.includes(key) ? query[key] : ''])) : patch
    setQuery((current) => ({ ...current, ...next }))
    setDraft((current) => ({ ...current, ...only(next, fieldKeys) }))
    setPage(1)
  }
  const pick = (patch) => ({ active: isActive(patch), onPick: () => select(patch) })
  const ctx = { query, today, pick }
  const refresh = () => [records, overview, breakdown].forEach((resource) => resource.reload())
  const setDraftValue = (key) => (event) => setDraft((current) => ({ ...current, [key]: event.target.value }))
  const apply = (event) => {
    event.preventDefault()
    setQuery((current) => ({ ...current, ...draft }))
    setPage(1)
  }
  const reset = () => {
    setDraft(only(initial, fieldKeys))
    setQuery({ ...initial, ...only(query, required) })
    setPage(1)
  }
  const sortBy = (key) => {
    setSort((current) => ({ key, order: current.key === key && current.order === 'asc' ? 'desc' : 'asc' }))
    setPage(1)
  }
  const ariaSort = (key) => (sort.key === key ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none')
  const open = (row) => {
    window.clearTimeout(closeTimer.current)
    setClosing(false)
    setSelected(row)
  }
  // The drawer plays its exit animation before it unmounts.
  const close = () => {
    if (closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(() => {
      setSelected(null)
      setClosing(false)
    }, reducedMotion() ? 0 : DRAWER_EXIT_MS)
  }
  const [first, ...rest] = columns

  return (
    <div className={`zrv-hr zrv-hr--${variant} zrv-hr--compact zrv-ir`}>
      <header className="zrv-ir-head">
        <div className="zrv-ir-head__title">
          <nav aria-label="Breadcrumb"><ol className="zrv-ir-crumb">{COMMON_TEXT.breadcrumb.map((item) => <li key={item}>{item}</li>)}</ol></nav>
          <h1 className="zrv-hr-title">{title}</h1>
          <p className="zrv-hr-sub">{subtitle}</p>
        </div>
        <div className="zrv-ir-head__actions">
          {records.data?.loadedAt && <span className="zrv-ir-stamp" role="status"><i aria-hidden="true" />{T.updated(clock(records.data.loadedAt))}</span>}
          <button type="button" className={`zrv-ir-btn${filtersOpen ? ' zrv-ir-is-on' : ''}`} aria-expanded={filtersOpen} aria-controls={`${id}-filters`}
            onClick={() => setFiltersOpen((value) => !value)}>
            <OrvexaIcon name="sliders-horizontal" size={16} />{T.filter}
            {activeFilters > 0 && <span className="zrv-ir-btn__badge">{activeFilters}</span>}
          </button>
          <button type="button" className="zrv-ir-btn" onClick={refresh} disabled={records.refreshing}>
            <OrvexaIcon name="refresh-cw" size={16} />{T.refresh}
          </button>
          <button type="button" className="zrv-ir-btn" onClick={() => window.print()}>
            <OrvexaIcon name="printer" size={16} />{T.print}
          </button>
          {canCreate && <button type="button" className="zrv-ir-btn zrv-ir-btn--primary" onClick={() => navigate(create.path)}>
            <OrvexaIcon name="plus" size={16} />{create.label}
          </button>}
        </div>
      </header>

      <div id={`${id}-filters`} className={`zrv-ir-collapse${filtersOpen ? ' zrv-ir-is-open' : ''}`} inert={!filtersOpen}>
        <div className="zrv-ir-collapse__inner">
          <form className="zrv-ir-filters" style={{ '--fields': fields.length }} onSubmit={apply} aria-label={T.filter}>
            {fields.map((field) => (
              <label key={field.key} className={`zrv-ir-field${field.type === 'search' ? ' zrv-ir-field--search' : ''}`} htmlFor={`${id}-${field.key}`}>
                <span>{field.label}</span>
                {field.type === 'select' ? (
                  <select id={`${id}-${field.key}`} value={draft[field.key]} onChange={setDraftValue(field.key)}>
                    <option value="">{T.all}</option>
                    {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                ) : field.type === 'date' ? (
                  <input id={`${id}-${field.key}`} type="date" value={draft[field.key]} onChange={setDraftValue(field.key)} />
                ) : (
                  <span className="zrv-ir-search">
                    <OrvexaIcon name="search" size={16} />
                    <input id={`${id}-${field.key}`} type="search" maxLength={100} placeholder={field.placeholder} value={draft[field.key]} onChange={setDraftValue(field.key)} />
                  </span>
                )}
              </label>
            ))}
            <div className="zrv-ir-filters__actions">
              <button type="submit" className="zrv-ir-btn zrv-ir-btn--primary"><OrvexaIcon name="check" size={15} />{T.apply}</button>
              <button type="button" className="zrv-ir-btn" onClick={reset}><OrvexaIcon name="rotate-ccw" size={15} />{T.reset}</button>
            </div>
          </form>
        </div>
      </div>

      <section className="zrv-ir-overview" aria-label={T.overview} aria-busy={overview.status !== 'ready' || undefined}>
        {overview.status === 'error' ? (
          <p className="zrv-ir-error zrv-ir-overview__error" role="alert">{T.unavailable} <button type="button" onClick={overview.reload}>{T.refresh}</button></p>
        ) : cards.map((card, index) => <div key={card.key} className="zrv-ir-overview__slot">{card.render(overview.data?.[index], ctx)}</div>)}
        {groups.length > 0 && (
          <div className="zrv-ir-overview__slot">
            <Card index={cards.length} icon="list-filter" label={T.breakdown} theme="primary">
              {breakdown.status === 'error' ? (
                <p className="zrv-ir-error" role="alert">{T.breakdownUnavailable} <button type="button" onClick={breakdown.reload}>{T.refresh}</button></p>
              ) : (
                <div className="zrv-ir-breaks">
                  {groups.map((group, index) => <Breakdown key={group.key} group={group} counts={breakdown.data?.[index]} isActive={isActive} onPick={select} />)}
                </div>
              )}
            </Card>
          </div>
        )}
      </section>

      <div className="zrv-ir-main">
        <section className="zrv-ir-card zrv-ir-stream" aria-labelledby={`${id}-heading`}>
          <header className="zrv-ir-card__head"><h2 id={`${id}-heading`}>{heading}</h2></header>
          <ResourceState resource={records} label={heading.toLowerCase()} empty={empty} isEmpty={(data) => !data.items.length}>
            {(data) => (
              <>
                <div className="zrv-ir-tablewrap" tabIndex={0} aria-busy={records.refreshing || undefined}>
                  <table className="zrv-ir-table">
                    <caption className="zrv-hr-sr">{heading}</caption>
                    <thead>
                      <tr>
                        {columns.map((column) => (
                          <th key={column.key} scope="col" aria-sort={column.sort ? ariaSort(column.sort) : undefined}>
                            {column.sort ? (
                              <button type="button" onClick={() => sortBy(column.sort)}>
                                {column.label}
                                <OrvexaIcon name={sort.key !== column.sort ? 'chevrons-up-down' : sort.order === 'asc' ? 'chevron-up' : 'chevron-down'} size={13} />
                              </button>
                            ) : column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((row, index) => (
                        <tr key={rowKey(row)} style={{ '--i': index }} className={selected && rowKey(selected) === rowKey(row) ? 'zrv-ir-is-on' : undefined} onClick={() => open(row)}>
                          <td className={`zrv-ir-col-${first.key}`}>
                            <button type="button" className="zrv-ir-num" onClick={(event) => { event.stopPropagation(); open(row) }}>{first.render(row)}</button>
                            {first.sub && <small>{first.sub(row)}</small>}
                          </td>
                          {rest.map((column) => <td key={column.key} className={`zrv-ir-col-${column.key}`}>{column.render(row)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination pagination={data.pagination} disabled={records.refreshing} label={T.pages(heading)} onPage={setPage} />
              </>
            )}
          </ResourceState>
        </section>
      </div>

      {selected && <Summary row={selected} detail={summary(selected, today)} number={numberOf(selected)} path={pathOf(selected)}
        extra={renderDetail?.(selected, { onChanged: (updated) => { setSelected((current) => current && rowKey(current) === rowKey(selected) ? { ...current, ...updated } : current); refresh() } })}
        openLabel={openLabel} closing={closing} onClose={close} />}
    </div>
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
            <button type="button" aria-pressed={isActive(item.patch)} onClick={() => onPick(item.patch)}>
              <span>{item.label}</span>
              <span className="zrv-ir-break__track" aria-hidden="true"><i style={{ transform: `scaleX(${(counts?.[index] ?? 0) / max})` }} /></span>
              <b>{counts ? counts[index] : <i className="zrv-ir-skel" aria-hidden="true" />}</b>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Side summary of one listed record (the list's own fields; the full record
// opens on its form). It slides in and, while `closing`, slides out.
function Summary({ row, detail, number, path, openLabel, closing, onClose, extra }) {
  const [copiedOf, setCopiedOf] = useState(null)
  const copied = copiedOf === row
  const canCopy = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.writeText)
  const copy = () => navigator.clipboard.writeText(String(number)).then(() => setCopiedOf(row), () => setCopiedOf(null))
  return (
    <div className={`zrv-hr-rp-drawer zrv-ir-drawer${closing ? ' zrv-ir-is-closing' : ''}`}>
      <Dialog title={String(number)} onClose={onClose}>
        <button type="button" className="zrv-hr-rp-drawer__x" onClick={onClose} aria-label={T.close}><OrvexaIcon name="x" size={18} /></button>
        <div key={String(number)} className="zrv-ir-drawer__body">
          <div className="zrv-ir-drawer__hero"><b>{detail.heading || COMMON_TEXT.dash}</b>{detail.pill}</div>
          <dl className="zrv-ir-drawer__facts">
            {detail.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || COMMON_TEXT.dash}</dd></div>)}
          </dl>
          {detail.timing && <div className={`zrv-ir-drawer__due zrv-ir-is-${detail.timing.tone}`}><span>{T.timing}</span><b>{detail.timing.text}</b></div>}
          {extra}
          <div className="zrv-ir-drawer__actions">
            <Link className="zrv-ir-btn zrv-ir-btn--primary" to={path}><OrvexaIcon name="external-link" size={16} />{openLabel}</Link>
            {canCopy && <button type="button" className="zrv-ir-btn" onClick={copy}><OrvexaIcon name={copied ? 'check' : 'copy'} size={16} />{copied ? T.copied : T.copy}</button>}
            <span className="zrv-hr-sr" role="status">{copied ? T.copied : ''}</span>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
