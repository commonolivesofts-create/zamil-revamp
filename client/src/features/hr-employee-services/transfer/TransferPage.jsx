import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { ConfirmDialog } from '@/features/security-administration/components/AdminUi.jsx'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { businessToday, daysBetween, enDate, initials } from '@/features/hr-recruitment/shared/hrFormat.js'
import { useRecruitmentForm } from '@/features/hr-recruitment/shared/useRecruitmentForm.js'
import { RecruitmentLoader } from '@/features/hr-recruitment/shared/components/RecruitmentLoader.jsx'
import { NewFormDialog } from '@/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx'
import { Orbit, Pill, RecruitmentShell, StepHead, Ticket, Tilt } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { HrField, RadioCards, SearchableLookup } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
import { EmployeePicker } from '@/features/hr-recruitment/shared/components/EmployeePicker.jsx'
import { ES_COMMON_TEXT as C, TRANSFER_TEXT as T } from '../hrEmployeeServicesText.js'
import { hrEmployeeServices } from '../hrEmployeeServicesService.js'
import { ES_PATHS } from '../employeeServicesPaths.js'
import { NO_IDENTIFY, useEmployeeServicesUser } from '../shared/useEmployeeServicesUser.js'
import { warmEmployeeList } from '../shared/employeeList.js'
import { lockedStepsOf, problemsInStep } from '../shared/stepGating.js'
import '@/styles/hr-employee-services.css'
import {
  TRANSFER_ROUTE, blankTransfer, isTransferLocked, sectionsOf, transferMoves, transferPayload, validateTransfer, withDestination,
  withTransferEmployee,
} from './transferModel.js'

const BASE = ES_PATHS.transfer
const service = hrEmployeeServices.transfers
const loadLookups = (signal) => {
  // Opening the employee field lists employees without a request.
  warmEmployeeList(service, { signal })
  return service.getLookups({ signal })
}
const messageOf = ({ field, code }) => T.errors[field][code]

export default function TransferPage() {
  const user = useEmployeeServicesUser()
  return (
    <RecruitmentLoader current="transfer" flow={false} identify={NO_IDENTIFY} breadcrumb={C.breadcrumb}
      title={T.title} param="transferId" load={service.getById} loadLookups={loadLookups}>
      {({ lookups, record, editorKey }) => <TransferEditor key={editorKey} lookups={lookups} record={record} user={user} />}
    </RecruitmentLoader>
  )
}

function TransferEditor({ lookups, record, user }) {
  const navigate = useNavigate()
  const permissions = usePermissions()
  const editor = useRecruitmentForm({
    basePath: BASE, idKey: 'transferId', record,
    initialForm: record ? {
      requestDate: record.requestDate, companyCode: record.companyCode, employee: record.employee,
      to: { jobTitleCode: record.to.jobTitleCode ?? '', departmentCode: record.to.departmentCode ?? '', sectionCode: record.to.sectionCode ?? '' },
      effectiveDate: record.effectiveDate ?? '', bloodType: record.bloodType ?? '', directorId: record.directorId ?? '',
      salaryChange: record.salaryChange ?? '', budgetedSalary: record.budgetedSalary ?? '',
    } : { ...blankTransfer(businessToday(), lookups.companies[0]?.code ?? ''), employee: null },
  })
  const { form, set, patch, step, setStep } = editor
  const saved = editor.record
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const [employeeLoading, setEmployeeLoading] = useState(false)
  const employeeRequest = useRef(0)
  const employee = form.employee
  const canWrite = permissions.can(saved ? 'HR.TRANSFER_REQUESTS:UPDATE' : 'HR.TRANSFER_REQUESTS:CREATE')
  const locked = isTransferLocked(saved?.status) || !canWrite
  const moves = transferMoves(employee, form.to)
  const status = saved?.status ?? 'DRAFT'
  const today = businessToday()
  const days = form.effectiveDate ? daysBetween(today, form.effectiveDate) : null
  const requester = saved?.requestedBy ?? { name: user?.fullName ?? '', employeeNumber: user?.employeeNumber ?? '' }
  const doc = lookups.transferDocument
  const nameIn = (list, code) => list.find((item) => item.code === code)?.name ?? ''
  const departmentName = (code) => nameIn(lookups.departments, code)
  // The API exposes the organization section list globally, without mapping sections to
  // departments. Use the exact server values and dedupe them before showing the selector.
  const allSections = [...new Map([
    ...lookups.departments.map((item) => item.departmentSection).filter(Boolean),
    ...lookups.departments.flatMap((item) => item.sections ?? []),
  ].map((item) => [item.name.toLocaleLowerCase(), item])).values()]
  const sectionOptions = form.to.departmentCode ? sectionsOf(lookups.departments, form.to.departmentCode) : []
  const sectionName = (departmentCode, code) => nameIn(sectionsOf(lookups.departments, departmentCode), code) || nameIn(allSections, code)
  const jobName = (code) => nameIn(lookups.jobTitles, code)
  const director = lookups.directors.find((item) => item.directorId === form.directorId) ?? null
  const asOption = (item) => ({ employeeId: item.directorId, employeeNumber: item.directorId, name: item.name, position: item.area, section: T.detailsStep.directorRole })
  const asLookupOption = (item) => ({ employeeId: item.code, employeeNumber: '', name: item.name, position: '', section: '' })
  // Blood types are a fixed set of eight; the picker always lists them all (merged with
  // whatever the lookup returns) plus "Not recorded", so the reader can still submit when
  // the blood type is unknown.
  const STANDARD_BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
  const bloodTypeOptions = [
    ...STANDARD_BLOOD_TYPES.map((code) => ({ code, name: code })),
    ...(lookups.bloodTypes ?? []).filter((item) => !STANDARD_BLOOD_TYPES.includes(item.code)),
  ]
  const NOT_RECORDED = Object.freeze({ code: 'NOT_RECORDED', name: T.detailsStep.bloodUnknown })
  const bloodPickerOptions = [NOT_RECORDED, ...bloodTypeOptions]
  const selectedBloodType = bloodPickerOptions.find((item) => item.code === form.bloodType)
    ?? (form.bloodType ? { code: form.bloodType, name: form.bloodType } : null)
  const currentOf = { jobTitleCode: employee ? jobName(employee.jobTitleCode) : '', departmentCode: employee?.departmentName ?? '', sectionCode: employee?.sectionName ?? '' }
  const targetOf = { jobTitleCode: jobName(form.to.jobTitleCode), departmentCode: departmentName(form.to.departmentCode), sectionCode: sectionName(form.to.departmentCode, form.to.sectionCode) }

  // The pickers list each employee with job title and section; directors with their area.
  const searchEmployees = async (search, options) => {
    const page = await service.searchEmployees(search, options)
    return { ...page, items: page.items.map((item) => ({ ...item, position: jobName(item.jobTitleCode), section: item.sectionName })) }
  }
  const searchDirectors = async (search) => {
    const term = search.trim().toLocaleLowerCase()
    return { items: lookups.directors.filter((item) => `${item.directorId} ${item.name} ${item.area}`.toLocaleLowerCase().includes(term)).map(asOption) }
  }
  const searchLookup = (options) => async (search) => {
    const term = String(search ?? '').trim().toLocaleLowerCase()
    const items = term ? options.filter((item) => item.name.toLocaleLowerCase().includes(term)) : options
    return { items: items.map(asLookupOption) }
  }
  const searchBloodTypes = searchLookup(bloodPickerOptions)
  const pickDestination = (key, code) => {
    const department = key === 'departmentCode' ? lookups.departments.find((item) => item.code === code) : null
    const matchingSection = department?.departmentSection
      ?? (department && allSections.find((item) => item.name.trim().toLocaleLowerCase() === department.name.trim().toLocaleLowerCase()))
    patch((state) => ({ to: withDestination(state.to, key, code, matchingSection?.code ?? '') }))
    clear(key, 'to', ...(key === 'departmentCode' ? ['sectionCode'] : []))
  }

  const clear = (...keys) => setErrors((value) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key))))
  const setValue = (key) => (eventOrValue) => { set(key)(eventOrValue); clear(key) }
  // The picker lists names; the employee's snapshot (job title, section, blood type, joining
  // date) is fetched once for the picked employee and fills the move.
  const pickEmployee = async (person) => {
    const request = ++employeeRequest.current
    patch({ employee: person })
    clear('employee', 'to', 'effectiveDate')
    setEmployeeLoading(true)
    try {
      const details = await service.employee(person.name)
      if (request !== employeeRequest.current) return
      patch((state) => withTransferEmployee({ ...state, employee: details }, details))
    } catch {
      if (request !== employeeRequest.current) return
      setErrors((value) => ({ ...value, employee: T.errors.employeeLookup }))
    } finally {
      if (request === employeeRequest.current) setEmployeeLoading(false)
    }
  }

  const check = (submit) => {
    const problems = validateTransfer(form, employee, lookups.departments, { submit })
    setErrors(Object.fromEntries(problems.map((problem) => [problem.field, messageOf(problem)])))
    if (!problems.length) return true
    editor.reject(problems[0].step, problems.length === 1 ? messageOf(problems[0]) : C.reviewProblems(problems.length),
      problems.length === 1 ? [] : problems.map(messageOf))
    return false
  }
  // Continue checks the open step only; later steps stay locked until this one is done.
  const continueStep = () => {
    const problems = problemsInStep(validateTransfer(form, employee, lookups.departments, { submit: true }), step)
    setErrors(Object.fromEntries(problems.map((problem) => [problem.field, messageOf(problem)])))
    if (!problems.length) return true
    const messages = problems.map(messageOf)
    editor.reject(step, messages.length === 1 ? messages[0] : C.reviewProblems(messages.length))
    return false
  }
  const save = () => {
    if (locked) return
    if (!check(false)) return
    editor.perform(async ({ saved: keep }) => {
      const result = await service.save(editor.recordId, transferPayload(form, employee), employee)
      keep(result)
      return result
    }, { success: (result) => T.saved(result.transferNumber) })
  }
  const requestSubmit = () => {
    if (locked) return
    if (step !== 2) { setStep(2); return }
    if (check(true)) setDialog('submit')
  }
  const submit = () => {
    setDialog(null)
    editor.perform(async ({ saved: keep }) => {
      const result = await service.save(editor.recordId, transferPayload(form, employee), employee)
      keep(result)
      return result
    }, { success: (result) => T.saved(result.transferNumber) })
  }
  const leave = (path) => (editor.dirty && !locked ? setDialog({ path }) : navigate(path))

  const tools = [
    { icon: 'file-plus', label: T.tools.newTransfer, onClick: () => leave(BASE) },
    { icon: 'chart-column', label: T.tools.report, onClick: () => leave(ES_PATHS.transferReport) },
    { icon: 'save', label: C.save, onClick: save, disabled: locked || editor.pending },
    { icon: 'printer', label: C.print, onClick: () => window.print() },
    { icon: 'house', label: C.home, onClick: () => leave('/dashboard') },
  ]
  const doneSteps = [Boolean(employee && moves.length && form.to.sectionCode), Boolean(form.effectiveDate && form.directorId && form.salaryChange && form.budgetedSalary), locked]
  const lockedSteps = lockedStepsOf(doneSteps)
  const filled = [employee, form.to.departmentCode, form.to.sectionCode, form.to.jobTitleCode, form.effectiveDate, form.directorId, form.salaryChange, form.budgetedSalary].filter(Boolean).length
  const approvals = saved?.approvals ?? TRANSFER_ROUTE.map((role) => ({ role, state: 'DRAFT' }))
  const office = saved?.office ?? null
  const officeItems = office ?? Object.keys(T.office).map((role) => ({ role, state: 'WAITING', date: null }))
  const approvedApprovals = approvals.filter((item) => item.state === 'APPROVED').length
  const currentApprover = approvals.find((item) => item.state === 'PENDING')
  const approvalHeadline = status === 'DRAFT' ? T.approvalsStep.routeDraft
    : status === 'APPROVED' ? T.approvalsStep.routeApproved
      : status === 'REJECTED' ? T.approvalsStep.routeRejected : T.approvalsStep.routeActive
  const approvalDetail = status === 'DRAFT' ? T.approvalsStep.routeDraftDetail
    : status === 'APPROVED' ? T.approvalsStep.routeApprovedDetail
      : status === 'REJECTED' ? T.approvalsStep.routeRejectedDetail
        : currentApprover ? T.approvalsStep.routeCurrent(T.route[currentApprover.role])
          : T.approvalsStep.routeProgress(approvedApprovals, approvals.length)
  const yesNoLabel = (value) => value === 'YES' ? T.detailsStep.yes : value === 'NO' ? T.detailsStep.no : C.notSelected
  const overviewRows = [
    [T.ticket.date, form.requestDate ? enDate(form.requestDate) : C.notSelected],
    [T.approvalsStep.company, nameIn(lookups.companies, form.companyCode) || C.notSelected],
    [T.approvalsStep.effective, form.effectiveDate ? enDate(form.effectiveDate) : C.notSelected],
    [T.approvalsStep.director, director ? `${director.name} · ${director.directorId}` : C.notSelected],
    [T.detailsStep.bloodType, selectedBloodType?.name || C.notSelected],
    [T.detailsStep.salaryChange, yesNoLabel(form.salaryChange)],
    [T.detailsStep.budgetedSalary, yesNoLabel(form.budgetedSalary)],
  ]
  const yesNo = [{ value: 'YES', title: T.detailsStep.yes, icon: 'check' }, { value: 'NO', title: T.detailsStep.no, icon: 'x', tone: 'hold' }]
  // The salary note opens the Personnel Record Change form in a new tab with this
  // employee's number and name, so the record change auto-fills from the master.
  const recordChangeHref = employee?.employeeNumber
    ? `${ES_PATHS.recordChange}?employee=${encodeURIComponent(employee.employeeNumber)}&name=${encodeURIComponent(employee.name ?? '')}`
    : ES_PATHS.recordChange
  // All destination fields use the server's authoritative choices so invalid free text
  // cannot be submitted for a transfer section.

  return <>
    <RecruitmentShell current="transfer" flow={false} compact breadcrumb={C.breadcrumb} title={T.title}
      tools={tools} primary={{ label: T.saveDraft, icon: 'save', onClick: requestSubmit }}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss} locked={locked} pending={editor.pending} focusError={editor.focusError}
      ticket={<Ticket avatar={initials(requester.name)} code={doc.controlNumber} items={[
        { k: T.ticket.ref, v: saved?.transferNumber || T.ticket.onSave },
        { k: T.ticket.requestedBy, v: requester.name || '—', big: true },
        { k: T.ticket.employeeNumber, v: requester.employeeNumber || '—' },
        { k: T.ticket.date, v: enDate(form.requestDate) },
        { k: T.ticket.status, v: <Pill tone={status === 'DRAFT' ? 'warn' : 'ok'}>{C.status[status]}</Pill> },
      ]} />}
      steps={T.steps.map(([name], index) => [name, doneSteps[index] ? C.step.done : C.step.open])} step={step} onStep={setStep} doneSteps={doneSteps} lockedSteps={lockedSteps} onContinue={continueStep} finalLabel={T.saveDraft} onFinal={requestSubmit}
      side={<>
        <Tilt aria-label={T.card.label}>
          <div className="zrv-hr-dark__top"><span className="zrv-hr-mono">{saved?.transferNumber || T.card.draft}</span></div>
          <div className="zrv-hr-dark__who"><span className="zrv-hr-dark__av">{initials(employee?.name)}</span><div>
            <h3 className="zrv-hr-dark__title">{employee?.name || T.card.employee}</h3>
            <div className="zrv-hr-dark__sub">{employee ? T.card.joined(employee.employeeNumber, enDate(employee.startDate)) : T.card.employeeHint}</div></div></div>
          <div className="zrv-hr-es-move">
            <div><small>{T.card.from}</small><b>{employee?.departmentName || '—'}</b><span>{employee ? `${employee.sectionName} · ${currentOf.jobTitleCode}` : ''}</span></div>
            <span className="zrv-hr-es-move__arrow" aria-hidden="true"><i /><OrvexaIcon name="arrow-right" size={16} /></span>
            <div className={form.to.departmentCode ? 'zrv-hr-is-on' : undefined}><small>{T.card.to}</small><b>{targetOf.departmentCode || '—'}</b>
              <span>{[targetOf.sectionCode, targetOf.jobTitleCode].filter(Boolean).join(' · ')}</span></div>
          </div>
          <div className="zrv-hr-dark__badges">
            {moves.length ? moves.map((key) => <span key={key} className="zrv-hr-is-solid">{T.card.move[key]}</span>) : <span>{T.card.noMove}</span>}
            {form.salaryChange === 'YES' && <span>{T.card.salaryChange}</span>}
          </div>
          <div className="zrv-hr-dark__grid">
            <div><small>{T.card.effective}</small><b>{form.effectiveDate ? enDate(form.effectiveDate) : '—'}</b></div>
            <div><small>{T.card.starts}</small><b>{days === null ? '—' : days < 0 ? T.card.inPast : days === 0 ? T.card.today : T.card.inDays(days)}</b></div>
          </div>
        </Tilt>
        <Orbit done={filled} total={8} hint={doneSteps[0] && doneSteps[1] ? T.orbit.ready : !employee ? T.orbit.start : T.orbit.fill} />
      </>}
    >
      {step === 0 && <>
        <StepHead title={T.moveStep.title} />
        <div className="zrv-hr-grid zrv-hr-is-2">
          <EmployeePicker id="tr-employee" label={T.moveStep.employee} required tight value={employee} onPick={pickEmployee} error={errors.employee}
            loading={employeeLoading} loadingLabel="Loading employee details…"
            searchService={searchEmployees} cacheKey="hr-service-employees" />
          <HrField id="tr-company" label={T.moveStep.company}>
            <select id="tr-company" className="ux-select zrv-hr-input" value={form.companyCode} onChange={setValue('companyCode')}>
              {lookups.companies.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
          </HrField>
        </div>
        <div className="zrv-hr-es-compare zrv-hr-mt">
          <div className="zrv-hr-es-col">
            <span className="zrv-hr-es-col__h">{T.moveStep.current}</span>
            {[[T.moveStep.rows.employeeNumber, employee?.employeeNumber], [T.moveStep.rows.joined, employee ? enDate(employee.startDate) : ''],
              [T.moveStep.rows.jobTitle, currentOf.jobTitleCode], [T.moveStep.rows.department, currentOf.departmentCode], [T.moveStep.rows.section, currentOf.sectionCode]].map(([label, value]) => (
              <div key={label} className="zrv-hr-es-ro"><small>{label}</small><b>{value || '—'}</b></div>
            ))}
          </div>
          <div className="zrv-hr-es-col zrv-hr-is-to">
            <span className="zrv-hr-es-col__h">{T.moveStep.transferTo}</span>
            <HrField id="tr-jobTitleCode" label={T.moveStep.jobTitle} required error={errors.jobTitleCode}
              hint={!lookups.jobTitles.length ? 'No job titles are available.' : undefined}>
              <SearchableLookup id="tr-jobTitleCode" value={form.to.jobTitleCode} options={lookups.jobTitles}
                onChange={(option) => pickDestination('jobTitleCode', option.code)} disabled={!lookups.jobTitles.length}
                placeholder={lookups.jobTitles.length ? T.moveStep.suggestJob : 'No job titles available'} required error={errors.jobTitleCode}
                noResults="No matching job titles" />
            </HrField>
            <HrField id="tr-departmentCode" label={T.moveStep.department} required error={errors.departmentCode}
              hint={!lookups.departments.length ? 'No departments are available.' : undefined}>
              <SearchableLookup id="tr-departmentCode" value={form.to.departmentCode} options={lookups.departments}
                onChange={(option) => pickDestination('departmentCode', option.code)} disabled={!lookups.departments.length}
                placeholder={lookups.departments.length ? T.moveStep.suggestDepartment : 'No departments available'} required error={errors.departmentCode}
                noResults="No matching departments" />
            </HrField>
            <HrField id="tr-sectionCode" label={T.moveStep.section} required error={errors.sectionCode}
              hint={!form.to.departmentCode ? 'Select a department to fill its section automatically.' : !sectionOptions.length ? 'No sections are available.' : undefined}>
              <SearchableLookup id="tr-sectionCode" value={form.to.sectionCode} options={sectionOptions}
                onChange={(option) => pickDestination('sectionCode', option.code)} disabled={!form.to.departmentCode || !sectionOptions.length}
                placeholder={!form.to.departmentCode ? 'Choose a department first' : sectionOptions.length ? T.moveStep.suggestSection : 'No sections available'} required error={errors.sectionCode}
                noResults="No matching sections" />
            </HrField>
          </div>
        </div>
        {errors.to && <p className="zrv-auth-field-error" role="alert">{errors.to}</p>}
        {moves.length > 0 && (
          <ul className="zrv-hr-es-changes zrv-hr-mt">
            {moves.map((key) => <li key={key}><b>{T.card.move[key]}</b><span className="zrv-hr-es-old">{currentOf[key]}</span><OrvexaIcon name="arrow-right" size={14} aria-hidden="true" /><span className="zrv-hr-es-new">{targetOf[key]}</span></li>)}
          </ul>
        )}
      </>}

      {step === 1 && <>
        <StepHead title={T.detailsStep.title} />
        <div className="zrv-hr-grid zrv-hr-is-3">
          <HrField id="tr-effective" label={T.detailsStep.effective} required error={errors.effectiveDate}
            hint={days !== null && days >= 0 ? (days === 0 ? T.card.today : T.card.inDays(days)) : undefined}>
            <input {...fieldProps('tr-effective', { error: errors.effectiveDate, hint: days !== null && days >= 0 ? 'days' : undefined })} type="date"
              className="ux-input zrv-hr-input" aria-required="true" min={employee?.startDate} value={form.effectiveDate} onChange={setValue('effectiveDate')} />
          </HrField>
          <EmployeePicker id="tr-director" label={T.detailsStep.director} required tight value={director ? asOption(director) : null}
            onPick={(item) => { setValue('directorId')(item.employeeId) }} error={errors.directorId} searchService={searchDirectors} cacheKey="hr-service-directors" />
          <HrField id="tr-director-id" label={T.detailsStep.directorId}>
            <input id="tr-director-id" className="ux-input zrv-hr-input" readOnly value={director?.directorId ?? ''} placeholder={T.detailsStep.directorIdPlaceholder} />
          </HrField>
          {/* Same searchable picker UI as job title and department: opening the field
              lists every blood type, typing narrows it, picking sets the value. */}
          <EmployeePicker id="tr-blood" label={T.detailsStep.bloodType} required tight placeholder={T.detailsStep.bloodSearch}
            value={selectedBloodType ? asLookupOption(selectedBloodType) : null} onPick={(item) => { setValue('bloodType')(item.employeeId) }} error={errors.bloodType}
            searchService={searchBloodTypes} cacheKey="hr-service-blood-types" />
        </div>
        <div className="zrv-hr-grid zrv-hr-is-2 zrv-hr-mt">
          <RadioCards name="tr-salary-change" label={T.detailsStep.salaryChange} options={yesNo} value={form.salaryChange} onChange={setValue('salaryChange')} error={errors.salaryChange} />
          <RadioCards name="tr-budgeted" label={T.detailsStep.budgetedSalary} options={yesNo} value={form.budgetedSalary} onChange={setValue('budgetedSalary')} error={errors.budgetedSalary} />
        </div>
        {form.salaryChange === 'YES' && (
          <p className="zrv-hr-note">{T.detailsStep.salaryNote} <a className="zrv-hr-link" href={recordChangeHref} target="_blank" rel="noopener noreferrer">{T.detailsStep.salaryLink}</a></p>
        )}
      </>}

      {step === 2 && <>
        <StepHead title={T.approvalsStep.title} desc={T.approvalsStep.desc} />
        <section className="zrv-hr-transfer-overview" aria-labelledby="tr-overview-title">
          <header className="zrv-hr-transfer-overview__head">
            <div>
              <span>{T.approvalsStep.overview}</span>
              <h3 id="tr-overview-title">{employee?.name || C.notSelected}</h3>
              <small>{employee?.employeeNumber ? `${T.moveStep.rows.employeeNumber} · ${employee.employeeNumber}` : T.approvalsStep.employee}</small>
            </div>
            <Pill tone={status === 'APPROVED' ? 'ok' : status === 'REJECTED' ? 'hold' : 'warn'}>{C.status[status] || status}</Pill>
          </header>
          <div className="zrv-hr-transfer-overview__assignments">
            <div className="zrv-hr-transfer-overview__assignment">
              <span>{T.approvalsStep.currentAssignment}</span>
              <dl>
                <div><dt>{T.moveStep.jobTitle}</dt><dd>{currentOf.jobTitleCode || C.notSelected}</dd></div>
                <div><dt>{T.moveStep.department}</dt><dd>{currentOf.departmentCode || C.notSelected}</dd></div>
                <div><dt>{T.moveStep.section}</dt><dd>{currentOf.sectionCode || C.notSelected}</dd></div>
              </dl>
            </div>
            <span className="zrv-hr-transfer-overview__arrow" aria-hidden="true"><OrvexaIcon name="arrow-right" size={20} /></span>
            <div className="zrv-hr-transfer-overview__assignment zrv-hr-is-proposed">
              <span>{T.approvalsStep.proposedAssignment}</span>
              <dl>
                <div><dt>{T.moveStep.jobTitle}</dt><dd>{targetOf.jobTitleCode || C.notSelected}</dd></div>
                <div><dt>{T.moveStep.department}</dt><dd>{targetOf.departmentCode || C.notSelected}</dd></div>
                <div><dt>{T.moveStep.section}</dt><dd>{targetOf.sectionCode || C.notSelected}</dd></div>
              </dl>
            </div>
          </div>
          <dl className="zrv-hr-transfer-overview__details">
            {overviewRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        </section>

        <section className="zrv-hr-transfer-approval" aria-labelledby="tr-approval-title">
          <header className="zrv-hr-transfer-approval__head">
            <div><span>{T.approvalsStep.route}</span><h3 id="tr-approval-title">{approvalHeadline}</h3><p>{approvalDetail}</p></div>
            <Pill tone={status === 'APPROVED' ? 'ok' : status === 'REJECTED' ? 'hold' : 'warn'}>{C.status[status] || status}</Pill>
          </header>
          <ol className="zrv-hr-transfer-flow" aria-label={T.approvalsStep.route}>
            {approvals.map((item, index) => (
              <li key={item.role} className={`zrv-hr-is-${item.state.toLowerCase()}`} style={{ '--i': index }} aria-current={item.state === 'PENDING' ? 'step' : undefined}>
                <div className="zrv-hr-transfer-flow__track" aria-hidden="true">
                  <span className="zrv-hr-transfer-flow__node">{item.state === 'APPROVED' ? <OrvexaIcon name="check" size={15} /> : index + 1}</span>
                  {index < approvals.length - 1 && <span className={`zrv-hr-transfer-flow__connector${item.state === 'APPROVED' ? ' zrv-hr-is-complete' : ''}`} />}
                </div>
                <article className="zrv-hr-transfer-flow__card">
                  <div><small>{T.approvalsStep.approverStep(index + 1, approvals.length)}</small><span className="zrv-hr-transfer-flow__state">{T.approvalsStep.state[item.state] || item.state}</span></div>
                  <h4>{T.route[item.role] || item.role}</h4>
                  <p>{T.approvalsStep.stateDetail[item.state] || ''}</p>
                </article>
              </li>
            ))}
          </ol>
        </section>

        <section className="zrv-hr-transfer-office" aria-labelledby="tr-office-title">
          <header>
            <div><h3 id="tr-office-title">{T.approvalsStep.office}</h3><p>{T.approvalsStep.officeDesc}</p></div>
            <span>{officeItems.filter((item) => item.state === 'APPROVED').length} / {officeItems.length} complete</span>
          </header>
          <div className="zrv-hr-transfer-office__grid">
            {officeItems.map((item) => (
              <article key={item.role} className={`zrv-hr-transfer-office__item${item.state === 'APPROVED' ? ' zrv-hr-is-complete' : ''}`}>
                <span className="zrv-hr-transfer-office__icon"><OrvexaIcon name={item.state === 'APPROVED' ? 'check' : 'clock-3'} size={16} /></span>
                <div><h4>{T.office[item.role] || item.role}</h4>
                  <span>{item.state === 'APPROVED' ? (item.date ? T.approvalsStep.officeDone(enDate(item.date)) : C.approval.APPROVED) : T.approvalsStep.officeWaiting}</span></div>
              </article>
            ))}
          </div>
        </section>
      </>}
    </RecruitmentShell>
    {dialog === 'submit' && (
      <ConfirmDialog title={T.confirm.saveTitle} confirmLabel={T.saveDraft} pending={editor.pending} onClose={() => setDialog(null)} onConfirm={submit}
        description={T.confirm.draftBody(employee.name, employee.departmentName, targetOf.departmentCode, targetOf.sectionCode, enDate(form.effectiveDate))} />
    )}
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}
