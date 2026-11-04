import { useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import usePermissions from '@/features/access/usePermissions.js'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { enDate, initials } from '@/features/hr-recruitment/shared/hrFormat.js'
import { useSettled } from '@/features/hr-recruitment/shared/useSettled.js'
import { useRecruitmentForm } from '@/features/hr-recruitment/shared/useRecruitmentForm.js'
import { NewFormDialog } from '@/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx'
import { RecruitmentLoader } from '@/features/hr-recruitment/shared/components/RecruitmentLoader.jsx'
import { HrField } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
import { EmployeePicker } from '@/features/hr-recruitment/shared/components/EmployeePicker.jsx'
import { Orbit, RecruitmentShell, StepHead, Tilt } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { CLEARANCE_PATHS } from '../employeeServicesPaths.js'
import { STATUS_TEXT, isEditable } from '../shared/formRecords.js'
import { NO_IDENTIFY } from '../shared/useEmployeeServicesUser.js'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'
import '@/styles/hr-employee-clearance.css'
import {
  COMMENTS_MAX, CONTACT_MAX, DISABLED_UNTIL, IT_ACTIONS, IT_SUBJECTS, PURPOSE_MAX, SECTIONS, SIGNATURES, blankClearance, hasCost,
  returnedCount, sectionApprovers, validateClearance, withItAction,
} from './clearanceModel.js'
import { clearanceService } from './clearanceService.js'

// The legacy form: views/ZPIL/empclearance.php creates a request,
// views/update/empClearance.php edits it (form 1063, workflow EMCF).
const TITLE = 'Employee Clearance'
const STEPS = ['Employee', 'IT access', 'Sign-off', 'Departments']
const SAVE = 'Save clearance'
const PERMISSION = 'HR.EMPLOYEE_CLEARANCE'
const loadLookups = (signal) => clearanceService.getLookups({ signal })

export default function ClearancePage() {
  return (
    <RecruitmentLoader current="clearance" flow={false} identify={NO_IDENTIFY} breadcrumb={C.breadcrumb}
      title={TITLE} param="clearanceId" load={clearanceService.getById} loadLookups={loadLookups}>
      {({ lookups, record, editorKey }) => <ClearanceEditor key={editorKey} lookups={lookups} initial={record} />}
    </RecruitmentLoader>
  )
}

// A saved request as form answers. A stored receiver that is no longer offered
// (legacy free text, or out of the user's scope) must be chosen again.
function formOf(record, destinations) {
  return {
    employee: record.employee, contact: record.contact, purpose: record.purpose, vacationFrom: record.vacationFrom, vacationTo: record.vacationTo,
    departmentManager: { ...record.departmentManager }, itManager: { ...record.itManager },
    computerReceivedBy: destinations.some((item) => item.value === record.computerReceivedBy) ? record.computerReceivedBy : '',
    computerSignature: record.computerSignature,
    itMatrix: record.itMatrix.map((row) => ({ ...row })),
    sections: Object.fromEntries(SECTIONS.map((section) => [section.key, { ...record.sections[section.key], items: [...record.sections[section.key].items] }])),
  }
}

// "Access to": a date for Disabled Untill, otherwise a person's name with
// suggestions from the employee list (free text stays allowed, as legacy).
function AccessTo({ id, value, action, onChange, disabled }) {
  const listId = useId()
  const term = useSettled(value.trim(), 250)
  const isDate = action === DISABLED_UNTIL
  const names = useResource(!isDate && !disabled && term.length >= 2 ? `hr-clearance-access:${term.toLowerCase()}` : null,
    (signal) => clearanceService.searchAllEmployees(term, { signal }))
  const label = isDate ? 'Disabled until' : 'Access to'
  return (
    <label className="zrv-hr-ecl-access" htmlFor={id}>
      <small>{label}</small>
      {isDate
        ? <input id={id} type="date" className="ux-input zrv-hr-input" value={value} disabled={disabled || !action} onChange={(event) => onChange(event.target.value)} />
        : <>
          <input id={id} className="ux-input zrv-hr-input" list={listId} autoComplete="off" maxLength={500} value={value} disabled={disabled || !action}
            placeholder={action ? 'Name (optional)' : 'Choose an action first'} onChange={(event) => onChange(event.target.value)} />
          <datalist id={listId}>{names.status === 'ready' && names.data.items.map((item) => <option key={item.employeeId} value={item.name}>{item.employeeNumber}</option>)}</datalist>
        </>}
    </label>
  )
}

function SignatureSelect({ id, label = 'Signature', value, onChange, disabled }) {
  return (
    <HrField id={id} label={label}>
      <select id={id} className="ux-select zrv-hr-input" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {SIGNATURES.map((item) => <option key={item || 'none'} value={item}>{item || 'Not signed'}</option>)}
      </select>
    </HrField>
  )
}

function ClearanceEditor({ lookups, initial }) {
  const navigate = useNavigate()
  const permissions = usePermissions()
  const { destinations, approvers } = lookups
  const managers = approvers.department
  const editor = useRecruitmentForm({
    basePath: CLEARANCE_PATHS.form, idKey: 'clearanceId', record: initial,
    initialForm: initial ? formOf(initial, destinations) : (() => {
      const form = blankClearance()
      const names = sectionApprovers(null, approvers)
      for (const section of SECTIONS) form.sections[section.key].approver = names[section.key]
      return form
    })(),
  })
  const { form, patch, step, setStep, record } = editor
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const [tab, setTab] = useState(SECTIONS[0].key)
  const employeeRequest = useRef(0)
  const canWrite = permissions.can(`${PERMISSION}:${record ? 'UPDATE' : 'CREATE'}`)
  const locked = Boolean(record && !isEditable(record.status)) || !canWrite
  // Legacy create screen: the clearance tabs and every signature stay disabled until the first save.
  const saved = Boolean(record)
  const status = record?.status ?? null
  const employee = form.employee
  const lostReceiver = Boolean(initial?.computerReceivedBy) && !form.computerReceivedBy && !errors.computerReceivedBy

  const clear = (...keys) => setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key))))
  const set = (key) => (event) => { editor.set(key)(event); clear(key) }
  const setPart = (part, key) => (value) => {
    patch((current) => ({ [part]: { ...current[part], [key]: value?.target ? value.target.value : value } }))
    clear(part, `${part}Date`)
  }
  const setSection = (key, field) => (value) => {
    patch((current) => ({ sections: { ...current.sections, [key]: { ...current.sections[key], [field]: value?.target ? value.target.value : value } } }))
    clear(`${key}:${field}`)
  }
  const toggleItem = (key, code) => patch((current) => {
    const items = current.sections[key].items
    return { sections: { ...current.sections, [key]: { ...current.sections[key], items: items.includes(code) ? items.filter((item) => item !== code) : [...items, code] } } }
  })
  const setIt = (index, change) => {
    patch((current) => ({ itMatrix: current.itMatrix.map((row, at) => (at === index ? change(row) : row)) }))
    clear(`it:${index}`)
  }

  // Legacy #emp_no change: name, job title, department, division and the tab approvers.
  const selectEmployee = async (item) => {
    const request = ++employeeRequest.current
    patch({ employee: item })
    clear('employee')
    try {
      const details = await clearanceService.employeeDetails(item.employeeNumber)
      if (request !== employeeRequest.current) return
      const names = sectionApprovers(details, approvers)
      patch((current) => ({
        employee: details,
        sections: Object.fromEntries(SECTIONS.map((section) => [section.key, { ...current.sections[section.key], approver: names[section.key] }])),
      }))
    } catch {
      if (request === employeeRequest.current) setErrors((current) => ({ ...current, employee: 'The employee details could not be loaded. Try again.' }))
    }
  }
  const managerOption = (item) => ({ employeeId: item.empNo, employeeNumber: item.empNo, name: item.name })
  const searchManagers = async (search) => {
    const term = search.trim().toLocaleLowerCase()
    return { items: managers.filter((item) => `${item.empNo} ${item.name}`.toLocaleLowerCase().includes(term)).slice(0, 50).map(managerOption) }
  }
  const destinationOption = (item) => ({ employeeId: item.value, employeeNumber: item.kind === 'employee' ? item.value : '', name: item.label })
  const searchDestinations = async (search) => {
    const term = search.trim().toLocaleLowerCase()
    return { items: destinations.filter((item) => `${item.value} ${item.label}`.toLocaleLowerCase().includes(term)).slice(0, 50).map(destinationOption) }
  }
  const manager = managers.find((item) => item.name === form.departmentManager.name)
  const receiver = destinations.find((item) => item.value === form.computerReceivedBy)

  const save = () => {
    if (locked) return
    const problems = validateClearance(form, { managers, destinations })
    setErrors(Object.fromEntries(problems.map((problem) => [problem.field, problem.message])))
    if (problems.length) {
      const sectionProblem = problems.find((problem) => problem.step === 3)
      if (sectionProblem && problems[0].step === 3) setTab(sectionProblem.field.split(':')[0])
      editor.reject(problems[0].step, problems.length === 1 ? problems[0].message : C.reviewProblems(problems.length),
        problems.length === 1 ? [] : problems.map((problem) => problem.message))
      return
    }
    editor.perform(async ({ saved: keep }) => {
      const result = await clearanceService.save(editor.recordId, form)
      keep(result)
      return result
    }, { success: (result) => `Employee clearance ${result.referenceNo || result.clearanceId} saved.` })
  }
  const leave = (path) => (editor.dirty && !locked ? setDialog({ path }) : navigate(path))
  const tools = [
    { icon: 'printer', label: C.print, onClick: () => window.print() },
    { icon: 'chart-column', label: 'Report', onClick: () => leave(CLEARANCE_PATHS.report) },
    { icon: 'file-plus', label: 'New clearance', onClick: () => leave(CLEARANCE_PATHS.form) },
    { icon: 'house', label: C.home, onClick: () => leave('/dashboard') },
  ]

  const itDone = form.itMatrix.filter((row) => row.action).length
  const returned = returnedCount(form.sections)
  const doneSteps = [
    Boolean(employee && form.contact.trim() && form.purpose.trim()),
    itDone === IT_SUBJECTS.length,
    Boolean(form.departmentManager.name && form.computerReceivedBy),
    saved && returned > 0,
  ]
  const required = [employee, form.contact.trim(), form.purpose.trim(), ...form.itMatrix.map((row) => row.action), form.departmentManager.name, form.computerReceivedBy]
  const filled = required.filter(Boolean).length
  const firstRequired = [employee, form.contact.trim(), form.purpose.trim()].filter(Boolean).length
  const signOff = [form.departmentManager.name, form.computerReceivedBy].filter(Boolean).length
  const open = STEPS.filter((_, index) => index < 3 && !doneSteps[index])
  const vacation = form.vacationFrom ? `${enDate(form.vacationFrom)}${form.vacationTo ? ` – ${enDate(form.vacationTo)}` : ''}` : ''
  const readOnly = (id, label, value, placeholder) => (
    <HrField id={id} label={label}><input id={id} className="ux-input zrv-hr-input" readOnly value={value ?? ''} placeholder={placeholder} /></HrField>
  )
  const textField = (id, key, label, max, hint) => (
    <HrField id={id} label={label} required error={errors[key]} hint={hint}>
      <input {...fieldProps(id, { error: errors[key], hint })} className="ux-input zrv-hr-input" aria-required="true" maxLength={max} value={form[key]} onChange={set(key)} />
    </HrField>
  )
  const active = SECTIONS.find((section) => section.key === tab)
  const activeValue = form.sections[tab]
  const moveTab = (event) => {
    const index = SECTIONS.findIndex((section) => section.key === tab)
    const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : null
    if (next === null) return
    event.preventDefault()
    const key = SECTIONS[(next + SECTIONS.length) % SECTIONS.length].key
    setTab(key)
    document.getElementById(`ec-tab-${key}`)?.focus()
  }

  return <>
    <RecruitmentShell current="clearance" flow={false} compact breadcrumb={C.breadcrumb} title={TITLE}
      tools={tools} primary={{ label: SAVE, icon: 'save', onClick: save }} locked={locked} pending={editor.pending} focusError={editor.focusError}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss}
      steps={[
        [STEPS[0], `${firstRequired}/3 required`], [STEPS[1], `${itDone}/${IT_SUBJECTS.length} chosen`],
        [STEPS[2], `${signOff}/2 required`], [STEPS[3], saved ? `${returned} returned` : 'After first save'],
      ]}
      step={step} onStep={setStep} doneSteps={doneSteps} finalLabel={SAVE} onFinal={save}
      side={<>
        <Tilt aria-label="Clearance card">
          <div className="zrv-hr-dark__top"><span className="zrv-hr-mono">{record?.referenceNo || 'Draft'}</span><span className="zrv-hr-dark__status">{status ? STATUS_TEXT[status] : 'Not saved'}</span></div>
          <div className="zrv-hr-dark__who"><span className="zrv-hr-dark__av" aria-hidden="true">{initials(employee?.name)}</span><div>
            <h3 className={`zrv-hr-dark__title${employee ? '' : ' zrv-hr-is-empty'}`}>{employee?.name || 'Employee'}</h3>
            <div className={`zrv-hr-dark__sub${employee?.jobTitle ? '' : ' zrv-hr-is-empty'}`}>{employee?.jobTitle || 'Job title'}</div></div></div>
          <div className="zrv-hr-dark__badges">
            {employee?.departmentName ? <span>{employee.departmentName}</span> : <span>Department</span>}
            {form.purpose.trim() && <span className="zrv-hr-is-solid">{form.purpose.trim().slice(0, 32)}</span>}
          </div>
          <div className="zrv-hr-dark__grid">
            <div><small>Vacation</small><b>{vacation || '—'}</b></div>
            <div><small>Contact</small><b>{form.contact.trim() || '—'}</b></div>
            <div><small>Computer to</small><b>{receiver?.label || '—'}</b></div>
            <div><small>IT access</small><b>{itDone}<em>/{IT_SUBJECTS.length}</em></b></div>
          </div>
        </Tilt>
        <section className="zrv-hr-card zrv-hr-ecl-tabsum" aria-label="Clearance by tab">
          <h3>Returned by department</h3>
          <ul>
            {SECTIONS.map((section) => {
              const value = form.sections[section.key]
              return (
                <li key={section.key} className={value.signature ? `zrv-hr-is-${value.signature.toLowerCase()}` : undefined}>
                  <b>{section.label}</b>
                  <span>{value.items.length}/{section.items.length}</span>
                  <em>{value.signature || 'Not signed'}</em>
                </li>
              )
            })}
          </ul>
        </section>
        <Orbit done={filled} total={required.length} hint={open.length ? `Still open: ${open.join(', ')}` : 'Ready to save.'} />
      </>}>

      {step === 0 && <>
        <StepHead title="Who is leaving, and why?" desc="Choose the employee; the job title and department fill in." />
        <h3 className="zrv-hr-subh">Employee</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          <EmployeePicker id="ec-employee" label="Employee" required tight value={employee} onPick={selectEmployee} error={errors.employee}
            cacheKey="hr-clearance-employees" placeholder="Type employee number or name…" disabled={locked}
            searchService={(term, options) => clearanceService.searchEmployees(term, options)} />
          {readOnly('ec-title', 'Job title', employee?.jobTitle, C.fillsFromEmployee)}
          {readOnly('ec-dept', 'Department', employee?.departmentName, C.fillsFromEmployee)}
          {readOnly('ec-ref', 'Reference no.', record?.referenceNo, C.generated)}
        </div>
        <h3 className="zrv-hr-subh">Leave</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          <HrField id="ec-vac-from" label="Vacation start" error={errors.vacationFrom}>
            <input {...fieldProps('ec-vac-from', { error: errors.vacationFrom })} type="date" className="ux-input zrv-hr-input" value={form.vacationFrom}
              onChange={(event) => { set('vacationFrom')(event); clear('vacationTo') }} />
          </HrField>
          <HrField id="ec-vac-to" label="Vacation end" error={errors.vacationTo}>
            <input {...fieldProps('ec-vac-to', { error: errors.vacationTo })} type="date" className="ux-input zrv-hr-input" min={form.vacationFrom || undefined}
              value={form.vacationTo} onChange={set('vacationTo')} />
          </HrField>
          {textField('ec-contact', 'contact', 'Contact no.', CONTACT_MAX)}
          {readOnly('ec-status', 'Status', status ? STATUS_TEXT[status] : 'Draft')}
          <HrField id="ec-purpose" label="Purpose" required wide error={errors.purpose} hint={`${form.purpose.length} / ${PURPOSE_MAX}`}>
            <textarea {...fieldProps('ec-purpose', { error: errors.purpose, hint: 'count' })} className="ux-textarea zrv-hr-input" rows={2} aria-required="true"
              maxLength={PURPOSE_MAX} value={form.purpose} onChange={set('purpose')} placeholder="Vacation, final exit, resignation…" />
          </HrField>
        </div>
      </>}

      {step === 1 && <>
        <StepHead title="What happens to their IT access?" desc="Choose an action for each system." />
        <p className="zrv-hr-esf-note" role="note">Final exit: fill every row so the user&apos;s data is not deleted.</p>
        <div className="zrv-hr-esf-criteria zrv-hr-mt">
          {form.itMatrix.map((row, index) => {
            const error = errors[`it:${index}`]
            const subject = IT_SUBJECTS[index].replace(':', '')
            return (
              <div key={subject} className={`zrv-hr-esf-criterion zrv-hr-ecl-it${row.action ? ' zrv-hr-is-done' : ''}${error ? ' zrv-hr-is-bad' : ''}`} style={{ '--i': index }}>
                <div className="zrv-hr-esf-criterion__head"><span className="zrv-hr-esf-criterion__n">{index + 1}</span><b id={`ec-it-${index}-label`}>{subject}</b></div>
                <div className="zrv-hr-esf-chips" role="radiogroup" aria-labelledby={`ec-it-${index}-label`} aria-required="true"
                  aria-invalid={error ? true : undefined} aria-describedby={error ? `ec-it-${index}-error` : undefined}>
                  {IT_ACTIONS.map((item) => (
                    <label key={item.value} className={`zrv-hr-esf-chip zrv-hr-is-${item.tone}${row.action === item.value ? ' zrv-hr-is-on' : ''}`}>
                      <input type="radio" name={`ec-it-${index}`} value={item.value} checked={row.action === item.value}
                        onChange={() => setIt(index, (current) => withItAction(current, item.value))} />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
                <AccessTo id={`ec-it-${index}-to`} value={row.accessTo} action={row.action} disabled={locked}
                  onChange={(accessTo) => setIt(index, (current) => ({ ...current, accessTo }))} />
                {error && <small id={`ec-it-${index}-error`} className="zrv-auth-field-error">{error}</small>}
              </div>
            )
          })}
        </div>
      </>}

      {step === 2 && <>
        <StepHead title="Who signs the clearance off?" desc={saved ? undefined : 'Signatures open after the first save.'} />
        <h3 className="zrv-hr-subh">Department manager</h3>
        <div className="zrv-hr-grid zrv-hr-is-3">
          <EmployeePicker id="ec-manager" label="Department Manager" required tight value={manager ? managerOption(manager) : form.departmentManager.name ? { employeeId: '', employeeNumber: '', name: form.departmentManager.name } : null}
            onPick={(item) => setPart('departmentManager', 'name')(item.name)} error={errors.departmentManager} searchService={searchManagers}
            cacheKey="hr-clearance-managers" placeholder="Type a manager's name or number…" disabled={locked} />
          <HrField id="ec-manager-date" label="Date" error={errors.departmentManagerDate}>
            <input {...fieldProps('ec-manager-date', { error: errors.departmentManagerDate })} type="date" className="ux-input zrv-hr-input"
              value={form.departmentManager.date} onChange={setPart('departmentManager', 'date')} />
          </HrField>
          <SignatureSelect id="ec-manager-sign" value={form.departmentManager.signature} onChange={setPart('departmentManager', 'signature')} disabled={!saved} />
        </div>
        <h3 className="zrv-hr-subh">IT manager</h3>
        <div className="zrv-hr-grid zrv-hr-is-3">
          <HrField id="ec-it-manager" label="IT Manager" error={errors.itManager}>
            <input {...fieldProps('ec-it-manager', { error: errors.itManager })} className="ux-input zrv-hr-input" maxLength={500}
              value={form.itManager.name} onChange={setPart('itManager', 'name')} />
          </HrField>
          <HrField id="ec-it-date" label="Date" error={errors.itManagerDate}>
            <input {...fieldProps('ec-it-date', { error: errors.itManagerDate })} type="date" className="ux-input zrv-hr-input"
              value={form.itManager.date} onChange={setPart('itManager', 'date')} />
          </HrField>
          <SignatureSelect id="ec-it-sign" value={form.itManager.signature} onChange={setPart('itManager', 'signature')} disabled={!saved} />
        </div>
        <h3 className="zrv-hr-subh">Computer / Laptop</h3>
        <div className="zrv-hr-grid zrv-hr-is-3">
          <EmployeePicker id="ec-computer" label="Received by" required tight value={receiver ? destinationOption(receiver) : null}
            onPick={(item) => { editor.set('computerReceivedBy')(item.employeeId); clear('computerReceivedBy') }} error={errors.computerReceivedBy}
            searchService={searchDestinations} cacheKey="hr-clearance-destinations" placeholder="IT, No Computer or an employee…" disabled={locked} />
          <SignatureSelect id="ec-computer-sign" value={form.computerSignature} onChange={(value) => editor.set('computerSignature')(value)} disabled={!saved} />
        </div>
        {lostReceiver && <p className="zrv-hr-esf-note" role="status">The saved receiver &ldquo;{initial.computerReceivedBy}&rdquo; is no longer in the list. Choose the receiver again.</p>}
      </>}

      {step === 3 && <>
        <StepHead title="What has each department received back?" desc={saved ? 'Pick a department, tick the items returned, then sign.' : 'Opens after the first save.'} />
        <div className="zrv-hr-ecl-tabs" role="tablist" aria-label="Clearance departments" onKeyDown={moveTab}>
          {SECTIONS.map((section) => (
            <button key={section.key} id={`ec-tab-${section.key}`} type="button" role="tab" aria-selected={tab === section.key} aria-controls="ec-tabpanel"
              tabIndex={tab === section.key ? 0 : -1} className={tab === section.key ? 'zrv-hr-is-on' : undefined} onClick={() => setTab(section.key)}>
              {section.label}<span>{form.sections[section.key].items.length}</span>
            </button>
          ))}
        </div>
        <fieldset id="ec-tabpanel" role="tabpanel" aria-labelledby={`ec-tab-${tab}`} className="zrv-hr-ecl-panel" disabled={!saved}>
          <div className="zrv-hr-esf-chips zrv-hr-ecl-items" role="group" aria-label={`${active.label} items returned`}>
            {active.items.map((item) => {
              const on = activeValue.items.includes(item.code)
              return (
                <label key={item.code} className={`zrv-hr-esf-chip zrv-hr-is-ok${on ? ' zrv-hr-is-on' : ''}`}>
                  <input type="checkbox" checked={on} onChange={() => toggleItem(tab, item.code)} />
                  <span>{item.label}</span>
                </label>
              )
            })}
          </div>
          <div className="zrv-hr-grid zrv-hr-is-4 zrv-hr-mt">
            <HrField id={`ec-${tab}-comments`} label="Comments" wide error={errors[`${tab}:comments`]} hint={`${activeValue.comments.length} / ${COMMENTS_MAX}`}>
              <textarea {...fieldProps(`ec-${tab}-comments`, { error: errors[`${tab}:comments`], hint: 'count' })} className="ux-textarea zrv-hr-input" rows={2}
                maxLength={COMMENTS_MAX} value={activeValue.comments} onChange={setSection(tab, 'comments')} />
            </HrField>
            {hasCost(tab) && (
              <HrField id={`ec-${tab}-cost`} label="Cost" error={errors[`${tab}:cost`]}>
                <input {...fieldProps(`ec-${tab}-cost`, { error: errors[`${tab}:cost`] })} type="number" min="0" step="0.01" inputMode="decimal"
                  className="ux-input zrv-hr-input" value={activeValue.cost} onChange={setSection(tab, 'cost')} />
              </HrField>
            )}
            {tab === 'admin' && <>
              <HrField id="ec-admin-visa" label="Visa Expire" error={errors['admin:visaExpiry']}>
                <input {...fieldProps('ec-admin-visa', { error: errors['admin:visaExpiry'] })} type="date" className="ux-input zrv-hr-input"
                  value={activeValue.visaExpiry} onChange={setSection('admin', 'visaExpiry')} />
              </HrField>
              <HrField id="ec-admin-date" label="App. Date" error={errors['admin:appDate']}>
                <input {...fieldProps('ec-admin-date', { error: errors['admin:appDate'] })} type="date" className="ux-input zrv-hr-input"
                  value={activeValue.appDate} onChange={setSection('admin', 'appDate')} />
              </HrField>
            </>}
            {readOnly(`ec-${tab}-approver`, 'Approver', activeValue.approver, tab === 'employeeDept' ? 'The employee’s direct manager' : 'From the clearance approver list')}
            <SignatureSelect id={`ec-${tab}-sign`} label="App sig" value={activeValue.signature} onChange={setSection(tab, 'signature')} disabled={!saved} />
          </div>
        </fieldset>
        <p className="zrv-admin-hint zrv-hr-mt">Saved as a draft; sending for approval is not available yet.</p>
      </>}
    </RecruitmentShell>
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}
