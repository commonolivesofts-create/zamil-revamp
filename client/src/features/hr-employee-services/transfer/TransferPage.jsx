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
import { HrField, RadioCards, Review } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
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
  // What the user typed in a "Transfer to" field, so a name that is still being typed is not
  // replaced by the chosen option's name.
  const [typedTo, setTypedTo] = useState({})
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
  // The legacy form's section field is a text input whose suggestions list every section
  // in the master (a global list, not per-department), so typing a section does not need
  // the department to be chosen first; a name in the chosen department wins.
  const allSections = [...new Map(lookups.departments.flatMap((item) => item.sections ?? []).map((item) => [item.name.toLocaleLowerCase(), item])).values()]
  const sectionName = (departmentCode, code) => nameIn(sectionsOf(lookups.departments, departmentCode), code) || nameIn(allSections, code)
  const jobName = (code) => nameIn(lookups.jobTitles, code)
  const director = lookups.directors.find((item) => item.directorId === form.directorId) ?? null
  const asOption = (item) => ({ employeeId: item.directorId, employeeNumber: item.directorId, name: item.name, position: item.area, section: T.detailsStep.directorRole })
  const asLookupOption = (item) => ({ employeeId: item.code, employeeNumber: '', name: item.name, position: '', section: '' })
  const selectedJobTitle = lookups.jobTitles.find((item) => item.code === form.to.jobTitleCode) ?? null
  const selectedDepartment = lookups.departments.find((item) => item.code === form.to.departmentCode) ?? null
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
  const targetOf = { jobTitleCode: jobName(form.to.jobTitleCode) || (typedTo.jobTitleCode ?? ''), departmentCode: departmentName(form.to.departmentCode) || (typedTo.departmentCode ?? ''), sectionCode: sectionName(form.to.departmentCode, form.to.sectionCode) || (typedTo.sectionCode ?? '') }
  // Master lists and typing differ in case and spacing, so names are compared loosely.
  const normalizeName = (value) => String(value ?? '').toLocaleLowerCase().replace(/[_\s]+/g, ' ').trim()
  const candidatesOf = (key, departmentCode = form.to.departmentCode) => (key === 'departmentCode' ? [lookups.departments, []]
    : key === 'jobTitleCode' ? [lookups.jobTitles, []] : [allSections, sectionsOf(lookups.departments, departmentCode)])
  const matchOf = (key, text, departmentCode) => {
    const wanted = normalizeName(text)
    const [options, prefer] = candidatesOf(key, departmentCode)
    if (!wanted) return null
    return [...prefer, ...options].find((item) => normalizeName(item.name) === wanted) ?? null
  }
  const textOf = (key, options) => typedTo[key] ?? nameIn(options, form.to[key])
  // The form stores codes; what the reader typed is settled into codes when they continue or
  // save, so a name typed in full works even if no keystroke landed on the last character.
  // Section keeps free text that is not in the master list, as the legacy input allowed.
  const resolveTo = () => {
    const departmentCode = typedTo.departmentCode == null ? form.to.departmentCode : matchOf('departmentCode', typedTo.departmentCode)?.code ?? ''
    const codeOf = (key) => {
      if (typedTo[key] == null) return form.to[key]
      const matched = matchOf(key, typedTo[key], departmentCode)?.code
      if (matched) return matched
      // Section is a free-text input like the legacy form: what the reader typed is the
      // value even when it is not in the master list (the server checks it on save).
      return key === 'sectionCode' ? String(typedTo[key]).trim() : ''
    }
    // A section typed before the department still has to belong to the department that ends up chosen.
    return { jobTitleCode: codeOf('jobTitleCode'), departmentCode, sectionCode: codeOf('sectionCode') }
  }
  const settleTo = () => {
    const to = resolveTo()
    if (['jobTitleCode', 'departmentCode', 'sectionCode'].some((key) => to[key] !== form.to[key])) patch({ to })
    setTypedTo((value) => Object.fromEntries(Object.entries(value).map(([key, text]) => [key, matchOf(key, text, to.departmentCode)?.name ?? text])))
    return to
  }

  // The pickers list each employee with job title and section; directors with their area.
  const searchEmployees = async (search, options) => {
    const page = await service.searchEmployees(search, options)
    return { ...page, items: page.items.map((item) => ({ ...item, position: jobName(item.jobTitleCode), section: item.sectionName })) }
  }
  const searchDirectors = async (search) => {
    const term = search.trim().toLocaleLowerCase()
    return { items: lookups.directors.filter((item) => `${item.directorId} ${item.name} ${item.area}`.toLocaleLowerCase().includes(term)).map(asOption) }
  }
  // Job title and department use the same searchable picker UI as the employee name:
  // opening the field lists every option, typing narrows it, picking sets the code.
  const searchLookup = (options) => async (search) => {
    const term = String(search ?? '').trim().toLocaleLowerCase()
    const items = term ? options.filter((item) => item.name.toLocaleLowerCase().includes(term)) : options
    return { items: items.map(asLookupOption) }
  }
  const searchJobTitles = searchLookup(lookups.jobTitles)
  const searchDepartments = searchLookup(lookups.departments)
  const searchBloodTypes = searchLookup(bloodPickerOptions)
  const pickDestination = (key) => (option) => {
    patch((state) => ({ to: withDestination(state.to, key, option.employeeId) }))
    if (key === 'departmentCode') setTypedTo((value) => ({ ...value, sectionCode: null }))
    clear(key, 'to', ...(key === 'departmentCode' ? ['sectionCode'] : []))
  }

  const clear = (...keys) => setErrors((value) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key))))
  const setValue = (key) => (eventOrValue) => { set(key)(eventOrValue); clear(key) }
  // What the reader types sets the code the request stores, matched loosely on the name; other
  // text leaves the code unset, so the check asks for a name from the list.
  const typeTo = (key) => (text) => {
    patch((state) => ({ to: withDestination(state.to, key, matchOf(key, text)?.code ?? '') }))
    setTypedTo((value) => ({ ...value, [key]: text, ...(key === 'departmentCode' ? { sectionCode: null } : {}) }))
    clear(key, 'to', ...(key === 'departmentCode' ? ['sectionCode'] : []))
  }
  // The picker lists names; the employee's snapshot (job title, section, blood type, joining
  // date) is fetched once for the picked employee and fills the move.
  const pickEmployee = async (person) => {
    const request = ++employeeRequest.current
    setTypedTo({})
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
    const problems = validateTransfer({ ...form, to: settleTo() }, employee, lookups.departments, { submit })
    setErrors(Object.fromEntries(problems.map((problem) => [problem.field, messageOf(problem)])))
    if (!problems.length) return true
    editor.reject(problems[0].step, problems.length === 1 ? messageOf(problems[0]) : C.reviewProblems(problems.length),
      problems.length === 1 ? [] : problems.map(messageOf))
    return false
  }
  // Continue checks the open step only; later steps stay locked until this one is done.
  const continueStep = () => {
    const problems = problemsInStep(validateTransfer({ ...form, to: settleTo() }, employee, lookups.departments, { submit: true }), step)
    setErrors(Object.fromEntries(problems.map((problem) => [problem.field, messageOf(problem)])))
    if (!problems.length) return true
    const messages = problems.map(messageOf)
    editor.reject(step, messages.length === 1 ? messages[0] : C.reviewProblems(messages.length))
    return false
  }
  const save = () => {
    if (locked) return
    const to = settleTo()
    if (!check(false)) return
    editor.perform(async ({ saved: keep }) => {
      const result = await service.save(editor.recordId, transferPayload({ ...form, to }, employee), employee)
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
    const to = resolveTo()
    editor.perform(async ({ saved: keep }) => {
      const result = await service.save(editor.recordId, transferPayload({ ...form, to }, employee), employee)
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
  const yesNo = [{ value: 'YES', title: T.detailsStep.yes, icon: 'check' }, { value: 'NO', title: T.detailsStep.no, icon: 'x', tone: 'hold' }]
  // The salary note opens the Personnel Record Change form in a new tab with this
  // employee's number and name, so the record change auto-fills from the master.
  const recordChangeHref = employee?.employeeNumber
    ? `${ES_PATHS.recordChange}?employee=${encodeURIComponent(employee.employeeNumber)}&name=${encodeURIComponent(employee.name ?? '')}`
    : ES_PATHS.recordChange
  // Job title and department are searchable pickers like the employee name (search as you
  // type, pick to set the code). Section stays a free-text input with suggestions, as in
  // the old CI3 form, so the reader can type anything into it.
  const suggest = (key, label, options, placeholder) => (
    <HrField id={`tr-${key}`} label={label} required error={errors[key]}>
      <input id={`tr-${key}`} name={`tr-${key}`} type="text" list={`tr-${key}-suggestions`} className="ux-input zrv-hr-input"
        autoComplete="off" aria-required="true" aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `tr-${key}-error` : undefined}
        placeholder={placeholder} value={textOf(key, options)}
        onChange={(event) => typeTo(key)(event.target.value)} />
      <datalist id={`tr-${key}-suggestions`}>
        {options.map((item) => <option key={item.code} value={item.name} />)}
      </datalist>
    </HrField>
  )

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
            searchService={searchEmployees} cacheKey="hr-service-employees" />
          <HrField id="tr-company" label={T.moveStep.company}>
            <select id="tr-company" className="ux-select zrv-hr-input" value={form.companyCode} onChange={setValue('companyCode')}>
              {lookups.companies.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
          </HrField>
        </div>
        {employeeLoading && <p className="zrv-admin-hint" role="status">{T.moveStep.loading}</p>}
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
            <EmployeePicker id="tr-jobTitleCode" label={T.moveStep.jobTitle} required tight placeholder={T.moveStep.suggestJob}
              value={selectedJobTitle ? asLookupOption(selectedJobTitle) : null} onPick={pickDestination('jobTitleCode')} error={errors.jobTitleCode}
              searchService={searchJobTitles} cacheKey="hr-service-job-titles" />
            <EmployeePicker id="tr-departmentCode" label={T.moveStep.department} required tight placeholder={T.moveStep.suggestDepartment}
              value={selectedDepartment ? asLookupOption(selectedDepartment) : null} onPick={pickDestination('departmentCode')} error={errors.departmentCode}
              searchService={searchDepartments} cacheKey="hr-service-departments" />
            {suggest('sectionCode', T.moveStep.section, allSections, T.moveStep.suggestSection)}
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
        <ol className="zrv-hr-es-chain">
          {approvals.map((item, index) => (
            <li key={item.role} className={`zrv-hr-is-${item.state.toLowerCase()}`} style={{ '--i': index }}>
              <span className="zrv-hr-es-chain__n">{item.state === 'APPROVED' ? <OrvexaIcon name="check" size={14} /> : index + 1}</span>
              <b>{T.route[item.role]}</b><em>{item.state === 'DRAFT' ? T.approvalsStep.draft : C.approval[item.state]}</em>
            </li>
          ))}
        </ol>
        <h3 className="zrv-hr-subh">{T.approvalsStep.office}</h3>
        <div className="zrv-hr-es-office">
          {(office ?? Object.keys(T.office).map((role) => ({ role, state: 'WAITING', date: null }))).map((item) => (
            <div key={item.role}><OrvexaIcon name="lock" size={15} /><b>{T.office[item.role]}</b>
              <span>{item.state === 'APPROVED' && item.date ? T.approvalsStep.officeDone(enDate(item.date)) : T.approvalsStep.officeWaiting}</span></div>
          ))}
        </div>
        <div className="zrv-hr-sep" />
        <Review rows={[
          [T.approvalsStep.employee, employee ? `${employee.name} · #${employee.employeeNumber}` : '', !employee],
          [T.approvalsStep.move, moves.map((key) => `${T.card.move[key]}: ${targetOf[key]}`).join(' · '), !moves.length],
          [T.approvalsStep.effective, form.effectiveDate ? enDate(form.effectiveDate) : '', !form.effectiveDate],
          [T.approvalsStep.director, director ? `${director.name} · ${director.directorId}` : '', !director],
          [T.approvalsStep.salary, T.approvalsStep.salaryText(form.salaryChange, form.budgetedSalary), !form.salaryChange || !form.budgetedSalary],
          [T.approvalsStep.company, nameIn(lookups.companies, form.companyCode), false],
        ]} />
      </>}
    </RecruitmentShell>
    {dialog === 'submit' && (
      <ConfirmDialog title={T.confirm.saveTitle} confirmLabel={T.saveDraft} pending={editor.pending} onClose={() => setDialog(null)} onConfirm={submit}
        description={T.confirm.draftBody(employee.name, employee.departmentName, targetOf.departmentCode, targetOf.sectionCode, enDate(form.effectiveDate))} />
    )}
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}
