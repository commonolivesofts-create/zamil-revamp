import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { ES_COMMON_TEXT } from '../hrEmployeeServicesText.js'
import { ariaSort, filterAndSort, nextSort, statusCounts } from './esFormat.js'

const T = ES_COMMON_TEXT.list

// Status tabs (role="tab", arrow keys move between them) over a searchable
// table with sortable column headers (aria-sort). `columns`:
// { key, label, num?, sortable?, render(row) }; the first column links to the record.
export function RecordList({
  heading, searchLabel, searchPlaceholder, statuses, statusText, rows, columns, defaultSort, searchText, pathOf, numberOf, valueFor,
}) {
  const id = useId()
  const [status, setStatus] = useState('ALL')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState(defaultSort)
  const tabs = useRef([])
  const [focusTab, setFocusTab] = useState(null)
  const counts = statusCounts(rows, statuses)
  const shown = filterAndSort(rows, { status, search, searchText, sort, valueFor })
  const tabId = (code) => `${id}-tab-${code}`
  const panelId = `${id}-panel`

  useEffect(() => {
    if (focusTab !== null) tabs.current[focusTab]?.focus()
  }, [focusTab])

  const onTabKey = (event, index) => {
    const last = counts.length - 1
    const target = event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
        : event.key === 'Home' ? 0 : event.key === 'End' ? last : null
    if (target === null) return
    event.preventDefault()
    setStatus(counts[target][0])
    setFocusTab(target)
  }

  return (
    <section className="zrv-hr-rp-card zrv-hr-es-list" aria-label={heading}>
      <div className="zrv-hr-rp-tbar">
        <h3>{heading} <small>{T.shown(shown.length)}</small></h3>
        <div className="zrv-hr-rp-search">
          <OrvexaIcon name="search" size={16} />
          <label className="zrv-hr-sr" htmlFor={`${id}-q`}>{searchLabel}</label>
          <input id={`${id}-q`} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={searchPlaceholder} />
        </div>
        <div className="zrv-hr-es-tabs" role="tablist" aria-label={T.statusLabel}>
          {counts.map(([code, count], index) => (
            <button key={code} ref={(node) => { tabs.current[index] = node }} id={tabId(code)} type="button" role="tab"
              aria-selected={status === code} aria-controls={panelId} tabIndex={status === code ? 0 : -1}
              onClick={() => setStatus(code)} onKeyDown={(event) => onTabKey(event, index)}>
              {code === 'ALL' ? T.all : statusText[code]}<b>{count}</b>
            </button>
          ))}
        </div>
      </div>
      <div className="zrv-hr-rp-tablewrap" id={panelId} role="tabpanel" aria-labelledby={tabId(status)} tabIndex={0}>
        <table className="zrv-hr-rp-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={column.num ? 'zrv-hr-is-num' : undefined} aria-sort={column.sortable === false ? undefined : ariaSort(sort, column.key)}>
                  {column.sortable === false ? column.label : (
                    <button type="button" onClick={() => setSort((current) => nextSort(current, column.key))} aria-label={T.sortBy(column.label)}>
                      {column.label}
                      <span className={`zrv-hr-rp-sort${sort?.key === column.key ? (sort.dir > 0 ? ' zrv-hr-is-up' : ' zrv-hr-is-down') : ''}`} aria-hidden="true" />
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => (
              <tr key={numberOf(row)} style={{ '--i': index }}>
                {columns.map((column, position) => (
                  <td key={column.key} className={column.num ? 'zrv-hr-is-num' : undefined}>
                    {position === 0 ? <Link className="zrv-hr-rp-name zrv-hr-mono" to={pathOf(row)} aria-label={T.open(numberOf(row))}>{column.render(row)}</Link> : column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={columns.length} className="zrv-hr-rp-empty">{T.empty}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
