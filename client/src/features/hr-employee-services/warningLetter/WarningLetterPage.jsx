import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import usePermissions from '@/features/access/usePermissions.js'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { businessToday } from '@/features/hr-recruitment/shared/hrFormat.js'
import { useRecruitmentForm } from '@/features/hr-recruitment/shared/useRecruitmentForm.js'
import { NewFormDialog } from '@/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx'
import { RecruitmentLoader } from '@/features/hr-recruitment/shared/components/RecruitmentLoader.jsx'
import { HrField } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
import { EmployeePicker } from '@/features/hr-recruitment/shared/components/EmployeePicker.jsx'
import { RecruitmentShell } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { LETTERS_BREADCRUMB, WARNING_LETTER_PATHS as PATHS } from '../employeeServicesPaths.js'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'
import '@/styles/hr-warning-letter.css'
import { warmEmployeeList } from '../shared/employeeList.js'
import { NO_IDENTIFY } from '../shared/useEmployeeServicesUser.js'
import {
  REASONS, RESOURCE, TEXT_MAX, blankLetter, letterFormOf, validateLetter, warningLetterService as service,
} from './warningLetterService.js'
import PreviewLanguageSwitch from '../shared/PreviewLanguageSwitch.jsx'
import WarningLetterPreview from './WarningLetterPreview.jsx'

// The legacy Warning_letter form (views/warning/form.php): the employee, the
// reasons (English and Arabic) and the action and letters. A short form, so one
// compact page with anchored sections (as Sick Leave) and the live letter beside
// it (the letter is also what gets printed).
const TITLE = 'Warning Letter'
const SECTIONS = ['Employee', 'Reasons', 'Action']
const SAVE = 'Save warning letter'
const SECTION_OF = { employee: 0, warDate: 0, reasons: 1, othersText: 1, othersTextAr: 1, actionText: 2, actionTextAr: 2, warningComment: 2, otherComment: 2 }

export default function WarningLetterPage() {
  return (
    <RecruitmentLoader current="warning-letter" flow={false} breadcrumb={LETTERS_BREADCRUMB} identify={NO_IDENTIFY}
      title={TITLE} param="letterId" load={service.getById} loadLookups={(signal) => {
        // Opening Emp# lists employees without a request.
        warmEmployeeList(service, { signal })
        return {}
      }}>
      {({ record, editorKey }) => <LetterEditor key={editorKey} initial={record} />}
    </RecruitmentLoader>
  )
}

function LetterEditor({ initial }) {
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

  const clear = (...keys) => setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key))))
  const set = (key, ...also) => (event) => { editor.set(key)(event); clear(key, ...also) }
  const toggle = (key, ...also) => (event) => { patch({ [key]: event.target.checked }); clear(key, ...also) }
  // Unticking a letter clears its comment too (the server enforces the same).
  const toggleLetter = (flag, comment) => (event) => {
    const checked = event.target.checked
    patch({ [flag]: checked, ...(checked ? {} : { [comment]: '' }) })
    clear(flag, comment)
  }
  // Legacy get_employee_details: name, division, position and the next warning number.
  const selectEmployee = async (item) => {
    const request = ++employeeRequest.current
    clear('employee')
    try {
      const details = await service.employee(item.employeeNumber)
      if (request === employeeRequest.current) patch({ employee: details })
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
    document.getElementById(`wl-section-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const scrollToSection = (index) => requestAnimationFrame(() => document.getElementById(`wl-section-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))

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
    }, { success: (result) => `Warning letter ${result.referenceNo || result.letterId} saved.` })
  }
  const leave = (path) => (editor.dirty && !locked ? setDialog({ path }) : navigate(path))
  const tools = [
    { icon: 'printer', label: C.print, onClick: () => window.print() },
    { icon: 'chart-column', label: 'Report', onClick: () => leave(PATHS.report) },
    { icon: 'file-plus', label: 'New letter', onClick: () => leave(PATHS.form) },
    { icon: 'house', label: C.home, onClick: () => leave('/dashboard') },
  ]

  const reasons = REASONS.filter((item) => form[item.key])
  const hasReason = reasons.length > 0 || Boolean(form.othersText.trim() || form.othersTextAr.trim())
  const lettersDone = (!form.warningLetter || form.warningComment.trim()) && (!form.otherLetter || form.otherComment.trim())
  const doneSteps = [Boolean(employee && form.warDate), hasReason, Boolean(lettersDone)]
  const warningNo = record?.warningNo || employee?.nextWarningNo
  const reasonCount = reasons.length + (form.othersText.trim() || form.othersTextAr.trim() ? 1 : 0)
  const letterNames = [form.warningLetter && 'Warning letter', form.otherLetter && 'Other letter'].filter(Boolean)
  const readOnly = (id, label, value, placeholder = C.fillsFromEmployee) => (
    <HrField id={id} label={label}><input id={id} className="ux-input zrv-hr-input" readOnly value={value ?? ''} placeholder={placeholder} /></HrField>
  )
  const textField = (key, label, { ar = false, required = false } = {}) => (
    <HrField id={`wl-${key}`} label={label} required={required} wide error={errors[key]}>
      <input {...fieldProps(`wl-${key}`, { error: errors[key] })} className="ux-input zrv-hr-input" dir={ar ? 'rtl' : undefined} lang={ar ? 'ar' : undefined}
        maxLength={TEXT_MAX} value={form[key]} onChange={set(key, 'reasons')} readOnly={locked} />
    </HrField>
  )
  const letter = (flag, comment, label) => (
    <div className="zrv-hr-wl-letter">
      <label className={`zrv-hr-wl-check${form[flag] ? ' zrv-hr-is-on' : ''}`}>
        <input type="checkbox" checked={form[flag]} onChange={toggleLetter(flag, comment)} disabled={locked} />
        <span>{label}</span>
      </label>
      {form[flag] && <HrField id={`wl-${comment}`} label="Comment" required error={errors[comment]}>
        <input {...fieldProps(`wl-${comment}`, { error: errors[comment] })} className="ux-input zrv-hr-input" dir="auto" aria-required="true" maxLength={TEXT_MAX}
          value={form[comment]} onChange={set(comment)} readOnly={locked} placeholder="Enter comment" />
      </HrField>}
    </div>
  )

  return <>
    <RecruitmentShell current="warning-letter" flow={false} compact singlePage breadcrumb={LETTERS_BREADCRUMB} title={TITLE}
      tools={tools} primary={{ label: SAVE, icon: 'save', onClick: save }} locked={locked} pending={editor.pending} focusError={editor.focusError}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss}
      steps={[
        [SECTIONS[0], employee ? employee.employeeNo : 'Choose employee'],
        [SECTIONS[1], hasReason ? `${reasonCount} ticked` : 'At least one'],
        [SECTIONS[2], letterNames.join(' · ') || 'Optional'],
      ]}
      step={step} onStep={goToSection} doneSteps={doneSteps}
      side={<>
        <div className="zrv-hr-side__h">
          <span className="zrv-hr-side__t"><span className="zrv-hr-eyebrow">Preview</span></span>
          <PreviewLanguageSwitch value={language} onChange={setLanguage} />
        </div>
        <WarningLetterPreview form={form} record={record} employee={employee} warningNo={warningNo} language={language} />
      </>}>

      <section id="wl-section-0" className="zrv-hr-esf-section">
        <div className="zrv-hr-esf-sectionhead">
          <h2>Employee</h2>
          <span className="zrv-hr-esf-count" role="status">{employee ? employee.employeeNo : 'Choose employee'}</span>
        </div>
        <div className="zrv-hr-grid zrv-hr-is-4">
          <HrField id="wl-date" label="Warning date" required error={errors.warDate}>
            <input {...fieldProps('wl-date', { error: errors.warDate })} type="date" className="ux-input zrv-hr-input" aria-required="true" value={form.warDate} onChange={set('warDate')} readOnly={locked} />
          </HrField>
          {readOnly('wl-ref', 'Ref. no.', record?.referenceNo, C.generated)}
          {readOnly('wl-no', 'Warning no.', warningNo, 'From the employee')}
          {record
            ? readOnly('wl-emp', 'Employee no.', employee?.employeeNo)
            : <EmployeePicker id="wl-employee" label="Employee no." required tight value={employee ? { employeeId: employee.employeeNo, employeeNumber: employee.employeeNo, name: employee.name } : null}
              onPick={selectEmployee} error={errors.employee} cacheKey="hr-warning-letter-employees" placeholder="Search by number or name…" disabled={locked}
              searchService={(term, options) => service.searchEmployees(term, options)} />}
        </div>
        <div className="zrv-hr-grid zrv-hr-is-4 zrv-hr-mt">
          {readOnly('wl-name', 'Full name', employee?.name)}
          {readOnly('wl-division', 'Division', employee?.division)}
          {readOnly('wl-position', 'Position', employee?.position)}
        </div>
      </section>

      <section id="wl-section-1" className={`zrv-hr-esf-card zrv-hr-mt${step === 1 ? ' zrv-hr-is-focus' : ''}`}>
        <div className="zrv-hr-esf-sectionhead">
          <h2>Reasons</h2>
          <span className="zrv-hr-esf-count" role="status">{reasonCount} ticked</span>
        </div>
        <div className={`zrv-hr-wl-reasons${errors.reasons ? ' zrv-hr-is-bad' : ''}`} role="group" aria-label="Reasons">
          {REASONS.map((item) => (
            <label key={item.key} className={`zrv-hr-wl-check${form[item.key] ? ' zrv-hr-is-on' : ''}`}>
              <input type="checkbox" checked={form[item.key]} onChange={toggle(item.key, 'reasons')} disabled={locked} />
              <span><b>{item.en}</b><small lang="ar" dir="rtl">{item.ar}</small></span>
            </label>
          ))}
        </div>
        {errors.reasons && <p className="zrv-auth-field-error" role="alert">{errors.reasons}</p>}
        <h3 className="zrv-hr-subh">Others</h3>
        <div className="zrv-hr-grid">
          {textField('othersText', 'Others (English)')}
          {textField('othersTextAr', 'Others (Arabic)', { ar: true })}
        </div>
      </section>

      <section id="wl-section-2" className={`zrv-hr-esf-card zrv-hr-mt${step === 2 ? ' zrv-hr-is-focus' : ''}`}>
        <div className="zrv-hr-esf-sectionhead">
          <h2>Action</h2>
          <span className="zrv-hr-esf-count" role="status">{letterNames.join(' · ') || 'Optional'}</span>
        </div>
        <div className="zrv-hr-grid">
          {textField('actionText', 'Action (English)')}
          {textField('actionTextAr', 'Action (Arabic)', { ar: true })}
        </div>
        <h3 className="zrv-hr-subh">Letters</h3>
        <div className="zrv-hr-wl-letters">
          {letter('warningLetter', 'warningComment', 'Warning letter')}
          {letter('otherLetter', 'otherComment', 'Other letter')}
        </div>
      </section>
    </RecruitmentShell>
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}
