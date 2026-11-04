import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import usePermissions from '@/features/access/usePermissions.js'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { businessToday, enDate, initials } from '@/features/hr-recruitment/shared/hrFormat.js'
import { useRecruitmentForm } from '@/features/hr-recruitment/shared/useRecruitmentForm.js'
import { NewFormDialog } from '@/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx'
import { RecruitmentLoader } from '@/features/hr-recruitment/shared/components/RecruitmentLoader.jsx'
import { FileDrop, HrField, Review } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
import { EmployeePicker } from '@/features/hr-recruitment/shared/components/EmployeePicker.jsx'
import { Orbit, RecruitmentShell, StepHead, Tilt } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { FORM_PATHS } from '../employeeServicesPaths.js'
import { STATUS_TEXT, isEditable } from '../shared/formRecords.js'
import { NO_IDENTIFY } from '../shared/useEmployeeServicesUser.js'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'
import { SICK_LEAVE_TYPE } from './sickLeaveContract.js'
import {
  BACK_DAYS, COMMENTS_MAX, FILE_EXTENSIONS, addDays, backToWork, isWeekend, leaveDays, overlapOf, stepOfErrors, validateSickLeave, workingDays,
} from './sickLeaveModel.js'
import { sickLeaveDemo, sickLeaveService } from './sickLeaveService.js'

const TITLE = 'Sick Leave Request'
const STEPS = ['Dates', 'Certificate', 'Comments']
const DAY_TYPE_TEXT = Object.freeze({ FULL: 'Full day', HALF: 'Half day' })
const FILE_TEXT = Object.freeze({
  title: 'Attach the medical certificate',
  hint: 'Drop files here or click to browse · up to 10 files, 10 MB each',
  uploadNote: 'Files are uploaded with the request when you save.',
  remove: (name) => `Remove ${name}`,
  size: (kb) => `${kb} KB`,
})
const monthStart = (iso) => `${iso.slice(0, 7)}-01`
const monthEnd = (iso) => addDays(`${addDays(`${iso.slice(0, 7)}-28`, 4).slice(0, 7)}-01`, -1)

export default function SickLeavePage() {
  return (
    <RecruitmentLoader current="sick-leave" flow={false} identify={NO_IDENTIFY} breadcrumb={C.breadcrumb} demo={sickLeaveDemo}
      title={TITLE} param="leaveId" load={sickLeaveService.getById} loadLookups={async () => ({})}>
      {({ record, editorKey }) => <SickLeaveEditor key={editorKey} initial={record} />}
    </RecruitmentLoader>
  )
}

// One or two months around the request: the leave range, weekends and the
// employee's other requests.
function MiniCalendar({ fromDate, toDate, others, today }) {
  const anchor = fromDate || today
  const months = [anchor.slice(0, 7)]
  if (toDate && toDate.slice(0, 7) !== months[0] && toDate > anchor) months.push(toDate.slice(0, 7))
  const taken = (day) => others.find((item) => day >= item.fromDate && day <= item.toDate)
  return (
    <div className="zrv-hr-esf-cal" aria-label="Leave calendar">
      {months.map((month) => {
        const first = `${month}-01`
        const offset = new Date(`${first}T00:00:00Z`).getUTCDay()
        const last = Number(monthEnd(first).slice(8))
        const cells = [...Array(offset).fill(null), ...Array.from({ length: last }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`)]
        return (
          <div key={month} className="zrv-hr-esf-month">
            <b>{new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${first}T00:00:00Z`))}</b>
            <div className="zrv-hr-esf-days" aria-hidden="true">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((name, index) => <span key={index} className="zrv-hr-esf-dow">{name}</span>)}
              {cells.map((day, index) => {
                if (!day) return <span key={`blank-${index}`} />
                const inside = fromDate && toDate && day >= fromDate && day <= toDate
                const other = taken(day)
                const classes = ['zrv-hr-esf-day', isWeekend(day) && 'zrv-hr-is-weekend', inside && 'zrv-hr-is-in', day === fromDate && inside && 'zrv-hr-is-start',
                  day === toDate && inside && 'zrv-hr-is-end', day === today && 'zrv-hr-is-today', other && 'zrv-hr-is-taken'].filter(Boolean).join(' ')
                return <span key={day} className={classes} style={{ '--i': index }} title={other ? `Request ${other.leaveId}` : undefined}>{Number(day.slice(8))}</span>
              })}
            </div>
          </div>
        )
      })}
      <div className="zrv-hr-esf-key"><span><i className="zrv-hr-is-in" />Sick leave</span><span><i className="zrv-hr-is-weekend" />Weekend (Fri, Sat)</span><span><i className="zrv-hr-is-taken" />Other request</span></div>
    </div>
  )
}

function SickLeaveEditor({ initial }) {
  const navigate = useNavigate()
  const permissions = usePermissions()
  const today = businessToday()
  const editor = useRecruitmentForm({ basePath: FORM_PATHS.sickLeave, idKey: 'leaveId', record: initial, initialForm: initial ? {
    employee: initial.employee, fromDate: initial.fromDate, toDate: initial.toDate, fromDayType: initial.fromDayType,
    toDayType: initial.toDayType, comments: initial.comments,
  } : { employee: null, fromDate: '', toDate: '', fromDayType: 'FULL', toDayType: 'FULL', comments: '' } })
  const { form, patch, step, setStep, record } = editor
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const [showFormats, setShowFormats] = useState(false)
  // Files picked but not uploaded yet (kept outside the form's saved-state tracking).
  const [newFiles, setNewFiles] = useState([])
  const employeeRequest = useRef(0)
  const canWrite = permissions.can(record ? 'HR.SICK_LEAVE:UPDATE' : 'HR.SICK_LEAVE:CREATE')
  const canAttach = permissions.can('HR.SICK_LEAVE:MANAGE_ATTACHMENTS')
  const locked = Boolean(record && !isEditable(record.status)) || !canWrite
  const status = record?.status ?? null

  // The employee's requests in the months shown (calendar and overlap check).
  const anchor = form.fromDate || today
  const range = { from: monthStart(anchor), to: monthEnd(form.toDate && form.toDate > anchor ? form.toDate : anchor) }
  const others = useResource(form.employee ? `sick-leave-others:${form.employee.employeeNumber}:${range.from}:${range.to}` : null,
    (signal) => sickLeaveService.overlapping(form.employee.employeeNumber, range.from, range.to, { signal }))
  const otherRequests = others.status === 'ready' ? others.data.filter((item) => item.leaveId !== record?.leaveId && item.status !== 'REJECTED') : []
  const overlap = overlapOf(otherRequests, { leaveId: record?.leaveId, fromDate: form.fromDate, toDate: form.toDate })
  const single = form.fromDate && form.fromDate === form.toDate
  const days = leaveDays({ ...form, toDayType: single ? form.fromDayType : form.toDayType })
  const working = workingDays(form.fromDate, form.toDate)
  const back = backToWork(form.toDate)

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

  const save = () => {
    if (locked) return
    const payload = { ...form, toDayType: single ? form.fromDayType : form.toDayType, files: newFiles }
    const next = validateSickLeave(payload, { isNew: !record, today, overlap })
    setErrors(next)
    if (Object.keys(next).length) {
      editor.reject(stepOfErrors(next), 'Review the highlighted fields.')
      return
    }
    editor.perform(async ({ saved }) => {
      const result = await sickLeaveService.save(editor.recordId, payload, newFiles)
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
  const savedFiles = record?.attachments ?? []
  const fromHint = record ? undefined : `Up to ${BACK_DAYS} days back`
  const commentsHint = `${form.comments.length} / ${COMMENTS_MAX}`
  const hasFile = savedFiles.length + newFiles.length > 0
  const doneSteps = [Boolean(form.employee && form.fromDate && form.toDate && form.toDate >= form.fromDate && !overlap), hasFile, Boolean(form.comments.trim())]
  const progress = [form.employee, form.fromDate, form.toDate, hasFile, form.comments.trim()].filter(Boolean).length

  return <>
    <RecruitmentShell current="sick-leave" flow={false} compact breadcrumb={C.breadcrumb} title={TITLE} demo={sickLeaveDemo}
      tools={tools} primary={{ label: 'Save draft', icon: 'save', onClick: save }} locked={locked} pending={editor.pending} focusError={editor.focusError}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss}
      steps={STEPS.map((name, index) => [name, index === 1 && hasFile ? C.step.files(savedFiles.length + newFiles.length) : doneSteps[index] ? C.step.done : C.step.open])}
      step={step} onStep={setStep} doneSteps={doneSteps} finalLabel="Save draft" onFinal={save}
      side={<>
        <Tilt aria-label="Sick leave card">
          <div className="zrv-hr-dark__top"><span className="zrv-hr-mono">{record ? `SL · ${record.leaveId}` : 'SL · Draft'}</span><span className="zrv-hr-dark__status">{status ? STATUS_TEXT[status] : 'Not saved'}</span></div>
          <div className="zrv-hr-dark__who"><span className="zrv-hr-dark__av">{initials(form.employee?.name)}</span><div>
            <h3 className="zrv-hr-dark__title">{form.employee?.name || 'Employee'}</h3>
            <div className="zrv-hr-dark__sub">{form.employee?.departmentName || 'Department'}</div></div></div>
          <dl className="zrv-hr-esf-grid">
            <div><dt>From – to</dt><dd>{form.fromDate ? `${enDate(form.fromDate)}${form.toDate ? ` – ${enDate(form.toDate)}` : ''}` : '—'}</dd></div>
            <div><dt>Back to work</dt><dd>{back ? enDate(back) : '—'}</dd></div>
            <div><dt>No. of days</dt><dd>{days || '—'}</dd></div>
            <div><dt>Attachments</dt><dd>{savedFiles.length + newFiles.length}</dd></div>
          </dl>
        </Tilt>
        <Orbit done={progress} total={5} hint={!form.employee ? 'Start with the employee.' : !form.fromDate || !form.toDate ? 'Choose the dates.'
          : overlap ? 'The dates overlap another request.' : !hasFile ? 'Attach the medical certificate.' : !form.comments.trim() ? 'Add your comments.' : 'Ready to save.'} />
      </>}>
      {step === 0 && <>
        <StepHead title="Who is off, and when?" desc="You can request sick leave for yourself or a direct report." />
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
        <div className="zrv-hr-esf-counts zrv-hr-mt">
          <div className="zrv-hr-is-pop"><small>No. of days</small><b key={days}>{days || '—'}</b><span>calendar days (server rule)</span></div>
          <div><small>Working days</small><b key={`w${working}`}>{days ? working : '—'}</b><span>excl. Fri &amp; Sat</span></div>
          <div><small>Back to work</small><b className="zrv-hr-is-small">{back ? enDate(back) : '—'}</b><span>next working day</span></div>
        </div>
        {overlap && <p className="zrv-auth-field-error zrv-hr-mt" role="status">These dates overlap request {overlap.leaveId} ({enDate(overlap.fromDate)} – {enDate(overlap.toDate)}).</p>}
        {others.status === 'error' && <p className="zrv-hr-esf-note" role="status">Other requests of this employee could not be checked.</p>}
        <MiniCalendar fromDate={form.fromDate} toDate={form.toDate} others={otherRequests} today={today} />
      </>}

      {step === 1 && <>
        <StepHead title="Attach the medical certificate."
          desc={record ? 'Added files are uploaded when you save; saved files can be removed while the request is a draft.' : 'At least one file is required for a new request.'} />
        <div className="zrv-hr-esf-attach-head">
          <span className="zrv-hr-label">Attachments{!record && <i className="zrv-hr-req" aria-hidden="true">*</i>}</span>
          <button type="button" className="zrv-hr-esf-link" aria-expanded={showFormats} onClick={() => setShowFormats((value) => !value)}>Check valid file formats</button>
        </div>
        {showFormats && <p className="zrv-hr-esf-note" role="note">Accepted: <b>{FILE_EXTENSIONS.join(', ').toUpperCase()}</b> · up to <b>10 MB</b> each, 10 files at a time.</p>}
        <div className={errors.files ? 'zrv-hr-is-bad' : undefined}>
          <FileDrop text={FILE_TEXT} files={[...savedFiles, ...newFiles]} disabled={locked || (Boolean(record) && !canAttach)}
            canRemoveSaved={!locked && canAttach} onRemove={removeSaved}
            onChange={(list) => { setNewFiles(list.filter((item) => item.file)); clear('files') }} />
        </div>
        {errors.files && <p className="zrv-auth-field-error" role="alert">{errors.files}</p>}
      </>}

      {step === 2 && <>
        <StepHead title="Add your comments and review." />
        <div className="zrv-hr-grid">
          <HrField id="sl-comments" label="Comments" required wide error={errors.comments} hint={commentsHint}>
            <textarea {...fieldProps('sl-comments', { error: errors.comments, hint: commentsHint })} className="ux-textarea zrv-hr-input" rows={3} value={form.comments}
              maxLength={COMMENTS_MAX} onChange={set('comments')} placeholder="Enter your comments" />
          </HrField>
        </div>
        <div className="zrv-hr-sep" />
        <Review rows={[
          ['Employee', form.employee ? `${form.employee.employeeNumber} · ${form.employee.name}` : '', !form.employee],
          ['Dates', form.fromDate && form.toDate ? `${enDate(form.fromDate)} – ${enDate(form.toDate)} · ${days} day${days === 1 ? '' : 's'} (${working} working)` : '', !form.fromDate || !form.toDate],
          ['Day types', single ? DAY_TYPE_TEXT[form.fromDayType] : `${DAY_TYPE_TEXT[form.fromDayType]} → ${DAY_TYPE_TEXT[form.toDayType]}`, false],
          ['Back to work', back && enDate(back), !back],
          ['Attachments', `${savedFiles.length + newFiles.length} file${savedFiles.length + newFiles.length === 1 ? '' : 's'}`, !record && !newFiles.length],
        ]} />
        <p className="zrv-admin-hint zrv-hr-mt">The request is saved as a draft. Sending it for approval is not available yet.</p>
      </>}
    </RecruitmentShell>
    {dialog === 'new' && <NewFormDialog onConfirm={() => { setDialog(null); startNew() }} onClose={() => setDialog(null)} />}
  </>
}
