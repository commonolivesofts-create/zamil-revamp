import { useState } from 'react'
import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { Dialog, Pagination, ResourceState } from '@/features/security-administration/components/AdminUi.jsx'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { COMMON_TEXT, REPORT_TEXT as T } from '../hrRecruitmentText.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { businessToday, enDate } from '../shared/hrFormat.js'
import { RecruitmentHeader } from '../shared/components/RecruitmentShell.jsx'
import { HrField } from '../shared/components/RecruitmentInputs.jsx'
import '@/styles/hr-recruitment.css'

const service = hrRecruitmentServices.employeeReport
const PAGE_SIZE = 50
const today = businessToday()
const INITIAL_FILTERS = Object.freeze({ department: 'ALL', dateFrom: '', dateTo: today })
const formatRate = (value) => new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value)

export default function EmployeeReportPage() {
  const lookups = useResource('hr-contractor-employee-lookups', (signal) => service.getLookups({ signal }))
  return (
    <div className="zrv-hr zrv-hr--report">
      <RecruitmentHeader title={T.title} subtitle={T.subtitle} breadcrumb={T.breadcrumb} />
      <ResourceState resource={lookups} label={COMMON_TEXT.loadingLookups} empty="Employee report filters are unavailable.">
        {({ departments }) => <EmployeeReport departments={departments} />}
      </ResourceState>
    </div>
  )
}

function EmployeeReport({ departments }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState({ ...INITIAL_FILTERS })
  const [filters, setFilters] = useState(null)
  const [editing, setEditing] = useState(true)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('employee_number')
  const [order, setOrder] = useState('asc')
  const [selected, setSelected] = useState(null)
  const query = filters ? { ...filters, page, limit: PAGE_SIZE, sort, order } : null
  const result = useResource(query ? `hr-contractor-employees:${JSON.stringify(query)}` : null,
    (signal) => service.list(query, { signal }))

  const runReport = (event) => {
    event.preventDefault()
    setFilters({ ...draft })
    setPage(1)
    setEditing(false)
  }
  const changeSort = (value) => {
    if (sort === value) setOrder((current) => current === 'asc' ? 'desc' : 'asc')
    else { setSort(value); setOrder('asc') }
    setPage(1)
  }
  const header = (name, label) => (
    <th scope="col" aria-sort={sort === name ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="zrv-hr-rp-sort-button" onClick={() => changeSort(name)}>
        {label}<span aria-hidden="true">{sort === name ? (order === 'asc' ? ' ↑' : ' ↓') : ''}</span>
      </button>
    </th>
  )

  return <>
    <div className="zrv-hr-toolbar" role="toolbar" aria-label={T.tools.label}>
      <div className="zrv-hr-tools">
        <button type="button" onClick={() => navigate('/dashboard')} title={T.tools.home}><OrvexaIcon name="house" size={17} /><span>{T.tools.home}</span></button>
        <button type="button" onClick={() => setEditing(true)} disabled={!filters || editing} title={T.tools.change}><OrvexaIcon name="sliders-horizontal" size={17} /><span>{T.tools.change}</span></button>
        <button type="button" onClick={() => window.print()} disabled={result.status !== 'ready'} title={T.tools.print}><OrvexaIcon name="printer" size={17} /><span>{T.tools.print}</span></button>
      </div>
      {filters && !editing && <div className="zrv-hr-rp-params">
        <span><small>{T.summary.department}</small>{filters.department === 'ALL' ? T.summary.all : departments.find((item) => item.value === filters.department)?.label ?? filters.department}</span>
        <span><small>{T.summary.period}</small>{filters.dateFrom ? enDate(filters.dateFrom) : '—'} – {enDate(filters.dateTo)}</span>
      </div>}
    </div>

    {editing && <form className={`zrv-hr-rp-setup${filters ? ' zrv-hr-is-inline' : ''}`} onSubmit={runReport}>
      <div className="zrv-hr-rp-setup__h">
        <span className="zrv-hr-bubble"><OrvexaIcon name="sliders-horizontal" size={18} /></span>
        <div><h2>{T.setup.title}</h2><p>{T.setup.desc}</p></div>
      </div>
      <div className="zrv-hr-rp-setup__grid">
        <HrField id="er-department" label={T.setup.department}>
          <select id="er-department" className="ux-select zrv-hr-input" value={draft.department}
            onChange={(event) => setDraft((current) => ({ ...current, department: event.target.value }))}>
            <option value="ALL">{T.summary.all}</option>
            {departments.filter((item) => item.value !== 'ALL').map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </HrField>
        <HrField id="er-from" label={T.setup.from}>
          <input id="er-from" type="date" max={draft.dateTo || undefined} className="ux-input zrv-hr-input" value={draft.dateFrom}
            onChange={(event) => setDraft((current) => ({ ...current, dateFrom: event.target.value }))} />
        </HrField>
        <HrField id="er-to" label={T.setup.to}>
          <input id="er-to" type="date" min={draft.dateFrom || undefined} className="ux-input zrv-hr-input" value={draft.dateTo}
            onChange={(event) => setDraft((current) => ({ ...current, dateTo: event.target.value }))} />
        </HrField>
      </div>
      <div className="zrv-hr-rp-setup__f">
        <div className="zrv-hr-rp-setup__act">
          {filters && <button type="button" className="btn-secondary zrv-hr-btn" onClick={() => { setDraft({ ...filters }); setEditing(false) }}>{T.setup.cancel}</button>}
          <button type="submit" className="btn-primary zrv-hr-btn"><OrvexaIcon name="chart-column" size={16} /> {T.setup.run}</button>
        </div>
      </div>
    </form>}

    {filters && <div className="zrv-hr-rp-results" aria-busy={result.status === 'loading' || undefined}>
      <ResourceState resource={result} label={T.title} empty="No employees match the selected department and dates.">
        {({ items, pagination }) => <>
          <section className="zrv-hr-rp-kpis" aria-label={T.kpis.label}>
            {[
              ['Matching employees', pagination.total, 'Records for the selected report'],
              ['Active on this page', items.filter((employee) => employee.status === 'Active').length, `${items.length} records shown on this page`],
              ['Inactive on this page', items.filter((employee) => employee.status === 'Inactive').length, 'Based on live API records'],
            ].map(([label, value, note], index) => <div key={label} className="zrv-hr-rp-kpi" style={{ '--i': index }}><small>{label}</small><b>{value}</b><span>{note}</span></div>)}
          </section>
          <section className="zrv-hr-rp-card zrv-hr-rp-table-card" aria-labelledby="employee-report-title">
            <div className="zrv-hr-rp-tbar"><h3 id="employee-report-title">Employees <small>{pagination.total} records</small></h3></div>
            <div className="zrv-hr-rp-tablewrap">
              <table className="zrv-hr-rp-table">
                <caption className="zrv-hr-sr">Employee report</caption>
                <thead><tr>{header('employee_number', 'Employee no.')}{header('employee_name', 'Employee name')}<th scope="col">Division</th><th scope="col">Department</th><th scope="col">Contractor</th>{header('start_date', 'Start date')}{header('end_date', 'End date')}{header('status', 'Status')}<th scope="col">Details</th></tr></thead>
                <tbody>{items.map((employee) => <tr key={employee.empId}>
                  <td>{employee.employeeNumber}</td><td>{employee.name}</td><td>{employee.division}</td>
                  <td>{employee.department}{employee.productionSection ? ` · ${employee.productionSection}` : ''}</td>
                  <td>{employee.contractorName} · {employee.contractorNumber}</td><td>{enDate(employee.startDate)}</td>
                  <td>{employee.endDate ? enDate(employee.endDate) : '—'}</td><td>{employee.status}</td>
                  <td><button type="button" className="zrv-admin-link" onClick={() => setSelected(employee)}>View</button></td>
                </tr>)}</tbody>
              </table>
            </div>
            <Pagination pagination={pagination} onPage={setPage} disabled={result.refreshing} />
          </section>
        </>}
      </ResourceState>
    </div>}

    {selected && <Dialog title={selected.name} onClose={() => setSelected(null)}>
      <dl className="zrv-hr-review zrv-hr-rp-facts">
        {[
          ['Employee number', selected.employeeNumber], ['Iqamah', selected.iqamah], ['Division', selected.division], ['Department', selected.department],
          ['Production section', selected.productionSection], ['Job title', selected.jobTitle], ['Direct boss', selected.directBoss], ['Place', selected.place],
          ['Replacement', selected.replacement], ['Contractor', `${selected.contractorName} · ${selected.contractorNumber}`], ['Rate', formatRate(selected.rate)],
          ['Start date', enDate(selected.startDate)], ['End date', selected.endDate ? enDate(selected.endDate) : '—'], ['Status', selected.status],
          ['Ajeer', selected.ajeer ? 'Yes' : 'No'], ['SFDA', selected.sfda ? 'Yes' : 'No'], ['Blacklist', selected.blacklist ? 'Yes' : 'No'], ['Remark', selected.remark || '—'],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
    </Dialog>}
  </>
}
