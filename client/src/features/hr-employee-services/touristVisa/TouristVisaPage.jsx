import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import usePermissions from '@/features/access/usePermissions.js'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { businessToday, enDate, initials } from '@/features/hr-recruitment/shared/hrFormat.js'
import { useRecruitmentForm } from '@/features/hr-recruitment/shared/useRecruitmentForm.js'
import { NewFormDialog } from '@/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx'
import { RecruitmentLoader } from '@/features/hr-recruitment/shared/components/RecruitmentLoader.jsx'
import { HrField } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
import { EmployeePicker } from '@/features/hr-recruitment/shared/components/EmployeePicker.jsx'
import { Orbit, RecruitmentShell, StepHead, Tilt } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { LETTERS_BREADCRUMB, TOURIST_VISA_PATHS as PATHS } from '../employeeServicesPaths.js'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'
import '@/styles/hr-tourist-visa.css'
import {
  DATE_FIELDS, DIVISIONS, EMPLOYEE_FIELDS, RESOURCE, blankLetter, letterFormOf, touristVisaService as service, validateLetter,
} from './touristVisaService.js'

// The legacy Tourist_visa letter: to the consul general, for an employee's
// tourist visa, in English and Arabic.
const TITLE = 'Tourist Visa Letter'
const STEPS = ['Letter', 'Employee', 'Travel', 'Approval']
const SAVE = 'Save letter'
const STEP_OF = { curDate: 0, division: 0, country: 0, employee: 1, tourismTo: 2, tourismFrom: 2, approvalName: 3 }
const money = (value) => {
  const number = Number(String(value ?? '').replace(/,/g, ''))
  return value === '' || !Number.isFinite(number) ? String(value ?? '') : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(number)
}
// Server messages for an employee who cannot get a letter.
const EMPLOYEE_PROBLEM = Object.freeze({
  FIELD_REQUIRED: 'This employee’s name, nationality, passport, national ID or position is missing in the master.',
  SALARY_INVALID: 'This employee has no valid salary in the master.',
})

// A label in both languages.
const Bi = ({ en, ar }) => <>{en} <span className="zrv-hr-tv-ar" lang="ar" dir="rtl">{ar}</span></>

export default function TouristVisaPage() {
  return (
    <RecruitmentLoader current="tourist-visa" flow={false} breadcrumb={LETTERS_BREADCRUMB} identify={() => {}}
      title={TITLE} param="letterId" load={service.getById} loadLookups={(signal) => service.lookups({ signal })}>
      {({ lookups, record, editorKey }) => <LetterEditor key={editorKey} lookups={lookups} initial={record} />}
    </RecruitmentLoader>
  )
}

function LetterEditor({ lookups, initial }) {
  const navigate = useNavigate()
  const permissions = usePermissions()
  const editor = useRecruitmentForm({
    basePath: PATHS.form, idKey: 'letterId', record: initial,
    initialForm: initial ? letterFormOf(initial) : blankLetter(businessToday()),
  })
  const { form, patch, step, setStep, record } = editor
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const employeeRequest = useRef(0)
  const locked = !permissions.can(`${RESOURCE}:${record ? 'UPDATE' : 'CREATE'}`)
  const employee = form.employee
  const approver = lookups.approvers.find((item) => item.name === form.approvalName)

  const clear = (...keys) => setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key))))
  const set = (key) => (event) => { editor.set(key)(event); clear(key) }
  const setDate = (key) => (event) => patch((current) => ({ dates: { ...current.dates, [key]: event.target.value } }))
  // Legacy employee autofill; the origin defaults to the employee's country.
  const selectEmployee = async (item) => {
    const request = ++employeeRequest.current
    clear('employee')
    try {
      const details = await service.employee(item.employeeNumber)
      if (request !== employeeRequest.current) return
      const origin = lookups.countries.find((country) => country.toUpperCase() === details.tourism_from.toUpperCase())
      patch((current) => ({ employee: details, tourismFrom: current.tourismFrom || origin || '' }))
    } catch {
      if (request !== employeeRequest.current) return
      patch({ employee: null })
      setErrors((current) => ({ ...current, employee: 'The employee details could not be loaded. Try again.' }))
    }
  }

  const save = () => {
    if (locked) return
    const next = validateLetter(form, { approvers: lookups.approvers })
    setErrors(next)
    const keys = Object.keys(next)
    if (keys.length) {
      editor.reject(Math.min(...keys.map((key) => STEP_OF[key] ?? 0)), keys.length === 1 ? next[keys[0]] : C.reviewProblems(keys.length))
      return
    }
    editor.perform(async ({ saved: keep }) => {
      try {
        const result = await service.save(record, form, lookups.approvers)
        keep(result)
        patch({ employee: result.employee })
        return result
      } catch (error) {
        if (EMPLOYEE_PROBLEM[error?.code]) {
          setErrors((current) => ({ ...current, employee: EMPLOYEE_PROBLEM[error.code] }))
          setStep(1)
        }
        throw error
      }
    }, { success: (result) => (result.refNo ? `Tourist visa letter ${result.refNo} saved.` : 'Tourist visa letter saved.') })
  }
  const leave = (path) => (editor.dirty && !locked ? setDialog({ path }) : navigate(path))
  const tools = [
    { icon: 'printer', label: C.print, onClick: () => window.print() },
    { icon: 'chart-column', label: 'Report', onClick: () => leave(PATHS.report) },
    { icon: 'file-plus', label: 'New letter', onClick: () => leave(PATHS.form) },
    { icon: 'house', label: C.home, onClick: () => leave('/dashboard') },
  ]

  const letterDone = [form.curDate, form.division, form.country].filter(Boolean).length
  const doneSteps = [letterDone === 3, Boolean(employee), Boolean(form.tourismTo && form.tourismFrom), Boolean(approver)]
  const open = STEPS.filter((_, index) => !doneSteps[index])
  const countryOptions = (value) => [...(value && !lookups.countries.includes(value) ? [value] : []), ...lookups.countries]
  const select = (key, label, options, { placeholder = 'Select' } = {}) => (
    <HrField id={`tv-${key}`} label={label} required error={errors[key]}>
      <select {...fieldProps(`tv-${key}`, { error: errors[key] })} className="ux-select zrv-hr-input" aria-required="true" value={form[key]} onChange={set(key)} disabled={locked}>
        <option value="">{placeholder}</option>
        {options.map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
    </HrField>
  )
  const readOnly = (id, label, value, { placeholder = C.fillsFromEmployee, ar = false } = {}) => (
    <HrField id={id} label={label}><input id={id} className="ux-input zrv-hr-input" readOnly dir={ar && value ? 'rtl' : undefined} value={value ?? ''} placeholder={placeholder} /></HrField>
  )

  return <>
    <RecruitmentShell current="tourist-visa" flow={false} compact breadcrumb={LETTERS_BREADCRUMB} title={TITLE}
      tools={tools} primary={{ label: SAVE, icon: 'save', onClick: save }} locked={locked} pending={editor.pending} focusError={editor.focusError}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss}
      steps={[
        [STEPS[0], `${letterDone}/3 required`], [STEPS[1], employee ? employee.employee_no : 'Choose employee'],
        [STEPS[2], form.tourismTo || 'Destination'], [STEPS[3], approver ? approver.position || 'Chosen' : 'Approver'],
      ]}
      step={step} onStep={setStep} doneSteps={doneSteps} finalLabel={SAVE} onFinal={save}
      side={<>
        <Tilt aria-label="Letter card">
          <div className="zrv-hr-dark__top"><span className="zrv-hr-mono">{record?.refNo || 'Draft'}</span><span className="zrv-hr-dark__status">{record ? 'Saved' : 'Not saved'}</span></div>
          <div className="zrv-hr-dark__who"><span className="zrv-hr-dark__av" aria-hidden="true">{initials(employee?.employee_name)}</span><div>
            <h3 className={`zrv-hr-dark__title${employee ? '' : ' zrv-hr-is-empty'}`}>{employee?.employee_name || 'Employee'}</h3>
            <div className={`zrv-hr-dark__sub${employee?.position ? '' : ' zrv-hr-is-empty'}`}>{employee?.position || 'Position'}</div></div></div>
          <div className="zrv-hr-dark__badges">
            {form.division && <span className="zrv-hr-is-solid">{form.division}</span>}
            {form.country && <span>To {form.country}</span>}
          </div>
          <div className="zrv-hr-dark__grid">
            <div><small>Date</small><b>{form.curDate ? enDate(form.curDate) : '—'}</b></div>
            <div><small>Hijri</small><b>{record?.curDateAr || 'On save'}</b></div>
            <div><small>From</small><b>{form.tourismFrom || '—'}</b></div>
            <div><small>To</small><b>{form.tourismTo || '—'}</b></div>
          </div>
        </Tilt>
        <Orbit done={doneSteps.filter(Boolean).length} total={STEPS.length} hint={open.length ? `Still open: ${open.join(', ')}` : 'Ready to save.'} />
      </>}>

      {step === 0 && <>
        <StepHead title="Where is the employee going?" desc="The letter date, division and destination country." />
        <div className="zrv-hr-grid zrv-hr-is-4">
          <HrField id="tv-date" label={<Bi en="Date" ar="التاريخ" />} required error={errors.curDate}>
            <input {...fieldProps('tv-date', { error: errors.curDate })} type="date" className="ux-input zrv-hr-input" aria-required="true" value={form.curDate} onChange={set('curDate')} readOnly={locked} />
          </HrField>
          {readOnly('tv-hijri', <Bi en="Hijri date" ar="التاريخ الهجري" />, record && form.curDate === record.curDate ? record.curDateAr : '', { placeholder: 'Set on save' })}
          {select('division', 'Division', DIVISIONS)}
          {readOnly('tv-ref', <Bi en="Ref. no." ar="الرقم" />, record?.refNo, { placeholder: C.generated })}
        </div>
        <h3 className="zrv-hr-subh"><Bi en="To" ar="إلى" /></h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {select('country', <Bi en="Consul general of" ar="القنصل العام" />, countryOptions(form.country))}
          {readOnly('tv-country-ar', <Bi en="In Arabic" ar="بالعربية" />, record && form.country === record.country ? record.countryAr : '', { placeholder: 'Set on save', ar: true })}
        </div>
      </>}

      {step === 1 && <>
        <StepHead title="Who is travelling?" desc="Details come from the employee master, in English and Arabic." />
        <div className="zrv-hr-grid zrv-hr-is-4">
          {record
            ? readOnly('tv-emp', <Bi en="Employee no." ar="رقم الموظف" />, employee?.employee_no)
            : <EmployeePicker id="tv-employee" label="Employee no." required tight value={employee ? { employeeId: employee.employee_no, employeeNumber: employee.employee_no, name: employee.employee_name } : null}
              onPick={selectEmployee} error={errors.employee} cacheKey="hr-tourist-visa-employees" placeholder="Search by number or name…" disabled={locked}
              searchService={(term, options) => service.searchEmployees(term, options)} />}
          {readOnly('tv-salary', <Bi en="Salary" ar="الراتب" />, employee ? `${money(employee.salary)} SAR` : '')}
        </div>
        {record && errors.employee && <p className="zrv-auth-field-error" role="alert">{errors.employee}</p>}
        <dl className="zrv-hr-tv-pairs zrv-hr-mt">
          {EMPLOYEE_FIELDS.map((item) => (
            <div key={item.key}>
              <dt><Bi en={item.en} ar={item.ar} /></dt>
              <dd>{employee
                ? <><span>{employee[item.key] || '—'}</span><span lang="ar" dir="rtl">{employee[`${item.key}_ar`] || ''}</span></>
                : <span className="zrv-hr-is-empty">{C.fillsFromEmployee}</span>}</dd>
            </div>
          ))}
        </dl>
        <h3 className="zrv-hr-subh">Dates</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {DATE_FIELDS.map((item) => (
            <HrField key={item.key} id={`tv-${item.key}`} label={<Bi en={item.en} ar={item.ar} />}>
              <input id={`tv-${item.key}`} type="date" className="ux-input zrv-hr-input" value={form.dates[item.key]} onChange={setDate(item.key)} readOnly={locked} />
            </HrField>
          ))}
        </div>
        {record?.salaryWord && <>
          <h3 className="zrv-hr-subh"><Bi en="Salary in words" ar="الراتب كتابة" /></h3>
          <p className="zrv-hr-tv-close"><span>{record.salaryWord}</span><span lang="ar" dir="rtl">{record.salaryWordAr}</span></p>
        </>}
      </>}

      {step === 2 && <>
        <StepHead title="When will they travel?" desc="The tourism dates, in English and Arabic." />
        <div className="zrv-hr-grid zrv-hr-is-4">
          {select('tourismFrom', <Bi en="Tourism from" ar="السياحة من" />, countryOptions(form.tourismFrom))}
          {select('tourismTo', <Bi en="Tourism to" ar="السياحة إلى" />, countryOptions(form.tourismTo))}
          {readOnly('tv-from-ar', <Bi en="From, in Arabic" ar="من" />, record && form.tourismFrom === record.tourismFrom ? record.tourismFromAr : '', { placeholder: 'Set on save', ar: true })}
          {readOnly('tv-to-ar', <Bi en="To, in Arabic" ar="إلى" />, record && form.tourismTo === record.tourismTo ? record.tourismToAr : '', { placeholder: 'Set on save', ar: true })}
        </div>
      </>}

      {step === 3 && <>
        <StepHead title="Who approves the letter?" desc="The approver's name and position." />
        <div className="zrv-hr-grid zrv-hr-is-4">
          <HrField id="tv-approvalName" label={<Bi en="Approval name" ar="اسم المعتمد" />} required error={errors.approvalName}>
            <select {...fieldProps('tv-approvalName', { error: errors.approvalName })} className="ux-select zrv-hr-input" aria-required="true" value={form.approvalName} onChange={set('approvalName')} disabled={locked}>
              <option value="">Select</option>
              {lookups.approvers.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
          </HrField>
          {readOnly('tv-position', <Bi en="Position" ar="المنصب" />, approver?.position, { placeholder: 'Fills from the approver' })}
        </div>
        <p className="zrv-hr-tv-close"><span>Anticipating your assistance in this regard.</span><span lang="ar" dir="rtl">وتفضلوا بقبول فائق الاحترام ،،،</span></p>
      </>}
    </RecruitmentShell>
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}
