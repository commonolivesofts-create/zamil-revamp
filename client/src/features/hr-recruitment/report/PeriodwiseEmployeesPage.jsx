import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { Dialog, Feedback, ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { COMMON_TEXT, REPORT_TEXT as T } from '../hrRecruitmentText.js'
import { hrRecruitmentDemo, hrRecruitmentServices } from '../hrRecruitmentService.js'
import { businessToday, enDate, initials } from '../shared/hrFormat.js'
import { RecruitmentHeader } from '../shared/components/RecruitmentShell.jsx'
import { HrField } from '../shared/components/RecruitmentInputs.jsx'
import { Bars, Donut, Flow } from './ReportCharts.jsx'
import {
  ALL_DEPARTMENTS, PAGE_SIZE, RETIREMENT_AGE, ageBandCounts, csvFileName, filterRows, groupCount, quickRanges, runReport, sortRows,
  summarise, toCsv, validateParams, withBom, yearlyFlow,
} from './periodwiseModel.js'
import '@/styles/hr-recruitment.css'

const service = hrRecruitmentServices.reports
const C = T.columns
// Table columns: key, label, sortable, numeric, display (and CSV) value. Position is hidden by default.
const COLUMNS = Object.freeze([
  { key: 'index', label: C.index, fixed: true },
  { key: 'employeeNumber', label: C.employeeNumber, sort: true, numeric: true },
  { key: 'name', label: C.name, sort: true, fixed: true },
  { key: 'birthDate', label: C.birthDate, sort: true, show: (row) => enDate(row.birthDate) },
  { key: 'age', label: C.age, sort: true, numeric: true },
  { key: 'nationality', label: C.nationality, sort: true },
  { key: 'job', label: C.job, sort: true },
  { key: 'departmentName', label: C.department, sort: true },
  { key: 'position', label: C.position, sort: true, hidden: true },
  { key: 'nationalId', label: C.nationalId, sort: true },
  { key: 'startDate', label: C.startDate, sort: true, show: (row) => enDate(row.startDate) },
  { key: 'years', label: C.years, sort: true, numeric: true, show: (row) => row.years.toFixed(2) },
  { key: 'endDate', label: C.endDate, sort: true, show: (row) => (row.endDate ? enDate(row.endDate) : '') },
  { key: 'leavingReason', label: C.leavingReason, sort: true },
])
const valueOf = (column, row) => (column.show ? column.show(row) : row[column.key] ?? '')

export default function PeriodwiseEmployeesPage() {
  const lookups = useResource('hr-recruitment-lookups', (signal) => hrRecruitmentServices.lookups.get({ signal }))
  return (
    <div className="zrv-hr zrv-hr--report">
      <RecruitmentHeader title={T.title} subtitle={T.subtitle} breadcrumb={T.breadcrumb} demo={hrRecruitmentDemo} />
      {lookups.status === 'ready'
        ? <Report departments={lookups.data.departments} />
        : <div className="zrv-admin-panel"><ResourceState resource={lookups} label={COMMON_TEXT.loadingLookups} empty={COMMON_TEXT.loadingLookups}>{() => null}</ResourceState></div>}
    </div>
  )
}

function Report({ departments }) {
  const navigate = useNavigate()
  const today = businessToday()
  const ranges = quickRanges(today)
  const departmentName = (code) => departments.find((item) => item.code === code)?.name ?? code
  const [params, setParams] = useState({ department: ALL_DEPARTMENTS, from: '', to: today })
  const [ran, setRan] = useState(null)
  const [editing, setEditing] = useState(true)
  const [errors, setErrors] = useState({})
  const [version, setVersion] = useState(0)
  const [filters, setFilters] = useState({ search: '', status: 'all', nationality: '', department: '', band: '', flagged: false })
  const [sort, setSort] = useState({ key: 'employeeNumber', direction: -1 })
  const [page, setPage] = useState(0)
  const [compact, setCompact] = useState(true)
  const [hidden, setHidden] = useState(() => COLUMNS.filter((column) => column.hidden).map((column) => column.key))
  const [columnMenu, setColumnMenu] = useState(false)
  const [open, setOpen] = useState(null)
  const [notice, setNotice] = useState(null)
  const [printing, setPrinting] = useState(false)

  const report = useResource(ran ? `hr-periodwise:${ran.department}:${ran.from}:${ran.to}:${version}` : null,
    (signal) => service.periodwiseEmployees(ran, { signal }))

  // Printing lists every filtered row, not just the current page.
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true))
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after) }
  }, [])

  // The column chooser closes on a pointer press outside it (and on Escape).
  const columnWrap = useRef(null)
  useEffect(() => {
    if (!columnMenu) return undefined
    const outside = (event) => { if (!columnWrap.current?.contains(event.target)) setColumnMenu(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [columnMenu])

  const run = () => {
    const found = validateParams(params)
    setErrors(found)
    if (Object.keys(found).length) return
    setRan({ ...params })
    setVersion((value) => value + 1)
    setEditing(false)
    setPage(0)
    setNotice(null)
    setFilters((current) => ({ ...current, nationality: '', department: '', band: '' }))
  }
  const setFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(0)
  }

  const rows = report.status === 'ready'
    ? runReport(report.data.rows.map((row) => ({ ...row, departmentName: departmentName(row.departmentCode) })), ran, today) : []
  const summary = report.status === 'ready' ? summarise(rows, ran) : null
  const filtered = sortRows(filterRows(rows, filters), sort)
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const view = printing ? filtered : filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE)
  const columns = COLUMNS.filter((column) => !hidden.includes(column.key))
  const activeRows = rows.filter((row) => row.active)
  const chips = [
    filters.department && [T.table.chips.department, departmentName(filters.department), () => setFilter('department', '')],
    filters.nationality && [T.table.chips.nationality, filters.nationality, () => setFilter('nationality', '')],
    filters.band && [T.table.chips.band, T.bands[filters.band], () => setFilter('band', '')],
    filters.flagged && [T.table.chips.data, T.table.chips.needsChecking, () => setFilter('flagged', false)],
  ].filter(Boolean)
  const sortBy = (key) => setSort((value) => (value.key === key ? { key, direction: -value.direction } : { key, direction: 1 }))

  const exportCsv = () => {
    const csv = toCsv(filtered, columns.map((column) => ({ label: column.label, value: (row, index) => (column.key === 'index' ? index + 1 : valueOf(column, row)) })))
    try {
      const url = URL.createObjectURL(new Blob([withBom(csv)], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = csvFileName(ran)
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice({ kind: 'success', message: T.exported(filtered.length), details: [] })
    } catch {
      setNotice({ kind: 'error', message: T.exportFailed, details: [] })
    }
  }

  const ready = report.status === 'ready'
  return (
    <>
      <div className="zrv-hr-toolbar" role="toolbar" aria-label={T.tools.label}>
        <div className="zrv-hr-tools">
          <button type="button" onClick={() => navigate('/dashboard')} title={T.tools.home}><OrvexaIcon name="house" size={17} /><span>{T.tools.home}</span></button>
          <button type="button" onClick={() => setEditing(true)} disabled={!ran || editing} title={T.tools.change}><OrvexaIcon name="sliders-horizontal" size={17} /><span>{T.tools.change}</span></button>
          <button type="button" onClick={exportCsv} disabled={!ready || !filtered.length} title={T.tools.export}><OrvexaIcon name="download" size={17} /><span>{T.tools.export}</span></button>
          <button type="button" onClick={() => window.print()} disabled={!ready} title={T.tools.print}><OrvexaIcon name="printer" size={17} /><span>{T.tools.print}</span></button>
        </div>
        {ran && !editing && (
          <div className="zrv-hr-rp-params">
            <span><small>{T.summary.department}</small>{ran.department === ALL_DEPARTMENTS ? T.summary.all : departmentName(ran.department)}</span>
            <span><small>{T.summary.period}</small>{enDate(ran.from)} – {enDate(ran.to)}</span>
          </div>
        )}
      </div>

      <Feedback feedback={notice} onDismiss={() => setNotice(null)} />

      {editing && (
        <section className={`zrv-hr-rp-setup${ran ? ' zrv-hr-is-inline' : ''}`} aria-labelledby="rp-setup-title">
          <div className="zrv-hr-rp-setup__h">
            <span className="zrv-hr-bubble"><OrvexaIcon name="sliders-horizontal" size={18} /></span>
            <div><h2 id="rp-setup-title">{T.setup.title}</h2><p>{T.setup.desc}</p></div>
          </div>
          <div className="zrv-hr-rp-setup__grid">
            <HrField id="rp-dept" label={T.setup.department}>
              <select id="rp-dept" className="ux-select zrv-hr-input" value={params.department} onChange={(event) => setParams((value) => ({ ...value, department: event.target.value }))}>
                <option value={ALL_DEPARTMENTS}>{T.summary.all}</option>
                {departments.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
            </HrField>
            <HrField id="rp-from" label={T.setup.from} required error={errors.from}>
              <input {...fieldProps('rp-from', { error: errors.from })} type="date" className="ux-input zrv-hr-input" value={params.from} aria-required="true"
                onChange={(event) => { const value = event.target.value; setParams((current) => ({ ...current, from: value })); setErrors((current) => ({ ...current, from: undefined })) }} />
            </HrField>
            <HrField id="rp-to" label={T.setup.to} required error={errors.to}>
              <input {...fieldProps('rp-to', { error: errors.to })} type="date" className="ux-input zrv-hr-input" value={params.to} aria-required="true"
                onChange={(event) => { const value = event.target.value; setParams((current) => ({ ...current, to: value })); setErrors((current) => ({ ...current, to: undefined })) }} />
            </HrField>
          </div>
          <div className="zrv-hr-rp-setup__f">
            <div className="zrv-hr-picks" role="group" aria-label={T.setup.quick}>
              {Object.entries(ranges).map(([key, [from, to]]) => (
                <button key={key} type="button" onClick={() => { setParams((value) => ({ ...value, from, to })); setErrors({}) }}>{T.ranges[key]}</button>
              ))}
            </div>
            <div className="zrv-hr-rp-setup__act">
              {ran && <button type="button" className="btn-secondary zrv-hr-btn" onClick={() => { setParams(ran); setErrors({}); setEditing(false) }}>{T.setup.cancel}</button>}
              <button type="button" className="btn-primary zrv-hr-btn" onClick={run}><OrvexaIcon name="chart-column" size={16} /> {T.setup.run}</button>
            </div>
          </div>
        </section>
      )}

      {ran && !ready && (
        <div className="zrv-admin-panel" aria-busy={report.status === 'loading' || undefined}>
          {report.status === 'loading' && <div className="zrv-hr-rp-skeleton" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>}
          <ResourceState resource={report} label={T.loading} empty={T.table.noData}>{() => null}</ResourceState>
        </div>
      )}

      {ready && summary && <>
        <section className="zrv-hr-rp-kpis" aria-label={T.kpis.label}>
          {[
            [T.kpis.total, summary.total, T.kpis.active(summary.active)],
            [T.kpis.joiners, summary.joiners, T.kpis.joinersNote],
            [T.kpis.leavers, summary.leavers, T.kpis.turnover(summary.turnover)],
            [T.kpis.saudization, `${summary.saudization}%`, T.kpis.saudizationNote],
            [T.kpis.averageAge, summary.averageAge || COMMON_TEXT.dash, T.kpis.senior(summary.senior, RETIREMENT_AGE)],
            [T.kpis.service, T.kpis.serviceValue(summary.averageService), T.kpis.serviceNote],
          ].map(([label, value, note], index) => (
            <div key={label} className="zrv-hr-rp-kpi" style={{ '--i': index }}><small>{label}</small><b>{value}</b><span>{note}</span></div>
          ))}
        </section>

        {rows.length > 0 && (
          <section className="zrv-hr-rp-charts">
            <article className="zrv-hr-rp-card"><h3>{T.charts.department} <small>{T.charts.filter}</small></h3>
              <Bars label={T.charts.department} active={filters.department} onPick={(value) => setFilter('department', value)}
                data={groupCount(rows, 'departmentCode').slice(0, 8).map(([code, count]) => [code, departmentName(code), count])} />
            </article>
            <article className="zrv-hr-rp-card"><h3>{T.charts.nationality} <small>{T.charts.active}</small></h3>
              <Donut data={groupCount(activeRows, 'nationality')} active={filters.nationality} onPick={(value) => setFilter('nationality', value)} />
            </article>
            <article className="zrv-hr-rp-card"><h3>{T.charts.bands} <small>{T.charts.active}</small></h3>
              <Bars label={T.charts.bands} active={filters.band} onPick={(value) => setFilter('band', value)}
                data={ageBandCounts(activeRows).map(([key, count]) => [key, T.bands[key], count])} />
            </article>
            <article className="zrv-hr-rp-card"><h3>{T.charts.flow} <small>{T.charts.byYear}</small></h3>
              <Flow data={yearlyFlow(rows, Number(today.slice(0, 4)))} />
            </article>
          </section>
        )}

        <section className="zrv-hr-rp-card zrv-hr-rp-table-card" aria-labelledby="rp-table-title">
          <div className="zrv-hr-rp-tbar">
            <h3 id="rp-table-title">{T.table.title} <small>{T.table.count(filtered.length, rows.length)}</small></h3>
            <div className="zrv-hr-rp-search">
              <OrvexaIcon name="search" size={16} />
              <label className="zrv-hr-sr" htmlFor="rp-search">{T.table.search}</label>
              <input id="rp-search" type="search" value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder={T.table.searchPlaceholder} />
            </div>
            <div className="zrv-hr-seg zrv-hr-seg--status" role="group" aria-label={T.table.status} style={{ '--li': T.table.statuses.findIndex(([value]) => value === filters.status) }}>
              <span className="zrv-hr-seg__pill" aria-hidden="true" />
              {T.table.statuses.map(([value, label]) => <button key={value} type="button" aria-pressed={filters.status === value} onClick={() => setFilter('status', value)}>{label}</button>)}
            </div>
            <button type="button" className={`zrv-hr-rp-toggle${filters.flagged ? ' zrv-hr-is-on' : ''}`} aria-pressed={filters.flagged} title={T.table.flaggedHint}
              onClick={() => setFilter('flagged', !filters.flagged)}>{T.table.flagged} <b>{summary.flagged}</b></button>
            <button type="button" className={`zrv-hr-rp-toggle${compact ? ' zrv-hr-is-on' : ''}`} aria-pressed={compact} onClick={() => setCompact((value) => !value)}>{T.table.compact}</button>
            <div className="zrv-hr-rp-colwrap" ref={columnWrap}
              onKeyDown={(event) => { if (event.key === 'Escape' && columnMenu) { event.stopPropagation(); setColumnMenu(false); event.currentTarget.querySelector('button')?.focus() } }}>
              <button type="button" className="zrv-hr-rp-toggle" aria-expanded={columnMenu} aria-controls="rp-columns" onClick={() => setColumnMenu((value) => !value)}>{T.table.columns}</button>
              {columnMenu && (
                <div className="zrv-hr-rp-columns" id="rp-columns" role="group" aria-label={T.table.columns}>
                  {COLUMNS.filter((column) => !column.fixed).map((column) => (
                    <label key={column.key}>
                      <input type="checkbox" checked={!hidden.includes(column.key)}
                        onChange={() => setHidden((list) => (list.includes(column.key) ? list.filter((key) => key !== column.key) : [...list, column.key]))} />
                      {column.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
          {chips.length > 0 && (
            <div className="zrv-hr-rp-chips">
              {chips.map(([label, value, clear]) => (
                <button key={label} type="button" onClick={clear} aria-label={T.table.chips.remove(`${label}: ${value}`)}>{label}: <b>{value}</b><OrvexaIcon name="x" size={12} /></button>
              ))}
              <button type="button" className="zrv-hr-rp-chips__clear" onClick={() => setFilters((value) => ({ ...value, department: '', nationality: '', band: '', flagged: false }))}>{T.table.chips.clear}</button>
            </div>
          )}
          <div className="zrv-hr-rp-legend zrv-hr-rp-legend--top">
            <span><i className="zrv-hr-rp-senior" />{T.table.legend.senior(RETIREMENT_AGE)}</span>
            <span><i className="zrv-hr-rp-flag" />{T.table.legend.flagged}</span>
            <span><i className="zrv-hr-rp-gone" />{T.table.legend.left}</span>
          </div>
          <div className={`zrv-hr-rp-tablewrap${compact ? ' zrv-hr-is-compact' : ''}`}>
            <table className="zrv-hr-rp-table">
              <caption className="zrv-hr-sr">{T.table.caption}</caption>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} scope="col" className={column.numeric ? 'zrv-hr-is-num' : undefined}
                      aria-sort={sort.key === column.key ? (sort.direction > 0 ? 'ascending' : 'descending') : column.sort ? 'none' : undefined}>
                      {column.sort ? (
                        <button type="button" onClick={() => sortBy(column.key)}>
                          {column.label}<span className={`zrv-hr-rp-sort${sort.key === column.key ? (sort.direction > 0 ? ' zrv-hr-is-up' : ' zrv-hr-is-down') : ''}`} aria-hidden="true" />
                        </button>
                      ) : column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {view.map((row, index) => (
                  <tr key={row.employeeNumber} style={{ '--i': index }}
                    className={[row.senior && 'zrv-hr-rp-senior', row.flags.length && 'zrv-hr-rp-flag', !row.active && 'zrv-hr-rp-gone'].filter(Boolean).join(' ') || undefined}>
                    {columns.map((column) => (
                      <td key={column.key} className={column.numeric ? 'zrv-hr-is-num' : undefined}>
                        {column.key === 'index' ? (printing ? index + 1 : current * PAGE_SIZE + index + 1)
                          : column.key === 'name' ? (
                            <button type="button" className="zrv-hr-rp-name" onClick={() => setOpen(row)}>
                              {row.name}{row.flags.length > 0 && <span className="zrv-hr-rp-dot" title={T.table.flagTitle(row.flags.map((flag) => T.flags[flag]))} aria-label={T.table.flagTitle(row.flags.map((flag) => T.flags[flag]))} />}
                            </button>
                          ) : valueOf(column, row)}
                      </td>
                    ))}
                  </tr>
                ))}
                {!view.length && <tr><td colSpan={columns.length} className="zrv-hr-rp-empty">{rows.length ? T.table.empty : T.table.noData}</td></tr>}
              </tbody>
            </table>
          </div>
          <nav className="zrv-hr-rp-pager" aria-label={T.table.title}>
            <span role="status">{T.table.showing(filtered.length ? current * PAGE_SIZE + 1 : 0, Math.min(filtered.length, current * PAGE_SIZE + PAGE_SIZE), filtered.length)}</span>
            <div>
              <button type="button" className="btn-secondary zrv-hr-btn" disabled={current === 0} onClick={() => setPage(current - 1)}><OrvexaIcon name="arrow-left" size={15} /> {T.table.previous}</button>
              <b>{T.table.page(current + 1, pages)}</b>
              <button type="button" className="btn-secondary zrv-hr-btn" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>{T.table.next} <OrvexaIcon name="arrow-right" size={15} /></button>
            </div>
          </nav>
        </section>
      </>}

      {open && (
        <div className="zrv-hr-rp-drawer">
          <Dialog title={open.name} onClose={() => setOpen(null)}>
            <button type="button" className="zrv-hr-rp-drawer__x" aria-label={T.panel.close} onClick={() => setOpen(null)} data-autofocus><OrvexaIcon name="x" size={16} /></button>
            <div className="zrv-hr-dark zrv-hr-rp-drawer__card">
              <div className="zrv-hr-dark__top"><span className="zrv-hr-eyebrow">{T.panel.eyebrow}</span><span className="zrv-hr-mono">#{open.employeeNumber}</span></div>
              <div className="zrv-hr-dark__who">
                <span className="zrv-hr-dark__av" aria-hidden="true">{initials(open.name)}</span>
                <div><div className="zrv-hr-dark__sub">{open.job} · {open.departmentName}</div></div>
              </div>
              <div className="zrv-hr-dark__badges">
                {open.active ? <span className="zrv-hr-is-solid">{T.panel.active}</span> : <span>{T.panel.left(open.leavingReason)}</span>}
                {open.senior && <span>{T.panel.senior(RETIREMENT_AGE)}</span>}
                <span>{open.nationality}</span>
              </div>
            </div>
            <dl className="zrv-hr-review zrv-hr-rp-facts">
              {[
                [T.panel.birth, open.birthDate ? T.panel.birthValue(enDate(open.birthDate), open.age) : COMMON_TEXT.dash],
                [T.panel.nationalId, open.nationalId || T.panel.missing], [T.panel.start, enDate(open.startDate)],
                [T.panel.end, open.endDate ? enDate(open.endDate) : COMMON_TEXT.dash], [T.panel.service, T.panel.serviceValue(open.years)], [T.panel.position, open.position],
              ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd className={value === T.panel.missing ? 'zrv-hr-is-missing' : undefined}>{value}</dd></div>)}
            </dl>
            {open.flags.length > 0 && <p className="zrv-hr-note">{T.panel.check(open.flags.map((flag) => T.flags[flag]))}</p>}
            <div className="zrv-hr-rp-tl">
              <span><b>{T.panel.joined}</b>{enDate(open.startDate)}</span>
              <span className="zrv-hr-rp-tl__line" aria-hidden="true"><i style={{ width: `${Math.min(100, (open.years / 40) * 100)}%` }} /></span>
              <span className="zrv-hr-rp-tl__end"><b>{open.endDate ? T.panel.leftOn : T.panel.today}</b>{enDate(open.endDate || today)}</span>
            </div>
          </Dialog>
        </div>
      )}
    </>
  )
}
