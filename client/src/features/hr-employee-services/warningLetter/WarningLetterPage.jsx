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
import { LETTERS_BREADCRUMB, WARNING_LETTER_PATHS as PATHS } from '../employeeServicesPaths.js'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'
import '@/styles/hr-warning-letter.css'
import {
  REASONS, RESOURCE, TEXT_MAX, blankLetter, letterFormOf, validateLetter, warningLetterService as service,
} from './warningLetterService.js'

// The legacy Warning_letter form (views/warning/form.php): the employee, the
// reasons (English and Arabic) and the action and letters.
const TITLE = 'Warning Letter'
const STEPS = ['Employee', 'Reasons', 'Action']
const SAVE = 'Save warning letter'
const STEP_OF = { employee: 0, warDate: 0, reasons: 1, othersText: 1, othersTextAr: 1, actionText: 2, actionTextAr: 2, warningComment: 2, otherComment: 2 }

// A label in both languages.
const Bi = ({ en, ar }) => <>{en} <span className="zrv-hr-wl-ar" lang="ar" dir="rtl">{ar}</span></>

export default function WarningLetterPage() {
  return (
    <RecruitmentLoader current="warning-letter" flow={false} breadcrumb={LETTERS_BREADCRUMB} identify={() => {}}
      title={TITLE} param="letterId" load={service.getById} loadLookups={async () => ({})}>
      {({ record, editorKey }) => <LetterEditor key={editorKey} initial={record} />}
    </RecruitmentLoader>
  )
}

function LetterEditor({ initial }) {
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

  const clear = (...keys) => setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key))))
  const set = (key, ...also) => (event) => { editor.set(key)(event); clear(key, ...also) }
  const toggle = (key, ...also) => (event) => { patch({ [key]: event.target.checked }); clear(key, ...also) }
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
  const open = STEPS.filter((_, index) => !doneSteps[index])
  const warningNo = record?.warningNo || employee?.nextWarningNo
  const readOnly = (id, label, value, placeholder = C.fillsFromEmployee) => (
    <HrField id={id} label={label}><input id={id} className="ux-input zrv-hr-input" readOnly value={value ?? ''} placeholder={placeholder} /></HrField>
  )
  const textField = (key, label, { ar = false, required = false } = {}) => (
    <HrField id={`wl-${key}`} label={label} required={required} wide error={errors[key]}>
      <input {...fieldProps(`wl-${key}`, { error: errors[key] })} className="ux-input zrv-hr-input" dir={ar ? 'rtl' : undefined} lang={ar ? 'ar' : undefined}
        maxLength={TEXT_MAX} value={form[key]} onChange={set(key, 'reasons')} readOnly={locked} />
    </HrField>
  )
  const letter = (flag, comment, en, ar) => (
    <div className="zrv-hr-wl-letter">
      <label className={`zrv-hr-wl-check${form[flag] ? ' zrv-hr-is-on' : ''}`}>
        <input type="checkbox" checked={form[flag]} onChange={toggle(flag, comment)} disabled={locked} />
        <span><Bi en={en} ar={ar} /></span>
      </label>
      {form[flag] && <HrField id={`wl-${comment}`} label="Comment" required error={errors[comment]}>
        <input {...fieldProps(`wl-${comment}`, { error: errors[comment] })} className="ux-input zrv-hr-input" dir="auto" aria-required="true" maxLength={TEXT_MAX}
          value={form[comment]} onChange={set(comment)} readOnly={locked} placeholder="Enter comment" />
      </HrField>}
    </div>
  )

  return <>
    <RecruitmentShell current="warning-letter" flow={false} compact breadcrumb={LETTERS_BREADCRUMB} title={TITLE}
      tools={tools} primary={{ label: SAVE, icon: 'save', onClick: save }} locked={locked} pending={editor.pending} focusError={editor.focusError}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss}
      steps={[
        [STEPS[0], employee ? employee.employeeNo : 'Choose employee'],
        [STEPS[1], hasReason ? `${reasons.length + (form.othersText.trim() || form.othersTextAr.trim() ? 1 : 0)} ticked` : 'At least one'],
        [STEPS[2], [form.warningLetter && 'Warning letter', form.otherLetter && 'Other letter'].filter(Boolean).join(' · ') || 'Optional'],
      ]}
      step={step} onStep={setStep} doneSteps={doneSteps} finalLabel={SAVE} onFinal={save}
      side={<>
        <Tilt aria-label="Warning letter card">
          <div className="zrv-hr-dark__top"><span className="zrv-hr-mono">{record?.referenceNo || 'Draft'}</span><span className="zrv-hr-dark__status">{record ? 'Saved' : 'Not saved'}</span></div>
          <div className="zrv-hr-dark__who"><span className="zrv-hr-dark__av" aria-hidden="true">{initials(employee?.name)}</span><div>
            <h3 className={`zrv-hr-dark__title${employee ? '' : ' zrv-hr-is-empty'}`}>{employee?.name || 'Employee'}</h3>
            <div className={`zrv-hr-dark__sub${employee?.position ? '' : ' zrv-hr-is-empty'}`}>{employee?.position || 'Position'}</div></div></div>
          <div className="zrv-hr-dark__badges">
            {warningNo && <span className="zrv-hr-is-solid">Warning no. {warningNo}</span>}
            {employee?.division && <span>{employee.division}</span>}
          </div>
          <div className="zrv-hr-dark__grid">
            <div><small>Date</small><b>{form.warDate ? enDate(form.warDate) : '—'}</b></div>
            <div><small>Employee no.</small><b>{employee?.employeeNo || '—'}</b></div>
            <div><small>Reasons</small><b>{reasons.length + (form.othersText.trim() || form.othersTextAr.trim() ? 1 : 0)}</b></div>
            <div><small>Letters</small><b>{[form.warningLetter, form.otherLetter].filter(Boolean).length}</b></div>
          </div>
        </Tilt>
        <Orbit done={doneSteps.filter(Boolean).length} total={STEPS.length} hint={open.length ? `Still open: ${open.join(', ')}` : 'Ready to save.'} />
      </>}>

      {step === 0 && <>
        <StepHead title="Who receives the warning?" desc="The warning date and number, and the employee." />
        <h3 className="zrv-hr-subh">Letter</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          <HrField id="wl-date" label={<Bi en="Warning date" ar="التاريخ" />} required error={errors.warDate}>
            <input {...fieldProps('wl-date', { error: errors.warDate })} type="date" className="ux-input zrv-hr-input" aria-required="true" value={form.warDate} onChange={set('warDate')} readOnly={locked} />
          </HrField>
          {readOnly('wl-ref', <Bi en="Ref. no." ar="رقم المرجع" />, record?.referenceNo, C.generated)}
          {readOnly('wl-no', <Bi en="Warning no." ar="رقم الإنذار" />, warningNo, 'From the employee')}
        </div>
        <h3 className="zrv-hr-subh">Employee</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {record
            ? readOnly('wl-emp', <Bi en="Employee no." ar="الرقم الوظيفي" />, employee?.employeeNo)
            : <EmployeePicker id="wl-employee" label="Employee no." required tight value={employee ? { employeeId: employee.employeeNo, employeeNumber: employee.employeeNo, name: employee.name } : null}
              onPick={selectEmployee} error={errors.employee} cacheKey="hr-warning-letter-employees" placeholder="Search by number or name…" disabled={locked}
              searchService={(term, options) => service.searchEmployees(term, options)} />}
          {readOnly('wl-name', <Bi en="Full name" ar="اسم الموظف" />, employee?.name)}
          {readOnly('wl-division', 'Division', employee?.division)}
          {readOnly('wl-position', <Bi en="Position" ar="الوظيفة" />, employee?.position)}
        </div>
      </>}

      {step === 1 && <>
        <StepHead title="Why is the warning given?" desc="Tick each reason that applies, or describe it under Others." />
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
          {textField('othersTextAr', <Bi en="Others (Arabic)" ar="أخرى" />, { ar: true })}
        </div>
      </>}

      {step === 2 && <>
        <StepHead title="What action follows?" desc="The action in Arabic, then the letters to print." />
        <div className="zrv-hr-grid">
          {textField('actionText', 'Action (English)')}
          {textField('actionTextAr', <Bi en="Action (Arabic)" ar="الإجراء" />, { ar: true })}
        </div>
        <h3 className="zrv-hr-subh">Letters</h3>
        <div className="zrv-hr-wl-letters">
          {letter('warningLetter', 'warningComment', 'Warning letter', 'إنذار كتابي')}
          {letter('otherLetter', 'otherComment', 'Other letter', 'خطاب آخر')}
        </div>
      </>}
    </RecruitmentShell>
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}
