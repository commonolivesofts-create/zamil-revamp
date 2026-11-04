import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import usePermissions from '@/features/access/usePermissions.js'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { businessToday, enDate, initials } from '@/features/hr-recruitment/shared/hrFormat.js'
import { useRecruitmentForm } from '@/features/hr-recruitment/shared/useRecruitmentForm.js'
import { NewFormDialog } from '@/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx'
import { RecruitmentLoader } from '@/features/hr-recruitment/shared/components/RecruitmentLoader.jsx'
import { HrField, RadioCards } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
import { EmployeePicker } from '@/features/hr-recruitment/shared/components/EmployeePicker.jsx'
import { Orbit, RecruitmentShell, StepHead, Tilt } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { LETTERS_BREADCRUMB, SALARY_CERTIFICATE_PATHS as PATHS } from '../employeeServicesPaths.js'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'
import '@/styles/hr-salary-certificate.css'
import { LANGUAGES, TO_MAX, salaryCertificateService as service, validateCertificate } from './salaryCertificateService.js'

// The legacy forms Salary_cert (English) and Salary_cert_arabic (Arabic) as one
// screen: the language picks the API and the stored language of the certificate.
const TITLE = 'Salary Certificate'
const STEPS = ['Employee', 'Salary', 'Certificate']
const SAVE = 'Save certificate'
const STEP_OF = { language: 0, employee: 0, certDate: 2, toEmpName: 2, approvalName: 2 }
const SALARY_ROWS = Object.freeze([
  ['basicSalary', 'Basic salary', 'الراتب الأساسي'], ['housingAllowance', 'Housing allowance', 'بدل سكن'],
  ['transportAllowance', 'Transportation allowance', 'بدل مواصلات'], ['commAllowance', 'Communication allowance', 'بدل اتصال'],
  ['carAllowance', 'Car allowance', 'بدل سيارة'],
])
const money = (value) => (value == null ? '' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value))

// A label in both languages.
const Bi = ({ en, ar }) => <>{en} <span className="zrv-hr-sc-ar" lang="ar" dir="rtl">{ar}</span></>

export default function SalaryCertificatePage() {
  return (
    <RecruitmentLoader current="salary-certificate" flow={false} breadcrumb={LETTERS_BREADCRUMB} identify={() => {}}
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
    basePath: PATHS.form, idKey: 'certificateId', record: initial,
    initialForm: initial
      ? { language: initial.language, employee: initial.employee, certDate: initial.certDate, toEmpName: initial.toEmpName, approvalName: initial.approvalName }
      : { language: firstLanguage, employee: null, certDate: businessToday(), toEmpName: '', approvalName: '' },
  })
  const { form, patch, step, setStep, record } = editor
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const employeeRequest = useRef(0)
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
          : 'The employee details could not be loaded. Try again.'
      patch({ employee: null })
      setErrors((current) => ({ ...current, employee: message }))
    }
  }

  const save = () => {
    if (locked) return
    const next = validateCertificate(form, { approvers: approverList })
    setErrors(next)
    const keys = Object.keys(next)
    if (keys.length) {
      editor.reject(Math.min(...keys.map((key) => STEP_OF[key] ?? 0)), keys.length === 1 ? next[keys[0]] : C.reviewProblems(keys.length),
        keys.length === 1 ? [] : Object.values(next))
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
  const filled = [employee, form.certDate, form.toEmpName.trim(), form.approvalName].filter(Boolean).length
  const open = STEPS.filter((_, index) => index !== 1 && !doneSteps[index])
  const readOnly = (id, en, ar, value, { dir = lang.dir, placeholder = C.fillsFromEmployee } = {}) => (
    <HrField id={id} label={<Bi en={en} ar={ar} />}>
      <input id={id} className="ux-input zrv-hr-input" readOnly dir={value ? dir : undefined} value={value ?? ''} placeholder={placeholder} />
    </HrField>
  )
  const languageOptions = Object.values(LANGUAGES).map((item) => ({ value: item.code, title: item.native, desc: item.code === 'ar' ? 'Arabic names and titles' : 'English names and titles', lang: item.code === 'ar' ? 'ar' : undefined }))

  return <>
    <RecruitmentShell current="salary-certificate" flow={false} compact breadcrumb={LETTERS_BREADCRUMB} title={TITLE}
      tools={tools} primary={{ label: SAVE, icon: 'save', onClick: save }} locked={locked} pending={editor.pending} focusError={editor.focusError}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss}
      steps={[[STEPS[0], employee ? lang.label : 'Choose employee'], [STEPS[1], employee ? `${money(employee.totalSalary)} SAR` : 'From the master'], [STEPS[2], `${certificateDone}/3 required`]]}
      step={step} onStep={setStep} doneSteps={doneSteps} finalLabel={SAVE} onFinal={save}
      side={<>
        <Tilt aria-label="Certificate card">
          <div className="zrv-hr-dark__top"><span className="zrv-hr-mono">{record?.refNo || 'Draft'}</span><span className="zrv-hr-dark__status">{record ? record.status === 'DRAFT' ? 'Draft' : record.status : 'Not saved'}</span></div>
          <div className="zrv-hr-dark__who"><span className="zrv-hr-dark__av" aria-hidden="true">{initials(employee?.nameOther || employee?.name)}</span><div>
            <h3 className={`zrv-hr-dark__title${employee ? '' : ' zrv-hr-is-empty'}`} dir={employee ? lang.dir : undefined}>{employee?.name || 'Employee'}</h3>
            <div className={`zrv-hr-dark__sub${employee ? '' : ' zrv-hr-is-empty'}`} dir={employee ? lang.dir : undefined}>{employee?.jobTitle || 'Job title'}</div></div></div>
          <div className="zrv-hr-dark__badges">
            <span className="zrv-hr-is-solid" lang={form.language}>{lang.native}</span>
            {employee?.division && <span>{employee.division}</span>}
          </div>
          <div className="zrv-hr-dark__grid">
            <div><small>Total salary</small><b>{employee ? money(employee.totalSalary) : '—'}<em> SAR</em></b></div>
            <div><small>Basic</small><b>{employee ? money(employee.basicSalary) : '—'}</b></div>
            <div><small>Joined</small><b>{employee?.joiningDate ? enDate(employee.joiningDate) : '—'}</b></div>
            <div><small>To</small><b>{form.toEmpName.trim() || '—'}</b></div>
          </div>
        </Tilt>
        <Orbit done={filled} total={4} hint={open.length ? `Still open: ${open.join(', ')}` : 'Ready to save.'} />
      </>}>

      {step === 0 && <>
        <StepHead title="Who is the certificate for?" desc="Choose the language and the employee; their details fill in from the employee master." />
        <div className={errors.language ? 'zrv-hr-is-bad' : undefined}>
          {record
            ? <p className="zrv-hr-sc-lang">Certificate language: <b lang={form.language}>{lang.native}</b> <small>(fixed once saved)</small></p>
            : <RadioCards name="sc-language" label={<Bi en="Certificate language" ar="لغة الشهادة" />} options={languageOptions} value={form.language} onChange={pickLanguage} />}
          {errors.language && <p className="zrv-auth-field-error" role="alert">{errors.language}</p>}
        </div>
        <h3 className="zrv-hr-subh"><Bi en="Personal information" ar="المعلومات الشخصية" /></h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          <EmployeePicker id="sc-employee" label="Employee no." required tight value={employee ? { employeeId: employee.employeeNo, employeeNumber: employee.employeeNo, name: employee.employeeNo } : null}
            onPick={selectEmployee} error={errors.employee} cacheKey={`hr-salary-cert-employees:${form.language}`} placeholder="Type an employee number…" disabled={locked}
            searchService={(term, options) => service.searchEmployees(form.language, term, options)} />
          {readOnly('sc-name', 'Name', 'الاسم', employee?.name)}
          {readOnly('sc-nationality', 'Nationality', 'الجنسية', employee?.nationality)}
          {readOnly('sc-id', 'ID / passport no.', 'رقم الهوية', employee?.nationalIdentifier, { dir: 'ltr' })}
        </div>
        <h3 className="zrv-hr-subh"><Bi en="Job information" ar="معلومات الوظيفة" /></h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {readOnly('sc-title', 'Job title', 'المسمى الوظيفي', employee?.jobTitle)}
          {readOnly('sc-joined', 'Joining date', 'تاريخ التعيين', employee?.joiningDate ? enDate(employee.joiningDate) : '', { dir: 'ltr' })}
          {readOnly('sc-division', 'Division', 'القسم', employee?.division, { dir: 'ltr' })}
          {employee?.nameOther && readOnly('sc-name-en', 'Name in English', 'الاسم بالإنجليزية', employee.nameOther, { dir: 'ltr' })}
        </div>
      </>}

      {step === 1 && <>
        <StepHead title="What does the salary include?" desc="From the employee master; amounts in SAR." />
        <h3 className="zrv-hr-subh"><Bi en="Salary details" ar="معلومات الراتب" /></h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {SALARY_ROWS.map(([key, en, ar]) => readOnly(`sc-${key}`, en, ar, employee ? money(employee[key]) : '', { dir: 'ltr' }))}
          {readOnly('sc-allowance', 'Allowances', 'بدل', employee ? (employee.allowanceFlag === 'Yes' ? 'Yes · نعم' : 'No · لا') : '', { dir: 'ltr' })}
          {readOnly('sc-total', 'Total salary', 'إجمالي الراتب', employee ? money(employee.totalSalary) : '', { dir: 'ltr' })}
        </div>
      </>}

      {step === 2 && <>
        <StepHead title="Who is the certificate addressed to?" desc="The date, the addressee and the approver." />
        <h3 className="zrv-hr-subh"><Bi en="Certificate" ar="الشهادة" /></h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          <HrField id="sc-date" label={<Bi en="Date" ar="التاريخ" />} required error={errors.certDate}>
            <input {...fieldProps('sc-date', { error: errors.certDate })} type="date" className="ux-input zrv-hr-input" aria-required="true" value={form.certDate} onChange={set('certDate')} />
          </HrField>
          <HrField id="sc-to" label={<Bi en="To" ar="إلى" />} required wide error={errors.toEmpName}>
            <input {...fieldProps('sc-to', { error: errors.toEmpName })} className="ux-input zrv-hr-input" aria-required="true" dir="auto" maxLength={TO_MAX}
              value={form.toEmpName} onChange={set('toEmpName')} placeholder="e.g. the bank or embassy" />
          </HrField>
          {readOnly('sc-ref', 'Ref. no.', 'الرقم', record?.refNo, { dir: 'ltr', placeholder: C.generated })}
        </div>
        <h3 className="zrv-hr-subh"><Bi en="Approval" ar="الموافقة" /></h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          <HrField id="sc-approver" label={<Bi en="Approval name" ar="اسم الموافق" />} required error={errors.approvalName}>
            <select {...fieldProps('sc-approver', { error: errors.approvalName })} className="ux-select zrv-hr-input" aria-required="true" dir={lang.dir}
              value={form.approvalName} onChange={set('approvalName')} disabled={approvers.status !== 'ready'}>
              <option value="">{approvers.status === 'error' ? 'Approvers could not be loaded' : approvers.status === 'ready' ? 'Select' : 'Loading…'}</option>
              {approverList.map((item) => <option key={item.employeeNo || item.name} value={item.name}>{item.name}</option>)}
            </select>
          </HrField>
          {readOnly('sc-position', 'Position', 'المسمى الوظيفي', approver?.position || (form.approvalName === record?.approvalName ? record?.approvalPosition : ''), { placeholder: 'Fills from the approver' })}
        </div>
        <ul className="zrv-hr-sc-notes">
          <li><span>This certificate is issued at the employee&apos;s request, without any legal liability on the company or its affiliates.</span><span lang="ar" dir="rtl">تم إصدار هذه الشهادة بناءً على طلبه، دون أي مسؤولية قانونية على الشركة أو الشركات التابعة لها.</span></li>
          <li><span>Valid for one month from the issue date; any alteration cancels it.</span><span lang="ar" dir="rtl">هذه الشهادة صالحة لمدة شهر واحد من تاريخ الإصدار، وأي تعديل يلغيها.</span></li>
        </ul>
      </>}
    </RecruitmentShell>
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}
