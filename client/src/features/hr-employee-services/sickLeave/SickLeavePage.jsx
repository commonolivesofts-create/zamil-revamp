import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import usePermissions from '@/features/access/usePermissions.js'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { businessToday, enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { useRecruitmentForm } from '@/features/hr-recruitment/shared/useRecruitmentForm.js'
import { NewFormDialog } from '@/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx'
import { RecruitmentLoader } from '@/features/hr-recruitment/shared/components/RecruitmentLoader.jsx'
import { FileDrop, HrField } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
import { EmployeePicker } from '@/features/hr-recruitment/shared/components/EmployeePicker.jsx'
import { RecruitmentShell } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { FORM_PATHS } from '../employeeServicesPaths.js'
import { isEditable } from '../shared/formRecords.js'
import { NO_IDENTIFY } from '../shared/useEmployeeServicesUser.js'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'
import { SICK_LEAVE_TYPE } from './sickLeaveContract.js'
import {
  BACK_DAYS, COMMENTS_MAX, FILE_EXTENSIONS, addDays, leaveDays, overlapOf, stepOfErrors, validateSickLeave,
} from './sickLeaveModel.js'
import { warmEmployeeList } from '../shared/employeeList.js'
import { sickLeaveDemo, sickLeaveService } from './sickLeaveService.js'
import PreviewLanguageSwitch from '../shared/PreviewLanguageSwitch.jsx'
import SickLeavePreview from './SickLeavePreview.jsx'

const TITLE = 'Sick Leave Request'
const SECTIONS = ['Dates', 'Certificate', 'Comments']
const DAY_TYPE_TEXT = Object.freeze({ FULL: 'Full day', HALF: 'Half day' })
const FILE_TEXT = Object.freeze({
  title: 'Medical certificate',
  hint: 'Drop files or click to browse',
  uploadNote: 'Files are uploaded with the request when you save.',
  remove: (name) => `Remove ${name}`,
  size: (kb) => `${kb} KB`,
})
const monthStart = (iso) => `${iso.slice(0, 7)}-01`
const monthEnd = (iso) => addDays(`${addDays(`${iso.slice(0, 7)}-28`, 4).slice(0, 7)}-01`, -1)

export default function SickLeavePage() {
  return (
    <RecruitmentLoader current="sick-leave" flow={false} identify={NO_IDENTIFY} breadcrumb={C.breadcrumb} demo={sickLeaveDemo}
      title={TITLE} param="leaveId" load={sickLeaveService.getById} loadLookups={(signal) => {
        // Opening Emp# lists employees without a request.
        warmEmployeeList(sickLeaveService, { signal })
        return {}
      }}>
      {({ record, editorKey }) => <SickLeaveEditor key={editorKey} initial={record} />}
    </RecruitmentLoader>
  )
}

function SickLeaveEditor({ initial }) {
  const navigate = useNavigate()
  const permissions = usePermissions()
  const today = businessToday()
  const editor = useRecruitmentForm({ basePath: FORM_PATHS.sickLeave, idKey: 'leaveId', stepCount: 3, record: initial, initialForm: initial ? {
    employee: initial.employee, fromDate: initial.fromDate, toDate: initial.toDate, fromDayType: initial.fromDayType,
    toDayType: initial.toDayType, comments: initial.comments,
  } : { employee: null, fromDate: '', toDate: '', fromDayType: 'FULL', toDayType: 'FULL', comments: '' } })
  const { form, patch, step, setStep, record } = editor
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const [showFormats, setShowFormats] = useState(false)
  const [language, setLanguage] = useState('en')
  // Files picked but not uploaded yet (kept outside the form's saved-state tracking).
  const [newFiles, setNewFiles] = useState([])
  const employeeRequest = useRef(0)
  const canWrite = permissions.can(record ? 'HR.SICK_LEAVE:UPDATE' : 'HR.SICK_LEAVE:CREATE')
  const canAttach = permissions.can('HR.SICK_LEAVE:MANAGE_ATTACHMENTS')
  const locked = Boolean(record && !isEditable(record.status)) || !canWrite

  // The employee's requests in the months shown (overlap check).
  const anchor = form.fromDate || today
  const range = { from: monthStart(anchor), to: monthEnd(form.toDate && form.toDate > anchor ? form.toDate : anchor) }
  const others = useResource(form.employee ? `sick-leave-others:${form.employee.employeeNumber}:${range.from}:${range.to}` : null,
    (signal) => sickLeaveService.overlapping(form.employee.employeeNumber, range.from, range.to, { signal }))
  const otherRequests = others.status === 'ready' ? others.data.filter((item) => item.leaveId !== record?.leaveId && item.status !== 'REJECTED') : []
  const overlap = overlapOf(otherRequests, { leaveId: record?.leaveId, fromDate: form.fromDate, toDate: form.toDate })
  const single = form.fromDate && form.fromDate === form.toDate
  const days = leaveDays({ ...form, toDayType: single ? form.fromDayType : form.toDayType })
  const files = [...(record?.attachments ?? []), ...newFiles]
  const hasFile = files.length > 0

  const clear = (...keys) => setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key))))
  const set = (key) => (event) => { editor.set(key)(event); clear(key) }
  const selectEmployee = async (item) => {
    const request = ++employeeRequest.current
    patch({ employee: item })
    clear('employee')
    try {
      const details = await sickLeaveService.employeeDetails(item.employeeNumber)
      if (request === employeeRequest.current) patch({ employee: details })
    } catch {
      if (request === employeeRequest.current) setErrors((current) => ({ ...current, employee: 'The employee details could not be loaded. Try again.' }))
    }
  }

  const goToSection = (index) => {
    const next = Math.max(0, Math.min(SECTIONS.length - 1, index))
    setStep(next)
    document.getElementById(`sl-section-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  // The request as it would be saved (files are the not-yet-uploaded ones).
  const payload = () => ({ ...form, toDayType: single ? form.fromDayType : form.toDayType, files: newFiles })
  const validateAll = () => validateSickLeave(payload(), { isNew: !record, today, overlap })

  const save = () => {
    if (locked) return
    const next = validateAll()
    setErrors(next)
    if (Object.keys(next).length) {
      const first = stepOfErrors(next)
      editor.reject(first, 'Review the highlighted fields.')
      requestAnimationFrame(() => document.getElementById(`sl-section-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
      return
    }
    editor.perform(async ({ saved }) => {
      const result = await sickLeaveService.save(editor.recordId, payload(), newFiles)
      saved(result)
      setNewFiles([])
      return result
    }, { success: (result) => `Sick leave request ${result.leaveId} saved as draft (${result.days} day${result.days === 1 ? '' : 's'}).` })
  }
  // Removing a saved file is its own change: unsaved edits must be saved first.
  const removeSaved = (file) => {
    if (editor.dirty) {
      editor.showProblem('Save or discard your changes before removing a saved file.')
      return
    }
    editor.perform(async ({ saved }) => {
      const result = await sickLeaveService.removeAttachment(editor.recordId, file.attachmentId)
      saved(result)
      return result
    }, { success: `${file.fileName} removed.` })
  }

  const startNew = () => navigate(FORM_PATHS.sickLeave)
  const tools = [
    { icon: 'printer', label: C.print, onClick: () => window.print() },
    { icon: 'chart-column', label: 'Report', onClick: () => navigate(FORM_PATHS.sickLeaveReport) },
    { icon: 'file-plus', label: 'New request', onClick: () => (editor.dirty && !locked ? setDialog('new') : startNew()) },
  ]
  const fromHint = record ? undefined : `Up to ${BACK_DAYS} days back`
  const commentsHint = `${form.comments.length} / ${COMMENTS_MAX}`
  const doneSteps = [Boolean(form.employee && form.fromDate && form.toDate && form.toDate >= form.fromDate && !overlap), hasFile, Boolean(form.comments.trim())]

  return <>
    <RecruitmentShell current="sick-leave" flow={false} compact singlePage breadcrumb={C.breadcrumb} title={TITLE} demo={sickLeaveDemo}
      tools={tools} primary={{ label: 'Save draft', icon: 'save', onClick: save }} locked={locked} pending={editor.pending} focusError={editor.focusError}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss}
      steps={SECTIONS.map((name, index) => [name, index === 1 && hasFile ? C.step.files(files.length) : doneSteps[index] ? C.step.done : C.step.open])}
      step={step} onStep={goToSection} doneSteps={doneSteps}
      side={<>
        <div className="zrv-hr-side__h">
          <span className="zrv-hr-side__t"><span className="zrv-hr-eyebrow">Preview</span></span>
          <PreviewLanguageSwitch value={language} onChange={setLanguage} />
        </div>
        <SickLeavePreview form={form} record={record} days={days} single={single} files={files} language={language} />
      </>}>
      <section id="sl-section-0" className="zrv-hr-esf-section">
        <div className="zrv-hr-esf-sectionhead">
          <h2>Employee and leave dates</h2>
          <span className="zrv-hr-esf-daypill" role="status"><b key={days}>{days || '—'}</b> day{days === 1 ? '' : 's'}</span>
        </div>
        <div className="zrv-hr-grid zrv-hr-is-3">
          <EmployeePicker id="sl-employee" label="Employee #" required tight value={form.employee} error={errors.employee} cacheKey="hr-sick-leave-employees"
            placeholder="Type employee number or name…" searchService={(term, options) => sickLeaveService.searchEmployees(term, options)}
            onPick={selectEmployee} disabled={locked} />
          <HrField id="sl-dept" label="Department"><input id="sl-dept" className="ux-input zrv-hr-input" readOnly value={form.employee?.departmentName ?? ''} placeholder="Fills from the employee" /></HrField>
          <HrField id="sl-type" label="Leave type"><input id="sl-type" className="ux-input zrv-hr-input" readOnly value={SICK_LEAVE_TYPE} /></HrField>
        </div>
        <div className="zrv-hr-grid zrv-hr-is-4 zrv-hr-mt">
          <HrField id="sl-from" label="From date" required error={errors.fromDate} hint={fromHint}>
            <input {...fieldProps('sl-from', { error: errors.fromDate, hint: fromHint })} type="date" className="ux-input zrv-hr-input" value={form.fromDate}
              onChange={(event) => { const value = event.target.value; patch((current) => ({ fromDate: value, ...(current.toDate && current.toDate < value ? { toDate: value } : {}) })); clear('fromDate', 'toDate') }} />
          </HrField>
          <HrField id="sl-to" label="To date" required error={errors.toDate}>
            <input {...fieldProps('sl-to', { error: errors.toDate })} type="date" className="ux-input zrv-hr-input" value={form.toDate} min={form.fromDate || undefined} onChange={set('toDate')} />
          </HrField>
          <HrField id="sl-from-type" label={single ? 'Day type' : 'First day'}>
            <select id="sl-from-type" className="ux-select zrv-hr-input" value={form.fromDayType} onChange={(event) => { set('fromDayType')(event); clear('toDayType') }}>
              {Object.entries(DAY_TYPE_TEXT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </HrField>
          {!single && <HrField id="sl-to-type" label="Last day" error={errors.toDayType}>
            <select {...fieldProps('sl-to-type', { error: errors.toDayType })} className="ux-select zrv-hr-input" value={form.toDayType} onChange={set('toDayType')}>
              {Object.entries(DAY_TYPE_TEXT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </HrField>}
        </div>
        {overlap && <p className="zrv-auth-field-error zrv-hr-mt" role="status">These dates overlap request {overlap.leaveId} ({enDate(overlap.fromDate)} – {enDate(overlap.toDate)}).</p>}
        {others.status === 'error' && <p className="zrv-hr-esf-note" role="status">Other requests of this employee could not be checked.</p>}
      </section>

      <div className="zrv-hr-esf-two">
        <section id="sl-section-1" className={`zrv-hr-esf-card${step === 1 ? ' zrv-hr-is-focus' : ''}`}>
          <div className={errors.files ? 'zrv-hr-is-bad' : undefined} aria-invalid={errors.files ? true : undefined}>
            <FileDrop text={FILE_TEXT} files={files} disabled={locked || (Boolean(record) && !canAttach)}
              canRemoveSaved={!locked && canAttach} onRemove={removeSaved}
              onChange={(list) => { setNewFiles(list.filter((item) => item.file)); clear('files') }} />
          </div>
          {errors.files && <p className="zrv-auth-field-error" role="alert">{errors.files}</p>}
          {showFormats && <p className="zrv-hr-esf-note" role="note">Accepted: <b>{FILE_EXTENSIONS.join(', ').toUpperCase()}</b> · up to <b>10 MB</b> each, 10 files at a time.</p>}
          <button type="button" className="zrv-hr-esf-link zrv-hr-esf-cardlink" aria-expanded={showFormats} onClick={() => setShowFormats((value) => !value)}>File formats</button>
        </section>

        <section id="sl-section-2" className={`zrv-hr-esf-card${step === 2 ? ' zrv-hr-is-focus' : ''}`}>
          <HrField id="sl-comments" label="Comments" required wide error={errors.comments} hint={commentsHint}>
            <textarea {...fieldProps('sl-comments', { error: errors.comments, hint: commentsHint })} className="ux-textarea zrv-hr-input" rows={4} value={form.comments}
              maxLength={COMMENTS_MAX} onChange={set('comments')} placeholder="Reason for the request" aria-label="Comments" />
          </HrField>
        </section>
      </div>
    </RecruitmentShell>
    {dialog === 'new' && <NewFormDialog onConfirm={() => { setDialog(null); startNew() }} onClose={() => setDialog(null)} />}
  </>
}
