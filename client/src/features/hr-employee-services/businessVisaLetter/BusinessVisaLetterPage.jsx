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
import { BUSINESS_VISA_LETTER_PATHS as PATHS, LETTERS_BREADCRUMB } from '../employeeServicesPaths.js'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'
import '@/styles/hr-business-visa-letter.css'
import {
  RESOURCE, STATUSES, TEXT_FIELDS, blankLetter, businessVisaLetterService as service, validateLetter,
} from './businessVisaLetterService.js'

// The Business Visa Letter: an employee's business visit visa letter to an
// embassy, entered once and read back as the English and Arabic letter.
const TITLE = 'Business Visa Letter'
const STEPS = ['Letter', 'Employee', 'Visit', 'Preview']
const SAVE = 'Save letter'
const STEP_OF = {
  ref_no: 0, letter_date: 0, division_id: 0, embassy: 0, embassy_ar: 0, request_for: 0, status: 0,
  employee_name: 1, nationality: 1, nationality_ar: 1, passport_no: 1, passport_date: 1, id_no: 1, id_expiration_date: 1,
  job_title: 1, job_title_ar: 1, employed_since: 1, contract_expiry: 1, contract_nature: 1, contract_nature_ar: 1, monthly_salary: 1,
  visit_place: 2, visit_days: 2, visit_purpose: 2, visit_purpose_ar: 2, expense_borne_by: 2, expense_employee_name: 2,
  return_employee_name: 2, return_statement: 2, closing_text: 2,
}

// A label in both languages.
const Bi = ({ en, ar }) => <>{en} <span className="zrv-hr-bvl-ar" lang="ar" dir="rtl">{ar}</span></>

export default function BusinessVisaLetterPage() {
  return (
    <RecruitmentLoader current="business-visa-letter" flow={false} breadcrumb={LETTERS_BREADCRUMB} identify={() => {}}
      title={TITLE} param="letterId" load={service.getById} loadLookups={(signal) => service.options({ signal })}>
      {({ lookups, record, editorKey }) => <LetterEditor key={editorKey} lookups={lookups} initial={record} />}
    </RecruitmentLoader>
  )
}

function LetterEditor({ lookups, initial }) {
  const navigate = useNavigate()
  const permissions = usePermissions()
  const editor = useRecruitmentForm({
    basePath: PATHS.form, idKey: 'letterId', record: initial,
    initialForm: initial ? { ...initial.form } : blankLetter(businessToday()),
  })
  const { form, patch, step, setStep, record } = editor
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const [picked, setPicked] = useState(null)
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
  const pickEmbassy = (event) => {
    const option = lookups.embassies.find((item) => item.value === event.target.value)
    patch((current) => ({ embassy: event.target.value, embassy_ar: option?.ar || (event.target.value ? current.embassy_ar : '') }))
    clear('embassy')
  }

  const save = () => {
    if (locked) return
    const next = validateLetter(form)
    setErrors(next)
    const keys = Object.keys(next)
    if (keys.length) {
      editor.reject(Math.min(...keys.map((key) => STEP_OF[key] ?? 0)), keys.length === 1 ? next[keys[0]] : C.reviewProblems(keys.length))
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
    { icon: 'printer', label: C.print, onClick: () => { setStep(3); setTimeout(() => window.print(), 50) } },
    { icon: 'chart-column', label: 'Report', onClick: () => leave(PATHS.report) },
    { icon: 'file-plus', label: 'New letter', onClick: () => leave(PATHS.form) },
    { icon: 'house', label: C.home, onClick: () => leave('/dashboard') },
  ]

  const has = (key) => Boolean(String(form[key] ?? '').trim())
  const letterDone = ['ref_no', 'letter_date', 'division_id'].filter(has).length
  const doneSteps = [letterDone === 3, has('employee_name'), has('visit_place') && has('visit_days'), letterDone === 3 && has('employee_name')]
  const open = STEPS.slice(0, 3).filter((_, index) => !doneSteps[index])
  const division = lookups.divisions.find((item) => item.value === form.division_id)
  const requestFor = lookups.requestFor.find((item) => item.value === form.request_for)

  const input = (key, label, { type = 'text', required = false, wide = false, ar = false, placeholder } = {}) => (
    <HrField key={key} id={`bvl-${key}`} label={label} required={required} wide={wide} error={errors[key]}>
      <input {...fieldProps(`bvl-${key}`, { error: errors[key] })} type={type} className="ux-input zrv-hr-input" aria-required={required || undefined}
        dir={ar ? 'rtl' : undefined} lang={ar ? 'ar' : undefined} maxLength={TEXT_FIELDS[key]} min={type === 'number' ? 0 : undefined}
        value={form[key]} onChange={set(key)} readOnly={locked} placeholder={placeholder} />
    </HrField>
  )
  const select = (key, label, options, { required = false, onChange = set(key) } = {}) => (
    <HrField id={`bvl-${key}`} label={label} required={required} error={errors[key]}>
      <select {...fieldProps(`bvl-${key}`, { error: errors[key] })} className="ux-select zrv-hr-input" aria-required={required || undefined} value={form[key]} onChange={onChange} disabled={locked}>
        {key !== 'status' && <option value="">Select</option>}
        {form[key] && !options.some((item) => item.value === form[key]) && <option value={form[key]}>{form[key]}</option>}
        {options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </HrField>
  )

  return <>
    <RecruitmentShell current="business-visa-letter" flow={false} compact breadcrumb={LETTERS_BREADCRUMB} title={TITLE}
      tools={tools} primary={{ label: SAVE, icon: 'save', onClick: save }} locked={locked} pending={editor.pending} focusError={editor.focusError}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss}
      steps={[
        [STEPS[0], `${letterDone}/3 required`], [STEPS[1], has('employee_name') ? form.employee_name : 'Choose employee'],
        [STEPS[2], has('visit_place') ? `${form.visit_place}${has('visit_days') ? ` · ${form.visit_days} days` : ''}` : 'Place and days'], [STEPS[3], 'English · العربية'],
      ]}
      step={step} onStep={setStep} doneSteps={doneSteps} finalLabel={SAVE} onFinal={save}
      side={<>
        <Tilt aria-label="Letter card">
          <div className="zrv-hr-dark__top"><span className="zrv-hr-mono">{form.ref_no || 'Draft'}</span><span className="zrv-hr-dark__status">{record ? form.status === 'FINAL' ? 'Final' : 'Draft' : 'Not saved'}</span></div>
          <div className="zrv-hr-dark__who"><span className="zrv-hr-dark__av" aria-hidden="true">{initials(form.employee_name)}</span><div>
            <h3 className={`zrv-hr-dark__title${has('employee_name') ? '' : ' zrv-hr-is-empty'}`}>{form.employee_name || 'Employee'}</h3>
            <div className={`zrv-hr-dark__sub${has('job_title') ? '' : ' zrv-hr-is-empty'}`}>{form.job_title || 'Job title'}</div></div></div>
          <div className="zrv-hr-dark__badges">
            {requestFor && <span className="zrv-hr-is-solid">{requestFor.label}</span>}
            {division && <span>{division.label}</span>}
          </div>
          <div className="zrv-hr-dark__grid">
            <div><small>Date</small><b>{form.letter_date ? enDate(form.letter_date) : '—'}</b></div>
            <div><small>Embassy</small><b>{form.embassy || '—'}</b></div>
            <div><small>Visit</small><b>{form.visit_place || '—'}</b></div>
            <div><small>Days</small><b>{form.visit_days || '—'}</b></div>
          </div>
        </Tilt>
        <Orbit done={doneSteps.slice(0, 3).filter(Boolean).length} total={3} hint={open.length ? `Still open: ${open.join(', ')}` : 'Ready to save.'} />
      </>}>

      {step === 0 && <>
        <StepHead title="Which embassy is the letter for?" desc="The embassy and the request details." />
        <div className="zrv-hr-grid zrv-hr-is-4">
          {input('ref_no', 'Reference no.', { required: true })}
          {input('letter_date', 'Letter date', { type: 'date', required: true })}
          {select('division_id', 'Division', lookups.divisions, { required: true })}
          {select('status', 'Status', STATUSES.map((value) => ({ value, label: value === 'FINAL' ? 'Final' : 'Draft' })))}
        </div>
        <h3 className="zrv-hr-subh">Embassy and request</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {select('embassy', 'Embassy', lookups.embassies, { onChange: pickEmbassy })}
          {input('embassy_ar', <Bi en="Embassy, in Arabic" ar="السفارة" />, { ar: true })}
          {select('request_for', 'Request for', lookups.requestFor)}
        </div>
      </>}

      {step === 1 && <>
        <StepHead title="Who is travelling?" desc="Details come from the employee master; correct any of them for the letter." />
        <h3 className="zrv-hr-subh">Identity</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          <EmployeePicker id="bvl-employee" label="Employee" required tight value={picked ?? (form.employee_name ? { employeeId: form.employee_name, employeeNumber: '', name: form.employee_name } : null)}
            onPick={selectEmployee} error={errors.employee_name} cacheKey="hr-business-visa-letter-employees" placeholder="Type an employee number or name…" disabled={locked}
            searchService={(term, options) => service.searchEmployees(term, options)} />
          {input('employee_name', 'Name on the letter', { required: true })}
          {input('nationality', 'Nationality')}
          {input('nationality_ar', <Bi en="Nationality, in Arabic" ar="الجنسية" />, { ar: true })}
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
          {input('job_title_ar', <Bi en="Job title, in Arabic" ar="المسمى الوظيفي" />, { ar: true })}
          {input('employed_since', 'Employed since', { type: 'date' })}
          {input('contract_expiry', 'Contract expiry', { type: 'date' })}
          {input('contract_nature', 'Contract nature')}
          {input('contract_nature_ar', <Bi en="Contract nature, in Arabic" ar="نوع العقد" />, { ar: true })}
          {input('monthly_salary', 'Monthly salary (SR)', { type: 'number' })}
        </div>
      </>}

      {step === 2 && <>
        <StepHead title="What is the visit for?" desc="The purpose of the visit and the undertaking." />
        <div className="zrv-hr-grid zrv-hr-is-4">
          {input('visit_place', 'Visit place')}
          {input('visit_days', 'Days', { type: 'number' })}
          {input('visit_purpose', 'Purpose')}
          {input('visit_purpose_ar', <Bi en="Purpose, in Arabic" ar="غرض الزيارة" />, { ar: true })}
        </div>
        <h3 className="zrv-hr-subh">Undertaking</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {input('expense_borne_by', 'Expenses borne by')}
          {input('expense_employee_name', 'Expenses for', { placeholder: 'Defaults to the employee' })}
          {input('return_employee_name', 'Returning employee', { placeholder: 'Defaults to the employee' })}
          {input('return_statement', 'Return statement', { wide: true })}
          {input('closing_text', 'Closing text', { wide: true })}
        </div>
      </>}

      {step === 3 && <>
        <StepHead title="Does the letter read correctly?" desc="The letter as entered, in English and Arabic." />
        <LetterPreview form={form} />
      </>}
    </RecruitmentShell>
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}

// A filled value, or a highlighted gap.
const V = ({ value, empty = '…' }) => <mark className={String(value ?? '').trim() ? undefined : 'zrv-hr-is-empty'}>{String(value ?? '').trim() || empty}</mark>
const date = (value) => (value ? enDate(value) : '')

function LetterPreview({ form: f }) {
  const name = f.employee_name
  return (
    <div className="zrv-hr-bvl-preview">
      <article className="zrv-hr-bvl-page" lang="en" aria-label="English letter">
        <p>To,</p>
        <p><b>His Excellency Consul General,</b><br /><V value={f.embassy} empty="Embassy" /><br /><b>Riyadh - Kingdom of Saudi Arabia</b><br /><b>With Compliments,</b></p>
        <p className="zrv-hr-bvl-subject">SUB: REQUEST FOR VISIT VISA</p>
        <p>We hereby certify that Mr. <V value={name} /> (<V value={f.nationality} /> National) holder of Passport No. <V value={f.passport_no} /> dated <V value={date(f.passport_date)} /> and ID No. <V value={f.id_no} />, Expiration Date <V value={date(f.id_expiration_date)} />.</p>
        <p>He is employed by our company as a <V value={f.job_title} /> since <V value={date(f.employed_since)} /> until present, and his contract will expire on <V value={date(f.contract_expiry)} />.</p>
        <p>The nature of the contract is <V value={f.contract_nature} /> and he is drawing a monthly salary of SR <V value={f.monthly_salary} /> only.</p>
        <p>Mr. <V value={name} /> will visit <V value={f.visit_place} /> for <V value={f.visit_days} /> days for <V value={f.visit_purpose} /></p>
        <p>In view of the above, we kindly request your esteemed office to facilitate and grant the required visa. We hereby affirm that all expenses called for in relation with Mr. <V value={f.expense_employee_name || name} /> shall be borne by the <V value={f.expense_borne_by} />.</p>
        <p>We hereby certify that Mr. <V value={f.return_employee_name || name} /> will <V value={f.return_statement} /></p>
        <p className="zrv-hr-bvl-close">{f.closing_text || 'Anticipating your assistance in this regard.'}</p>
      </article>
      <article className="zrv-hr-bvl-page" lang="ar" dir="rtl" aria-label="الخطاب العربي">
        <p>إلى</p>
        <p>سعادة القنصل العام،<br /><V value={f.embassy_ar} empty="السفارة" /> المحترم،،<br />الرياض - المملكة العربية السعودية<br />بعد التحية،،</p>
        <p className="zrv-hr-bvl-subject">الموضوع: طلب تأشيرة زيارة عمل</p>
        <p>بهذا نفيدكم بأن السيد / <V value={name} /> <V value={f.nationality_ar} /> الجنسية بموجب جواز سفر رقم <V value={f.passport_no} /> والصادر بتاريخ <V value={date(f.passport_date)} />.</p>
        <p>وحامل بطاقة هوية رقم <V value={f.id_no} /> وتنتهي بتاريخ <V value={date(f.id_expiration_date)} /> ويعمل لدينا بوظيفة <V value={f.job_title_ar} /> منذ <V value={date(f.employed_since)} />.</p>
        <p>تاريخ انتهاء العقد <V value={date(f.contract_expiry)} /> ونوع العقد <V value={f.contract_nature_ar} /> ويتقاضى راتب شهري وقدره <V value={f.monthly_salary} /> ريال فقط.</p>
        <p>كما أن السيد / <V value={name} /> سوف يقوم بزيارة <V value={f.visit_place} /> لمدة <V value={f.visit_days} /> أيام في <V value={f.visit_purpose_ar} />.</p>
        <p>وبناءً على ما ذكر أعلاه نرجو من سعادتكم التكرم بمنح السيد / <V value={f.expense_employee_name || name} /> تأشيرة الزيارة المطلوبة، كما نفيدكم بأن الشركة تتعهد بتحمل جميع المصاريف المتعلقة بالسيد / <V value={f.expense_employee_name || name} />.</p>
        <p>وكما تتعهد الشركة بعودة السيد / <V value={f.return_employee_name || name} /> إلى المملكة العربية السعودية لمزاولة عمله مرة أخرى.</p>
        <p className="zrv-hr-bvl-close">شاكرين ومقدرين تعاونكم معنا في هذا الشأن.</p>
      </article>
    </div>
  )
}
