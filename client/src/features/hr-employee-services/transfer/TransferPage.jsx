import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { ConfirmDialog } from '@/features/security-administration/components/AdminUi.jsx'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { businessToday, daysBetween, enDate, initials } from '@/features/hr-recruitment/shared/hrFormat.js'
import { useRecruitmentForm } from '@/features/hr-recruitment/shared/useRecruitmentForm.js'
import { RecruitmentLoader } from '@/features/hr-recruitment/shared/components/RecruitmentLoader.jsx'
import { NewFormDialog } from '@/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx'
import { Orbit, PanelHead, Pill, RecruitmentShell, Ticket, Tilt } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { HrField, RadioCards, Review } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
import { EmployeePicker } from '@/features/hr-recruitment/shared/components/EmployeePicker.jsx'
import { ES_COMMON_TEXT as C, TRANSFER_TEXT as T } from '../hrEmployeeServicesText.js'
import { hrEmployeeServices } from '../hrEmployeeServicesService.js'
import { ES_PATHS } from '../employeeServicesPaths.js'
import { NO_IDENTIFY, useEmployeeServicesUser } from '../shared/useEmployeeServicesUser.js'
import '@/styles/hr-employee-services.css'
import {
  TRANSFER_ROUTE, blankTransfer, isTransferLocked, sectionsOf, transferMoves, transferPayload, validateTransfer, withDestination,
  withTransferEmployee,
} from './transferModel.js'

const BASE = ES_PATHS.transfer
const service = hrEmployeeServices.transfers
const loadLookups = (signal) => service.getLookups({ signal })
const messageOf = ({ field, code }) => T.errors[field][code]

export default function TransferPage() {
  const user = useEmployeeServicesUser()
  return (
    <RecruitmentLoader current="transfer" flow={false} identify={NO_IDENTIFY} breadcrumb={C.breadcrumb}
      title={T.title} subtitle={T.subtitle} param="transferId" load={service.getById} loadLookups={loadLookups}>
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
  const sectionName = (departmentCode, code) => nameIn(sectionsOf(lookups.departments, departmentCode), code)
  const jobName = (code) => nameIn(lookups.jobTitles, code)
  const director = lookups.directors.find((item) => item.directorId === form.directorId) ?? null
  const asOption = (item) => ({ employeeId: item.directorId, employeeNumber: item.directorId, name: item.name, position: item.area, section: T.detailsStep.directorRole })
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

  const clear = (...keys) => setErrors((value) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key))))
  const setValue = (key) => (eventOrValue) => { set(key)(eventOrValue); clear(key) }
  const setTo = (key) => (event) => { patch((state) => ({ to: withDestination(state.to, key, event.target.value) })); clear(key, 'to', ...(key === 'departmentCode' ? ['sectionCode'] : [])) }
  const pickEmployee = (person) => { patch((state) => withTransferEmployee({ ...state, employee: person }, person)); clear('employee', 'to', 'effectiveDate') }

  const check = (submit) => {
    const problems = validateTransfer(form, employee, lookups.departments, { submit })
    setErrors(Object.fromEntries(problems.map((problem) => [problem.field, messageOf(problem)])))
    if (!problems.length) return true
    editor.reject(problems[0].step, problems.length === 1 ? messageOf(problems[0]) : C.reviewProblems(problems.length),
      problems.length === 1 ? [] : problems.map(messageOf))
    return false
  }
  const save = () => {
    if (locked || !check(false)) return
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
  const filled = [employee, form.to.departmentCode, form.to.sectionCode, form.to.jobTitleCode, form.effectiveDate, form.directorId, form.salaryChange, form.budgetedSalary].filter(Boolean).length
  const approvals = saved?.approvals ?? TRANSFER_ROUTE.map((role) => ({ role, state: 'DRAFT' }))
  const office = saved?.office ?? null
  const yesNo = [{ value: 'YES', title: T.detailsStep.yes, icon: 'check' }, { value: 'NO', title: T.detailsStep.no, icon: 'x', tone: 'hold' }]
  const select = (key, label, options, placeholder, disabled = false) => (
    <HrField id={`tr-${key}`} label={label} required error={errors[key]}>
      <select {...fieldProps(`tr-${key}`, { error: errors[key] })} className="ux-select zrv-hr-input" aria-required="true" disabled={disabled}
        value={form.to[key]} onChange={setTo(key)}>
        <option value="">{placeholder}</option>
        {options.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
      </select>
    </HrField>
  )

  return <>
    <RecruitmentShell current="transfer" flow={false} compact breadcrumb={C.breadcrumb} title={T.title} subtitle={T.subtitle}
      tools={tools} primary={{ label: T.saveDraft, icon: 'save', onClick: requestSubmit }}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss} locked={locked} pending={editor.pending} focusError={editor.focusError}
      ticket={<Ticket avatar={initials(requester.name)} code={doc.controlNumber} items={[
        { k: T.ticket.ref, v: saved?.transferNumber || T.ticket.onSave },
        { k: T.ticket.requestedBy, v: requester.name || '—', big: true },
        { k: T.ticket.employeeNumber, v: requester.employeeNumber || '—' },
        { k: T.ticket.date, v: enDate(form.requestDate) },
        { k: T.ticket.status, v: <Pill tone={status === 'DRAFT' ? 'warn' : 'ok'}>{C.status[status]}</Pill> },
      ]} />}
      banner={(
        <dl className="zrv-hr-es-docstrip" aria-label={T.document.label}>
          <div className="zrv-hr-es-docstrip__title"><dt className="zrv-hr-sr">{T.document.label}</dt><dd>{doc.title}</dd></div>
          <div><dt>{T.document.control}</dt><dd className="zrv-hr-mono">{doc.controlNumber}</dd></div>
          {doc.version && <div><dt>{T.document.version}</dt><dd>{doc.version}</dd></div>}
          {doc.issueDate && <div><dt>{T.document.issued}</dt><dd>{enDate(doc.issueDate)}</dd></div>}
          {doc.pages && <div><dt>{T.document.pages}</dt><dd>{doc.pages}</dd></div>}
          <div><dt>{T.document.company}</dt><dd>{nameIn(lookups.companies, form.companyCode) || '—'}</dd></div>
        </dl>
      )}
      steps={T.steps} step={step} onStep={setStep} doneSteps={doneSteps} finalLabel={T.saveDraft} onFinal={requestSubmit}
      side={<>
        <Tilt aria-label={T.card.label}>
          <div className="zrv-hr-dark__top"><span className="zrv-hr-eyebrow">{T.card.label}</span><span className="zrv-hr-mono">{saved?.transferNumber || T.card.draft}</span></div>
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
        <PanelHead n={1} eyebrow={T.moveStep.eyebrow} title={T.moveStep.title} />
        <div className="zrv-hr-grid zrv-hr-is-2">
          <EmployeePicker id="tr-employee" label={T.moveStep.employee} required tight value={employee} onPick={pickEmployee} error={errors.employee}
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
            {select('jobTitleCode', T.moveStep.jobTitle, lookups.jobTitles.map((item) => ({ code: item.code, label: item.name })), T.moveStep.chooseJob)}
            {select('departmentCode', T.moveStep.department, lookups.departments.map((item) => ({
              code: item.code, label: employee && item.code === employee.departmentCode ? T.moveStep.currentMark(item.name) : item.name,
            })), T.moveStep.chooseDepartment)}
            {select('sectionCode', T.moveStep.section, sectionsOf(lookups.departments, form.to.departmentCode).map((item) => ({ code: item.code, label: item.name })),
              form.to.departmentCode ? T.moveStep.chooseSection : T.moveStep.departmentFirst, !form.to.departmentCode)}
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
        <PanelHead n={2} eyebrow={T.detailsStep.eyebrow} title={T.detailsStep.title} />
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
          <HrField id="tr-blood" label={T.detailsStep.bloodType} required error={errors.bloodType} hint={employee?.bloodType ? T.detailsStep.bloodFromRecord : undefined}>
            <select {...fieldProps('tr-blood', { error: errors.bloodType, hint: employee?.bloodType ? 'record' : undefined })} className="ux-select zrv-hr-input" aria-required="true" value={form.bloodType} onChange={setValue('bloodType')}>
              <option value="">{T.detailsStep.bloodUnknown}</option>
              {lookups.bloodTypes.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
          </HrField>
        </div>
        <div className="zrv-hr-grid zrv-hr-is-2 zrv-hr-mt">
          <RadioCards name="tr-salary-change" label={T.detailsStep.salaryChange} options={yesNo} value={form.salaryChange} onChange={setValue('salaryChange')} error={errors.salaryChange} />
          <RadioCards name="tr-budgeted" label={T.detailsStep.budgetedSalary} options={yesNo} value={form.budgetedSalary} onChange={setValue('budgetedSalary')} error={errors.budgetedSalary} />
        </div>
        {form.salaryChange === 'YES' && (
          <p className="zrv-hr-note">{T.detailsStep.salaryNote} <Link to={ES_PATHS.recordChange}>{T.detailsStep.salaryLink}</Link></p>
        )}
      </>}

      {step === 2 && <>
        <PanelHead n={3} eyebrow={T.approvalsStep.eyebrow} title={T.approvalsStep.title} desc={T.approvalsStep.desc} />
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
