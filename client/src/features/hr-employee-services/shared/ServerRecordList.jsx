import { useId, useState } from 'react'
import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { Pagination, ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { ES_COMMON_TEXT } from '../hrEmployeeServicesText.js'
import { StatusTabs } from './StatusTabs.jsx'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'

const T = ES_COMMON_TEXT.list
const PAGE_SIZE = 25

// A report whose filtering, sorting and paging all happen on the server, laid
// out as RecordList: heading with the match count and status tabs, then the
// table. `filters`: [{ key, label, type: 'status' | 'search' | 'select' |
// 'date', options?, initial? }] (a 'status' filter is the tabs and applies at
// once; the others apply with the Filter button; one with `initial` starts
// there and has no "All"); `columns`: [{ key, label, sort?, num?, render(row) }]
// (a column with `sort` sends that sort key; the first column links to the
// record); `load({ page, pageSize, sort, order, ...filters }, { signal })`
// resolves to { items, pagination }.
export function ServerRecordList({
  heading, resourceKey, load, filters, columns, defaultSort = null, pathOf, numberOf, emptyText = 'No records match these filters.',
}) {
  const id = useId()
  const statusFilter = filters.find((filter) => filter.type === 'status')
  const formFilters = filters.filter((filter) => filter !== statusFilter)
  const blank = Object.fromEntries(filters.map((filter) => [filter.key, filter.initial ?? '']))
  const [draft, setDraft] = useState(blank)
  const [query, setQuery] = useState({ ...blank, page: 1, sort: defaultSort?.key ?? '', order: defaultSort?.order ?? '' })
  const records = useResource(`${resourceKey}:${JSON.stringify(query)}`, (signal) => load({ ...query, pageSize: PAGE_SIZE }, { signal }))
  const total = records.data?.pagination?.total
  const tabId = (code) => `${id}-tab-${code || 'ALL'}`
  const panelId = `${id}-panel`

  const apply = (event) => {
    event.preventDefault()
    setQuery((current) => ({ ...current, ...draft, page: 1 }))
  }
  const reset = () => {
    setDraft(blank)
    setQuery((current) => ({ ...current, ...blank, page: 1 }))
  }
  const setStatus = (value) => {
    setDraft((current) => ({ ...current, [statusFilter.key]: value }))
    setQuery((current) => ({ ...current, [statusFilter.key]: value, page: 1 }))
  }
  const sortBy = (key) => setQuery((current) => ({
    ...current, page: 1, sort: key, order: current.sort === key && current.order === 'asc' ? 'desc' : 'asc',
  }))
  const ariaSort = (key) => (query.sort === key ? (query.order === 'asc' ? 'ascending' : 'descending') : 'none')

  return (
    <section className="zrv-hr-rp-card zrv-hr-es-list" aria-label={heading}>
      <div className="zrv-hr-rp-tbar">
        <h3>{heading} {total !== undefined && <small>{T.found(total)}</small>}</h3>
        {statusFilter && (
          <StatusTabs items={[...(statusFilter.initial === undefined ? [['', T.all]] : []), ...statusFilter.options.map((option) => [option.value, option.label])]}
            value={query[statusFilter.key]} onChange={setStatus} tabId={tabId} panelId={panelId} />
        )}
      </div>
      {formFilters.length > 0 && (
        <form className="zrv-hr-esf-filters" onSubmit={apply} aria-label={`${heading} filters`}>
          {formFilters.map((filter) => (
            <label key={filter.key} className="zrv-hr-esf-filter" htmlFor={`${id}-${filter.key}`}>
              <span>{filter.label}</span>
              {filter.type === 'select' ? (
                <select id={`${id}-${filter.key}`} className="ux-input zrv-hr-input" value={draft[filter.key]}
                  onChange={(event) => setDraft((current) => ({ ...current, [filter.key]: event.target.value }))}>
                  {filter.initial === undefined && <option value="">{T.all}</option>}
                  {filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              ) : (
                <input id={`${id}-${filter.key}`} className="ux-input zrv-hr-input" type={filter.type === 'date' ? 'date' : 'search'}
                  value={draft[filter.key]} maxLength={filter.type === 'date' ? undefined : 100}
                  onChange={(event) => setDraft((current) => ({ ...current, [filter.key]: event.target.value }))} />
              )}
            </label>
          ))}
          <div className="zrv-hr-esf-filter-actions">
            <button type="submit" className="btn-primary zrv-hr-btn"><OrvexaIcon name="filter" size={15} /> Filter</button>
            <button type="button" className="btn-secondary zrv-hr-btn" onClick={reset}>Reset</button>
          </div>
        </form>
      )}
      <div {...(statusFilter && { id: panelId, role: 'tabpanel', 'aria-labelledby': tabId(query[statusFilter.key]) })}>
        <ResourceState resource={records} label={heading.toLowerCase()} empty={emptyText} isEmpty={(data) => !data.items.length}>
          {(data) => (
            <>
              <div className="zrv-hr-rp-tablewrap" tabIndex={0} aria-busy={records.refreshing || undefined}>
                <table className="zrv-hr-rp-table">
                  <caption className="zrv-hr-sr">{heading}</caption>
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th key={column.key} scope="col" className={column.num ? 'zrv-hr-is-num' : undefined} aria-sort={column.sort ? ariaSort(column.sort) : undefined}>
                          {column.sort ? (
                            <button type="button" onClick={() => sortBy(column.sort)} aria-label={T.sortBy(column.label)}>
                              {column.label}
                              <span className={`zrv-hr-rp-sort${query.sort === column.sort ? (query.order === 'asc' ? ' zrv-hr-is-up' : ' zrv-hr-is-down') : ''}`} aria-hidden="true" />
                            </button>
                          ) : column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((row, index) => (
                      <tr key={numberOf(row)} style={{ '--i': index }}>
                        {columns.map((column, position) => (
                          <td key={column.key} className={column.num ? 'zrv-hr-is-num' : undefined}>
                            {position === 0
                              ? <Link className="zrv-hr-rp-name zrv-hr-mono" to={pathOf(row)} aria-label={T.open(numberOf(row))}>{column.render(row)}</Link>
                              : column.render(row)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination pagination={data.pagination} disabled={records.refreshing} label={`${heading} pages`}
                onPage={(page) => setQuery((current) => ({ ...current, page }))} />
            </>
          )}
        </ResourceState>
      </div>
    </section>
  )
}
