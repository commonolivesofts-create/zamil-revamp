import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import usePermissions from '@/features/access/usePermissions.js'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { businessToday, enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { useRecruitmentForm } from '@/features/hr-recruitment/shared/useRecruitmentForm.js'
import { NewFormDialog } from '@/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx'
import { RecruitmentLoader } from '@/features/hr-recruitment/shared/components/RecruitmentLoader.jsx'
import { HrField, RadioCards, SearchableLookup } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
import { EmployeePicker } from '@/features/hr-recruitment/shared/components/EmployeePicker.jsx'
import { RecruitmentShell } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { LETTERS_BREADCRUMB, SALARY_CERTIFICATE_PATHS as PATHS } from '../employeeServicesPaths.js'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'
import { warmEmployeeList } from '../shared/employeeList.js'
import { NO_IDENTIFY } from '../shared/useEmployeeServicesUser.js'
import '@/styles/hr-salary-certificate.css'
import { LANGUAGES, TO_MAX, salaryCertificateService as service, validateCertificate } from './salaryCertificateService.js'
import SalaryCertificatePreview from './SalaryCertificatePreview.jsx'
import { SALARY_ROWS } from './salaryCertificateRows.js'

// The legacy forms Salary_cert (English) and Salary_cert_arabic (Arabic) as one
// screen: the language picks the API and the stored language of the certificate.
// A short form, so one compact page with anchored sections (as Sick Leave) and a
// live preview of the certificate beside it.
const TITLE = 'Salary Certificate'
const SECTIONS = ['Employee', 'Salary', 'Certificate']
const SAVE = 'Save certificate'
const SECTION_OF = { language: 0, employee: 0, certDate: 2, toEmpName: 2, approvalName: 2 }
const NOTES = Object.freeze([
  ['This certificate is issued at the employee’s request, without any legal liability on the company or its affiliates.',
    'تم إصدار هذه الشهادة بناءً على طلبه، دون أي مسؤولية قانونية على الشركة أو الشركات التابعة لها.'],
  ['Valid for one month from the issue date; any alteration cancels it.',
    'هذه الشهادة صالحة لمدة شهر واحد من تاريخ الإصدار، وأي تعديل يلغيها.'],
])
const money = (value) => (value == null ? '' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value))

export default function SalaryCertificatePage() {
  return (
    <RecruitmentLoader current="salary-certificate" flow={false} breadcrumb={LETTERS_BREADCRUMB} identify={NO_IDENTIFY}
      title={TITLE} param="certificateId" load={service.getById} loadLookups={async () => ({})}>
      {({ record, editorKey }) => <CertificateEditor key={editorKey} initial={record} />}
    </RecruitmentLoader>
  )
}

function CertificateEditor({ initial }) {
  const navigate = useNavigate()
  const permissions = usePermissions()
  const allowed = (code, action) => permissions.can(`${LANGUAGES[code].permission}:${action}`)
  const firstLanguage = initial?.language ?? (allowed('en', 'CREATE') || !allowed('ar', 'CREATE') ? 'en' : 'ar')
  const editor = useRecruitmentForm({
    basePath: PATHS.form, idKey: 'certificateId', stepCount: SECTIONS.length, record: initial,
    initialForm: initial
      ? { language: initial.language, employee: initial.employee, certDate: initial.certDate, toEmpName: initial.toEmpName, approvalName: initial.approvalName }
      : { language: firstLanguage, employee: null, certDate: businessToday(), toEmpName: '', approvalName: '' },
  })
  const { form, patch, step, setStep, record } = editor
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const employeeRequest = useRef(0)
  // The employee numbers load with the form (and when the language changes), so opening the
  // field lists them without a request.
  useEffect(() => { warmEmployeeList(service, { lang: form.language }) }, [form.language])
  const lang = LANGUAGES[form.language]
  const canWrite = allowed(form.language, record ? 'UPDATE' : 'CREATE')
  const locked = Boolean(record && record.status !== 'DRAFT') || !canWrite
  const approvers = useResource(`hr-salary-cert-approvers:${form.language}`, (signal) => service.approvers(form.language, { signal }))
  const approverList = approvers.status === 'ready' ? approvers.data : []
  const approver = approverList.find((item) => item.name === form.approvalName)
  const employee = form.employee

  const clear = (...keys) => setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key))))
  const set = (key) => (event) => { editor.set(key)(event); clear(key) }
  // The language decides the API and the stored names, so changing it clears the employee and approver.
  const pickLanguage = (code) => {
    if (!code || code === form.language) return
    if (!allowed(code, 'CREATE')) { setErrors((current) => ({ ...current, language: `You do not have permission for ${LANGUAGES[code].label} certificates.` })); return }
    employeeRequest.current += 1
    patch({ language: code, employee: null, approvalName: '' })
    clear('language', 'employee', 'approvalName')
  }
  const selectEmployee = async (item) => {
    const request = ++employeeRequest.current
    clear('employee')
    try {
      const details = await service.employee(form.language, item.employeeNumber)
      if (request === employeeRequest.current) patch({ employee: details })
    } catch (error) {
      if (request !== employeeRequest.current) return
      const message = error?.code === 'IDENTITY_REQUIRED' ? 'This employee has no ID / passport number in the master.'
        : error?.code === 'EMPLOYEE_DATA_REQUIRED' ? 'This employee’s name, nationality, position or joining date is missing in the master.'
          : error?.code === 'AR_TRANSLATION_REQUIRED' ? 'This employee has no Arabic name, nationality or job title in the master.'
            : error?.code === 'EMPLOYEE_NOT_FOUND' ? 'This employee number is not in the employee master.'
              : error?.code === 'AMBIGUOUS_EMPLOYEE' ? 'This employee number matches more than one master record.'
                : 'The employee details could not be loaded. Try again.'
      patch({ employee: null })
      setErrors((current) => ({ ...current, employee: message }))
    }
  }

  // One page: a tab scrolls to the section it names (as Sick Leave).
  const goToSection = (index) => {
    const next = Math.max(0, Math.min(SECTIONS.length - 1, index))
    setStep(next)
    document.getElementById(`sc-section-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const scrollToSection = (index) => requestAnimationFrame(() => document.getElementById(`sc-section-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))

  const save = () => {
    if (locked) return
    const next = validateCertificate(form, { approvers: approverList })
    setErrors(next)
    const keys = Object.keys(next)
    if (keys.length) {
      const first = Math.min(...keys.map((key) => SECTION_OF[key] ?? 0))
      editor.reject(first, keys.length === 1 ? next[keys[0]] : C.reviewProblems(keys.length))
      scrollToSection(first)
      return
    }
    editor.perform(async ({ saved: keep }) => {
      // The server compares joining date and allowance with the current master: send the current values.
      const fresh = await service.employee(form.language, employee.employeeNo)
      const result = await service.save(editor.recordId, form.language, { ...form, employee: fresh })
      keep(result)
      patch({ employee: result.employee })
      return result
    }, { success: (result) => (result.refNo ? `Salary certificate ${result.refNo} saved.` : 'Salary certificate saved.') })
  }
  const leave = (path) => (editor.dirty && !locked ? setDialog({ path }) : navigate(path))
  const tools = [
    { icon: 'printer', label: C.print, onClick: () => window.print() },
    { icon: 'chart-column', label: 'Report', onClick: () => leave(PATHS.report) },
    { icon: 'file-plus', label: 'New certificate', onClick: () => leave(PATHS.form) },
    { icon: 'house', label: C.home, onClick: () => leave('/dashboard') },
  ]

  const certificateDone = [form.certDate, form.toEmpName.trim(), form.approvalName].filter(Boolean).length
  const doneSteps = [Boolean(employee), Boolean(employee), certificateDone === 3]
  const steps = SECTIONS.map((name, index) => [name, index === 0 ? (employee ? lang.native : 'Choose employee')
    : index === 1 ? (employee ? `${money(employee.totalSalary)} SAR` : 'From the master')
      : doneSteps[2] ? C.step.done : `${certificateDone}/3 required`])
  const readOnly = (id, label, value, { dir = lang.dir, placeholder = C.fillsFromEmployee } = {}) => (
    <HrField id={id} label={label}>
      <input id={id} className="ux-input zrv-hr-input" readOnly dir={value ? dir : undefined} value={value ?? ''} placeholder={placeholder} />
    </HrField>
  )
  const languageOptions = Object.values(LANGUAGES).map((item) => ({
    value: item.code, title: item.native, desc: item.code === 'ar' ? 'Arabic names and titles' : 'English names and titles',
    lang: item.code === 'ar' ? 'ar' : undefined,
  }))

  return <>
    <RecruitmentShell current="salary-certificate" flow={false} compact singlePage breadcrumb={LETTERS_BREADCRUMB} title={TITLE}
      tools={tools} primary={{ label: SAVE, icon: 'save', onClick: save }} locked={locked} pending={editor.pending} focusError={editor.focusError}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss}
      steps={steps} step={step} onStep={goToSection} doneSteps={doneSteps}
      side={<SalaryCertificatePreview form={form} record={record} lang={lang} employee={employee} approver={approver} />}>

      <section id="sc-section-0" className="zrv-hr-esf-section">
        <div className="zrv-hr-esf-sectionhead">
          <h2>Employee</h2>
          <span className="zrv-hr-esf-daypill" role="status" lang={form.language} dir={lang.dir}>{lang.native}</span>
        </div>
        {record
          ? <p className="zrv-hr-sc-lang">Certificate language: <b lang={form.language} dir={lang.dir}>{lang.native}</b> <small>(fixed once saved)</small></p>
          : <RadioCards name="sc-language" label="Certificate language" options={languageOptions} value={form.language} onChange={pickLanguage} error={errors.language} />}
        <div className="zrv-hr-grid zrv-hr-is-4 zrv-hr-mt">
          <EmployeePicker id="sc-employee" label="Employee no." required tight value={employee ? { employeeId: employee.employeeNo, employeeNumber: employee.employeeNo, name: employee.employeeNo } : null}
            onPick={selectEmployee} error={errors.employee} cacheKey={`hr-salary-cert-employees:${form.language}`} placeholder="Type an employee number or name…" disabled={locked}
            searchService={(term, options) => service.searchEmployees(form.language, term, options)} />
          {readOnly('sc-name', 'Name', employee?.name)}
          {readOnly('sc-nationality', 'Nationality', employee?.nationality)}
          {readOnly('sc-id', 'ID / passport no.', employee?.nationalIdentifier, { dir: 'ltr' })}
          {readOnly('sc-title', 'Job title', employee?.jobTitle)}
          {readOnly('sc-joined', 'Joining date', employee?.joiningDate ? enDate(employee.joiningDate) : '', { dir: 'ltr' })}
          {readOnly('sc-division', 'Division', employee?.division, { dir: 'ltr' })}
          {employee?.nameOther && readOnly('sc-name-en', 'Name in English', employee.nameOther, { dir: 'ltr' })}
        </div>
      </section>

      <section id="sc-section-1" className={`zrv-hr-esf-card zrv-hr-mt${step === 1 ? ' zrv-hr-is-focus' : ''}`}>
        <div className="zrv-hr-esf-sectionhead">
          <h2>Salary</h2>
          <span className="zrv-hr-esf-daypill" role="status"><b key={employee?.totalSalary}>{employee ? money(employee.totalSalary) : '—'}</b> SAR</span>
        </div>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {SALARY_ROWS.map(([key, en]) => readOnly(`sc-${key}`, en, employee ? money(employee[key]) : '', { dir: 'ltr' }))}
          {readOnly('sc-allowance', 'Allowances', employee ? (employee.allowanceFlag === 'Yes' ? 'Yes' : 'No') : '', { dir: 'ltr' })}
          {readOnly('sc-total', 'Total salary', employee ? money(employee.totalSalary) : '', { dir: 'ltr' })}
        </div>
      </section>

      <section id="sc-section-2" className={`zrv-hr-esf-card zrv-hr-mt${step === 2 ? ' zrv-hr-is-focus' : ''}`}>
        <div className="zrv-hr-esf-sectionhead">
          <h2>Certificate</h2>
          <span className="zrv-hr-esf-count" role="status">{certificateDone} / 3 required</span>
        </div>
        <div className="zrv-hr-grid zrv-hr-is-3">
          <HrField id="sc-date" label="Date" required error={errors.certDate}>
            <input {...fieldProps('sc-date', { error: errors.certDate })} type="date" className="ux-input zrv-hr-input" aria-required="true" value={form.certDate} onChange={set('certDate')} />
          </HrField>
          <HrField id="sc-to" label="To" required error={errors.toEmpName}>
            <input {...fieldProps('sc-to', { error: errors.toEmpName })} className="ux-input zrv-hr-input" aria-required="true" dir="auto" maxLength={TO_MAX}
              value={form.toEmpName} onChange={set('toEmpName')} placeholder="e.g. the bank or embassy" />
          </HrField>
          {readOnly('sc-ref', 'Ref. no.', record?.refNo, { dir: 'ltr', placeholder: C.generated })}
        </div>
        <div className="zrv-hr-grid zrv-hr-is-3 zrv-hr-mt">
          <HrField id="sc-approver" label="Approval name" required error={errors.approvalName}>
            <SearchableLookup id="sc-approver" value={form.approvalName} required error={errors.approvalName} disabled={approvers.status !== 'ready'}
              loading={approvers.status === 'loading'} loadingLabel="Loading approvers…" onChange={(option) => set('approvalName')(option.code)}
              options={approverList.map((item) => ({ code: item.name, name: item.name, description: item.position }))}
              placeholder={approvers.status === 'error' ? 'Approvers could not be loaded' : 'Search and choose the approver'}
              noResults="No matching approver" maxLength={200} />
          </HrField>
          {readOnly('sc-position', 'Position', approver?.position || (form.approvalName === record?.approvalName ? record?.approvalPosition : ''), { placeholder: 'Fills from the approver' })}
        </div>
        <ul className="zrv-hr-sc-notes">
          {NOTES.map(([en, ar]) => <li key={en}><span>{en}</span><span lang="ar" dir="rtl">{ar}</span></li>)}
        </ul>
      </section>
    </RecruitmentShell>
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}
