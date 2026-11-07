import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import usePermissions from '@/features/access/usePermissions.js'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { businessToday } from '@/features/hr-recruitment/shared/hrFormat.js'
import { useRecruitmentForm } from '@/features/hr-recruitment/shared/useRecruitmentForm.js'
import { NewFormDialog } from '@/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx'
import { RecruitmentLoader } from '@/features/hr-recruitment/shared/components/RecruitmentLoader.jsx'
import { HrField, SearchableLookup } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
import { EmployeePicker } from '@/features/hr-recruitment/shared/components/EmployeePicker.jsx'
import { RecruitmentShell } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { LETTERS_BREADCRUMB, TOURIST_VISA_PATHS as PATHS } from '../employeeServicesPaths.js'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'
import { warmEmployeeList } from '../shared/employeeList.js'
import { NO_IDENTIFY } from '../shared/useEmployeeServicesUser.js'
import '@/styles/hr-tourist-visa.css'
import {
  DATE_FIELDS, DIVISIONS, EMPLOYEE_FIELDS, RESOURCE, blankLetter, letterFormOf, touristVisaService as service, validateLetter,
} from './touristVisaService.js'
import PreviewLanguageSwitch from '../shared/PreviewLanguageSwitch.jsx'
import TouristVisaPreview from './TouristVisaPreview.jsx'

// The legacy Tourist_visa letter: to the consul general, for an employee's
// tourist visa, in English and Arabic. A short form, so one compact page with
// anchored sections (as Sick Leave) and the letter in the side (also printed).
const TITLE = 'Tourist Visa Letter'
const SECTIONS = ['Letter', 'Employee', 'Travel', 'Approval']
const SAVE = 'Save letter'
const SECTION_OF = { curDate: 0, division: 0, country: 0, employee: 1, tourismTo: 2, tourismFrom: 2, approvalName: 3 }
const money = (value) => {
  const number = Number(String(value ?? '').replace(/,/g, ''))
  return value === '' || !Number.isFinite(number) ? String(value ?? '') : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(number)
}
// Server messages for an employee who cannot get a letter.
const EMPLOYEE_PROBLEM = Object.freeze({
  FIELD_REQUIRED: 'This employee’s name, nationality, passport, national ID or position is missing in the master.',
  SALARY_INVALID: 'This employee has no valid salary in the master.',
})

export default function TouristVisaPage() {
  return (
    <RecruitmentLoader current="tourist-visa" flow={false} breadcrumb={LETTERS_BREADCRUMB} identify={NO_IDENTIFY}
      title={TITLE} param="letterId" load={service.getById} loadLookups={(signal) => {
        // Opening Emp# lists employees without a request.
        warmEmployeeList(service, { signal })
        return service.lookups({ signal })
      }}>
      {({ lookups, record, editorKey }) => <LetterEditor key={editorKey} lookups={lookups} initial={record} />}
    </RecruitmentLoader>
  )
}

function LetterEditor({ lookups, initial }) {
  const navigate = useNavigate()
  const permissions = usePermissions()
  const editor = useRecruitmentForm({
    basePath: PATHS.form, idKey: 'letterId', stepCount: SECTIONS.length, record: initial,
    initialForm: initial ? letterFormOf(initial) : blankLetter(businessToday()),
  })
  const { form, patch, step, setStep, record } = editor
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const [language, setLanguage] = useState('en')
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

  // One page: a tab scrolls to the section it names (as Sick Leave).
  const goToSection = (index) => {
    const next = Math.max(0, Math.min(SECTIONS.length - 1, index))
    setStep(next)
    document.getElementById(`tv-section-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const scrollToSection = (index) => requestAnimationFrame(() => document.getElementById(`tv-section-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))

  const save = () => {
    if (locked) return
    const next = validateLetter(form, { approvers: lookups.approvers })
    setErrors(next)
    const keys = Object.keys(next)
    if (keys.length) {
      const first = Math.min(...keys.map((key) => SECTION_OF[key] ?? 0))
      editor.reject(first, keys.length === 1 ? next[keys[0]] : C.reviewProblems(keys.length))
      scrollToSection(first)
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
          scrollToSection(1)
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
  const countryOptions = (value) => [...(value && !lookups.countries.includes(value) ? [value] : []), ...lookups.countries]
  // Long lists (countries and divisions) are searchable.
  const select = (key, label, options, { placeholder = 'Search or select' } = {}) => (
    <HrField id={`tv-${key}`} label={label} required error={errors[key]}>
      <SearchableLookup id={`tv-${key}`} value={form[key]} required error={errors[key]} disabled={locked}
        options={options.map((value) => ({ code: value, name: value }))}
        onChange={(option) => set(key)(option.code)} onClear={() => set(key)('')}
        placeholder={placeholder} maxLength={200} />
    </HrField>
  )
  const readOnly = (id, label, value, { placeholder = C.fillsFromEmployee } = {}) => (
    <HrField id={id} label={label}><input id={id} className="ux-input zrv-hr-input" readOnly value={value ?? ''} placeholder={placeholder} /></HrField>
  )

  return <>
    <RecruitmentShell current="tourist-visa" flow={false} compact singlePage breadcrumb={LETTERS_BREADCRUMB} title={TITLE}
      tools={tools} primary={{ label: SAVE, icon: 'save', onClick: save }} locked={locked} pending={editor.pending} focusError={editor.focusError}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss}
      steps={[
        [SECTIONS[0], `${letterDone}/3 required`], [SECTIONS[1], employee ? employee.employee_no : 'Choose employee'],
        [SECTIONS[2], form.tourismTo || 'Destination'], [SECTIONS[3], approver ? approver.position || 'Chosen' : 'Approver'],
      ]}
      step={step} onStep={goToSection} doneSteps={doneSteps}
      side={<>
        <div className="zrv-hr-side__h">
          <span className="zrv-hr-side__t"><span className="zrv-hr-eyebrow">Preview</span></span>
          <PreviewLanguageSwitch value={language} onChange={setLanguage} />
        </div>
        <TouristVisaPreview form={form} record={record} employee={employee} approver={approver} language={language} />
      </>}>

      <section id="tv-section-0" className="zrv-hr-esf-section">
        <div className="zrv-hr-esf-sectionhead">
          <h2>Letter</h2>
          <span className="zrv-hr-esf-count" role="status">{letterDone} / 3 required</span>
        </div>
        <div className="zrv-hr-grid zrv-hr-is-4">
          <HrField id="tv-date" label="Date" required error={errors.curDate}>
            <input {...fieldProps('tv-date', { error: errors.curDate })} type="date" className="ux-input zrv-hr-input" aria-required="true" value={form.curDate} onChange={set('curDate')} readOnly={locked} />
          </HrField>
          {readOnly('tv-hijri', 'Hijri date', record && form.curDate === record.curDate ? record.curDateAr : '', { placeholder: 'Set on save' })}
          {select('division', 'Division', DIVISIONS)}
          {readOnly('tv-ref', 'Ref. no.', record?.refNo, { placeholder: C.generated })}
        </div>
        <div className="zrv-hr-grid zrv-hr-is-4 zrv-hr-mt">
          {select('country', 'Consul general of', countryOptions(form.country))}
        </div>
      </section>

      <section id="tv-section-1" className={`zrv-hr-esf-card zrv-hr-mt${step === 1 ? ' zrv-hr-is-focus' : ''}`}>
        <div className="zrv-hr-esf-sectionhead">
          <h2>Employee</h2>
          <span className="zrv-hr-esf-daypill" role="status">{employee ? employee.employee_name : 'Choose employee'}</span>
        </div>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {record
            ? readOnly('tv-emp', 'Employee no.', employee?.employee_no)
            : <EmployeePicker id="tv-employee" label="Employee no." required tight value={employee ? { employeeId: employee.employee_no, employeeNumber: employee.employee_no, name: employee.employee_name } : null}
              onPick={selectEmployee} error={errors.employee} cacheKey="hr-tourist-visa-employees" placeholder="Search by number or name…" disabled={locked}
              searchService={(term, options) => service.searchEmployees(term, options)} />}
          {readOnly('tv-salary', 'Salary', employee ? `${money(employee.salary)} SAR` : '')}
        </div>
        {record && errors.employee && <p className="zrv-auth-field-error" role="alert">{errors.employee}</p>}
        <div className="zrv-hr-grid zrv-hr-is-4 zrv-hr-mt">
          {EMPLOYEE_FIELDS.map((item) => readOnly(`tv-${item.key}`, item.en, employee?.[item.key]))}
        </div>
        <h3 className="zrv-hr-subh">Dates</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {DATE_FIELDS.map((item) => (
            <HrField key={item.key} id={`tv-${item.key}`} label={item.en}>
              <input id={`tv-${item.key}`} type="date" className="ux-input zrv-hr-input" value={form.dates[item.key]} onChange={setDate(item.key)} readOnly={locked} />
            </HrField>
          ))}
        </div>
      </section>

      <section id="tv-section-2" className={`zrv-hr-esf-card zrv-hr-mt${step === 2 ? ' zrv-hr-is-focus' : ''}`}>
        <div className="zrv-hr-esf-sectionhead">
          <h2>Travel</h2>
          <span className="zrv-hr-esf-count" role="status">{form.tourismFrom && form.tourismTo ? `${form.tourismFrom} → ${form.tourismTo}` : 'From and to'}</span>
        </div>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {select('tourismFrom', 'Tourism from', countryOptions(form.tourismFrom))}
          {select('tourismTo', 'Tourism to', countryOptions(form.tourismTo))}
        </div>
      </section>

      <section id="tv-section-3" className={`zrv-hr-esf-card zrv-hr-mt${step === 3 ? ' zrv-hr-is-focus' : ''}`}>
        <div className="zrv-hr-esf-sectionhead">
          <h2>Approval</h2>
          <span className="zrv-hr-esf-count" role="status">{approver?.position || 'Approver'}</span>
        </div>
        <div className="zrv-hr-grid zrv-hr-is-4">
          <HrField id="tv-approvalName" label="Approval name" required error={errors.approvalName}>
            <SearchableLookup id="tv-approvalName" value={form.approvalName} required error={errors.approvalName} disabled={locked}
              options={lookups.approvers.map((item) => ({ code: item.name, name: item.name, description: item.position }))}
              onChange={(option) => set('approvalName')(option.code)} placeholder="Search and choose the approver"
              noResults="No matching approver" maxLength={200} />
          </HrField>
          {readOnly('tv-position', 'Position', approver?.position, { placeholder: 'Fills from the approver' })}
        </div>
      </section>
    </RecruitmentShell>
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}
