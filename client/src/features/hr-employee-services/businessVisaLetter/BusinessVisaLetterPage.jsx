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
import { BUSINESS_VISA_LETTER_PATHS as PATHS, LETTERS_BREADCRUMB } from '../employeeServicesPaths.js'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'
import { warmEmployeeList } from '../shared/employeeList.js'
import { NO_IDENTIFY } from '../shared/useEmployeeServicesUser.js'
import '@/styles/hr-business-visa-letter.css'
import {
  RESOURCE, STATUSES, TEXT_FIELDS, blankLetter, businessVisaLetterService as service, validateLetter,
} from './businessVisaLetterService.js'
import PreviewLanguageSwitch from '../shared/PreviewLanguageSwitch.jsx'
import BusinessVisaLetterPreview from './BusinessVisaLetterPreview.jsx'

// The Business Visa Letter: an employee's business visit visa letter to an
// embassy, entered once and read back as the English and Arabic letter. A short
// form, so one compact page with anchored sections (as Sick Leave) and the live
// letter beside it (the letter is also what gets printed).
const TITLE = 'Business Visa Letter'
const SECTIONS = ['Letter', 'Employee', 'Visit']
const SAVE = 'Save letter'
const SECTION_OF = {
  ref_no: 0, letter_date: 0, division_id: 0, embassy: 0, embassy_ar: 0, request_for: 0, status: 0,
  employee_name: 1, nationality: 1, nationality_ar: 1, passport_no: 1, passport_date: 1, id_no: 1, id_expiration_date: 1,
  job_title: 1, job_title_ar: 1, employed_since: 1, contract_expiry: 1, contract_nature: 1, contract_nature_ar: 1, monthly_salary: 1,
  visit_place: 2, visit_days: 2, visit_purpose: 2, visit_purpose_ar: 2, expense_borne_by: 2, expense_employee_name: 2,
  return_employee_name: 2, return_statement: 2, closing_text: 2,
}

export default function BusinessVisaLetterPage() {
  return (
    <RecruitmentLoader current="business-visa-letter" flow={false} breadcrumb={LETTERS_BREADCRUMB} identify={NO_IDENTIFY}
      title={TITLE} param="letterId" load={service.getById} loadLookups={(signal) => {
        // Opening the employee field lists employees without a request.
        warmEmployeeList(service, { signal })
        return service.options({ signal })
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
    initialForm: initial ? { ...initial.form } : blankLetter(businessToday()),
  })
  const { form, patch, step, setStep, record } = editor
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const [picked, setPicked] = useState(null)
  const [language, setLanguage] = useState('en')
  const employeeRequest = useRef(0)
  const locked = !permissions.can(`${RESOURCE}:${record ? 'UPDATE' : 'CREATE'}`)

  const clear = (...keys) => setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key))))
  const set = (key) => (event) => { editor.set(key)(event); clear(key) }
  // The employee's details fill the letter; any of them can still be corrected.
  const selectEmployee = async (item) => {
    const request = ++employeeRequest.current
    clear('employee_name')
    setPicked(item)
    try {
      const details = await service.employee(item.employeeNumber)
      if (request !== employeeRequest.current) return
      patch((current) => ({
        ...details,
        // A name typed for the expense / return lines follows the employee unless changed.
        expense_employee_name: current.expense_employee_name && current.expense_employee_name !== current.employee_name ? current.expense_employee_name : details.employee_name,
        return_employee_name: current.return_employee_name && current.return_employee_name !== current.employee_name ? current.return_employee_name : details.employee_name,
      }))
    } catch {
      if (request !== employeeRequest.current) return
      setErrors((current) => ({ ...current, employee_name: 'The employee details could not be loaded. Try again.' }))
    }
  }
  const pickEmbassy = (value) => {
    const option = lookups.embassies.find((item) => item.value === value)
    patch((current) => {
      const previous = lookups.embassies.find((item) => item.value === current.embassy)
      // The Arabic name follows the English choice only while it is still empty
      // (the requester may have overridden it before).
      const embassyAr = String(current.embassy_ar ?? '').trim()
        ? current.embassy_ar
        : option?.ar || ''
      return {
        embassy: value,
        // Clearing the English embassy also clears an Arabic value that was
        // only its automatic translation.
        embassy_ar: value ? embassyAr : embassyAr === previous?.ar ? '' : embassyAr,
      }
    })
    clear('embassy')
  }

  // One page: a tab scrolls to the section it names (as Sick Leave).
  const goToSection = (index) => {
    const next = Math.max(0, Math.min(SECTIONS.length - 1, index))
    setStep(next)
    document.getElementById(`bvl-section-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const scrollToSection = (index) => requestAnimationFrame(() => document.getElementById(`bvl-section-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))

  const save = () => {
    if (locked) return
    const next = validateLetter(form)
    setErrors(next)
    const keys = Object.keys(next)
    if (keys.length) {
      const first = Math.min(...keys.map((key) => SECTION_OF[key] ?? 0))
      editor.reject(first, keys.length === 1 ? next[keys[0]] : C.reviewProblems(keys.length))
      scrollToSection(first)
      return
    }
    editor.perform(async ({ saved: keep }) => {
      const result = await service.save(editor.recordId, form)
      keep(result)
      return result
    }, { success: (result) => `Business visa letter ${result.form.ref_no} saved.` })
  }
  const leave = (path) => (editor.dirty && !locked ? setDialog({ path }) : navigate(path))
  const tools = [
    { icon: 'printer', label: C.print, onClick: () => window.print() },
    { icon: 'chart-column', label: 'Report', onClick: () => leave(PATHS.report) },
    { icon: 'file-plus', label: 'New letter', onClick: () => leave(PATHS.form) },
    { icon: 'house', label: C.home, onClick: () => leave('/dashboard') },
  ]

  const has = (key) => Boolean(String(form[key] ?? '').trim())
  const letterDone = ['ref_no', 'letter_date', 'division_id'].filter(has).length
  const doneSteps = [letterDone === 3, has('employee_name'), has('visit_place') && has('visit_days')]

  const input = (key, label, { type = 'text', required = false, wide = false, ar = false, placeholder } = {}) => (
    <HrField key={key} id={`bvl-${key}`} label={label} required={required} wide={wide} error={errors[key]}>
      <input {...fieldProps(`bvl-${key}`, { error: errors[key] })} type={type} max={type === 'date' ? '9999-12-31' : undefined} className="ux-input zrv-hr-input" aria-required={required || undefined}
        dir={ar ? 'rtl' : undefined} lang={ar ? 'ar' : undefined} maxLength={TEXT_FIELDS[key]} min={type === 'number' ? 0 : undefined}
        value={form[key]} onChange={set(key)} readOnly={locked} placeholder={placeholder} />
    </HrField>
  )
  // Divisions, embassies and request types are searchable lookups.
  const select = (key, label, options, { required = false, onChange = (value) => set(key)(value) } = {}) => (
    <HrField id={`bvl-${key}`} label={label} required={required} error={errors[key]}>
      <SearchableLookup id={`bvl-${key}`} value={form[key]} customValue={form[key]} required={required} error={errors[key]} disabled={locked}
        options={options.map((item) => ({ code: item.value, name: item.label }))}
        onChange={(option) => onChange(option.code)} onClear={key === 'status' ? undefined : () => onChange('')}
        placeholder="Search or select" maxLength={200} />
    </HrField>
  )

  return <>
    <RecruitmentShell current="business-visa-letter" flow={false} compact singlePage breadcrumb={LETTERS_BREADCRUMB} title={TITLE}
      tools={tools} primary={{ label: SAVE, icon: 'save', onClick: save }} locked={locked} pending={editor.pending} focusError={editor.focusError}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss}
      steps={[
        [SECTIONS[0], `${letterDone}/3 required`], [SECTIONS[1], has('employee_name') ? form.employee_name : 'Choose employee'],
        [SECTIONS[2], has('visit_place') ? `${form.visit_place}${has('visit_days') ? ` · ${form.visit_days} days` : ''}` : 'Place and days'],
      ]}
      step={step} onStep={goToSection} doneSteps={doneSteps}
      side={<>
        <div className="zrv-hr-side__h">
          <span className="zrv-hr-side__t"><span className="zrv-hr-eyebrow">Preview</span></span>
          <PreviewLanguageSwitch value={language} onChange={setLanguage} />
        </div>
        <BusinessVisaLetterPreview form={form} language={language} lookups={lookups} />
      </>}>

      <section id="bvl-section-0" className="zrv-hr-esf-section">
        <div className="zrv-hr-esf-sectionhead">
          <h2>Letter</h2>
          <span className="zrv-hr-esf-count" role="status">{letterDone} / 3 required</span>
        </div>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {input('ref_no', 'Reference no.', { required: true })}
          {input('letter_date', 'Letter date', { type: 'date', required: true })}
          {select('division_id', 'Division', lookups.divisions, { required: true })}
          {select('status', 'Status', STATUSES.map((value) => ({ value, label: value === 'FINAL' ? 'Final' : 'Draft' })))}
        </div>
        <div className="zrv-hr-grid zrv-hr-is-3 zrv-hr-mt">
          {select('embassy', 'Embassy', lookups.embassies, { onChange: pickEmbassy })}
          {input('embassy_ar', 'Embassy, in Arabic', { ar: true })}
          {select('request_for', 'Request for', lookups.requestFor)}
        </div>
      </section>

      <section id="bvl-section-1" className={`zrv-hr-esf-card zrv-hr-mt${step === 1 ? ' zrv-hr-is-focus' : ''}`}>
        <div className="zrv-hr-esf-sectionhead">
          <h2>Employee</h2>
          <span className="zrv-hr-esf-daypill" role="status">{has('employee_name') ? form.employee_name : 'Choose employee'}</span>
        </div>
        <div className="zrv-hr-grid zrv-hr-is-4">
          <EmployeePicker id="bvl-employee" label="Employee" required tight value={picked ?? (form.employee_name ? { employeeId: form.employee_name, employeeNumber: '', name: form.employee_name } : null)}
            onPick={selectEmployee} error={errors.employee_name} cacheKey="hr-business-visa-letter-employees" placeholder="Type an employee number or name…" disabled={locked}
            searchService={(term, options) => service.searchEmployees(term, options)} />
          {input('employee_name', 'Name on the letter', { required: true })}
          {input('nationality', 'Nationality')}
          {input('nationality_ar', 'Nationality, in Arabic', { ar: true })}
        </div>
        <h3 className="zrv-hr-subh">Passport and ID</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {input('passport_no', 'Passport no.')}
          {input('passport_date', 'Passport date', { type: 'date' })}
          {input('id_no', 'ID / Iqama no.')}
          {input('id_expiration_date', 'ID expiry', { type: 'date' })}
        </div>
        <h3 className="zrv-hr-subh">Employment</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {input('job_title', 'Job title')}
          {input('job_title_ar', 'Job title, in Arabic', { ar: true })}
          {input('employed_since', 'Employed since', { type: 'date' })}
          {input('contract_expiry', 'Contract expiry', { type: 'date' })}
          {input('contract_nature', 'Contract nature')}
          {input('contract_nature_ar', 'Contract nature, in Arabic', { ar: true })}
          {input('monthly_salary', 'Monthly salary (SR)', { type: 'number' })}
        </div>
      </section>

      <section id="bvl-section-2" className={`zrv-hr-esf-card zrv-hr-mt${step === 2 ? ' zrv-hr-is-focus' : ''}`}>
        <div className="zrv-hr-esf-sectionhead">
          <h2>Visit</h2>
          <span className="zrv-hr-esf-count" role="status">{has('visit_days') ? `${form.visit_days} days` : 'Place and days'}</span>
        </div>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {input('visit_place', 'Visit place')}
          {input('visit_days', 'Days', { type: 'number' })}
          {input('visit_purpose', 'Purpose')}
          {input('visit_purpose_ar', 'Purpose, in Arabic', { ar: true })}
        </div>
        <h3 className="zrv-hr-subh">Undertaking</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {input('expense_borne_by', 'Expenses borne by')}
          {input('expense_employee_name', 'Expenses for', { placeholder: 'Defaults to the employee' })}
          {input('return_employee_name', 'Returning employee', { placeholder: 'Defaults to the employee' })}
          {input('return_statement', 'Return statement', { wide: true })}
          {input('closing_text', 'Closing text', { wide: true })}
        </div>
      </section>
    </RecruitmentShell>
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}
