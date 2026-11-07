import { useState } from 'react'
import { useNavigate } from 'react-router'
import usePermissions from '@/features/access/usePermissions.js'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { businessToday, enDate } from '@/features/hr-recruitment/shared/hrFormat.js'
import { useRecruitmentForm } from '@/features/hr-recruitment/shared/useRecruitmentForm.js'
import { NewFormDialog } from '@/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx'
import { RecruitmentLoader } from '@/features/hr-recruitment/shared/components/RecruitmentLoader.jsx'
import { ChoiceCards, HrField, Review } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
import { EmployeePicker } from '@/features/hr-recruitment/shared/components/EmployeePicker.jsx'
import { Orbit, RecruitmentShell, StepHead, Tilt } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { FORM_PATHS } from '../employeeServicesPaths.js'
import { STATUS_TEXT, isEditable } from '../shared/formRecords.js'
import { NO_IDENTIFY } from '../shared/useEmployeeServicesUser.js'
import { RatingChips } from '../shared/FormParts.jsx'
import { errorsInStep, lockedStepsOf } from '../shared/stepGating.js'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'
import {
  DEPARTMENT_TEXT, LINE_REMARK_MAX, REMARK_MAX, duplicateOf, monthOf, ratingSummary, stepOfErrors, validateReward,
} from './rewardModel.js'
import { warmEmployeeList } from '../shared/employeeList.js'
import { rewardDemo, rewardService } from './rewardService.js'

const TITLE = 'Employee Reward Nomination'
const STEPS = ['Nominee', 'Ratings', 'Recommend']
const monthName = (iso) => (monthOf(iso) ? new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)) : '')

export default function RewardPage() {
  return (
    <RecruitmentLoader current="reward" flow={false} identify={NO_IDENTIFY} breadcrumb={C.breadcrumb} demo={rewardDemo}
      title={TITLE} param="nominationId" load={rewardService.getById}
      loadLookups={async (signal) => {
        // Opening the employee field lists employees without a request.
        warmEmployeeList(rewardService, { signal })
        return { requestor: await rewardService.requestor({ signal }) }
      }}>
      {({ lookups, record, editorKey }) => <RewardEditor key={editorKey} requestor={lookups.requestor} initial={record} />}
    </RecruitmentLoader>
  )
}

function RewardEditor({ requestor, initial }) {
  const navigate = useNavigate()
  const permissions = usePermissions()
  const editor = useRecruitmentForm({ basePath: FORM_PATHS.reward, idKey: 'nominationId', record: initial, initialForm: initial ? {
    department: initial.department, employee: initial.employee, activityDate: initial.activityDate, overallRating: initial.overallRating,
    remark: initial.remark, lines: initial.lines.map((line) => ({ rating: line.rating, remark: line.remark })),
  } : { department: '', employee: null, activityDate: businessToday(), overallRating: '', remark: '', lines: [] } })
  const { form, patch, step, setStep, record } = editor
  const employee = form.employee
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)

  const criteria = useResource(form.department ? `reward-criteria:${form.department}` : null, (signal) => rewardService.criteria(form.department, { signal }))
  const criteriaList = criteria.status === 'ready' ? criteria.data.criteria : []
  const scale = criteria.status === 'ready' ? criteria.data.ratingScale : []
  const sameMonth = useResource(employee && monthOf(form.activityDate) ? `reward-same-month:${employee.employeeNumber}:${monthOf(form.activityDate)}` : null,
    (signal) => rewardService.sameMonth(employee.employeeNumber, form.activityDate, { signal }))
  const duplicate = sameMonth.status === 'ready' ? duplicateOf(sameMonth.data, { nominationId: record?.nominationId, employeeNumber: employee?.employeeNumber, activityDate: form.activityDate }) : null

  const status = record?.status ?? null
  const canWrite = permissions.can(record ? 'HR.EMPLOYEE_OF_THE_MONTH:UPDATE' : 'HR.EMPLOYEE_OF_THE_MONTH:CREATE')
  const locked = Boolean(record && !isEditable(record.status)) || !canWrite
  const lines = criteriaList.map((_, index) => form.lines[index] ?? { rating: '', remark: '' })
  const summary = ratingSummary(lines)
  const department = DEPARTMENT_TEXT[form.department]

  const clear = (...keys) => setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key))))
  const set = (key) => (event) => { editor.set(key)(event); clear(key) }
  const setLine = (index, change) => {
    patch({ lines: lines.map((line, row) => (row === index ? { ...line, ...change } : line)) })
    clear(...Object.keys(change).map((key) => `${key}:${index}`))
  }
  // A saved nomination keeps its section (the backend refuses a change).
  const chooseDepartment = (value) => {
    if (record) return
    patch({ department: value, lines: [] })
    clear('department')
  }

  const allErrors = () => {
    const next = validateReward({ ...form, lines }, { employee, requestor, criteria: criteriaList, duplicate })
    if (form.department && criteria.status !== 'ready') next.department = 'Wait for the criteria of this section to load.'
    return next
  }
  // Continue checks the open step only; later steps stay locked until this one is done.
  const continueStep = () => {
    const problems = errorsInStep(allErrors(), (field) => stepOfErrors({ [field]: true }), step)
    setErrors(problems)
    if (!Object.keys(problems).length) return true
    const messages = Object.values(problems)
    editor.reject(step, messages.length === 1 ? messages[0] : C.reviewProblems(messages.length))
    return false
  }

  const save = () => {
    if (locked) return
    const next = allErrors()
    setErrors(next)
    if (Object.keys(next).length) {
      editor.reject(stepOfErrors(next), 'Review the highlighted fields.')
      return
    }
    editor.perform(async ({ saved }) => {
      const result = await rewardService.save(editor.recordId, { ...form, lines }, employee)
      saved(result)
      return result
    }, { success: (result) => `Nomination ${result.requestNo} saved as draft.` })
  }

  const startNew = () => navigate(FORM_PATHS.reward)
  const tools = [
    { icon: 'printer', label: C.print, onClick: () => window.print() },
    { icon: 'chart-column', label: 'View report', onClick: () => navigate(FORM_PATHS.rewardReport) },
    { icon: 'file-plus', label: 'New nomination', onClick: () => (editor.dirty && !locked ? setDialog('new') : startNew()) },
  ]
  const doneSteps = [
    Boolean(form.department && employee && form.activityDate && !duplicate),
    Boolean(criteriaList.length && lines.every((line) => line.rating && line.remark.trim())),
    Boolean(form.overallRating && form.remark.trim()),
  ]
  const lockedSteps = lockedStepsOf(doneSteps)
  const progress = [form.department, employee, form.activityDate].filter(Boolean).length + summary.rated + (form.overallRating ? 1 : 0)
  const progressTotal = 3 + (criteriaList.length || 4) + 1
  const ring = 2 * Math.PI * 40
  const dateHint = monthName(form.activityDate) ? `Nomination for ${monthName(form.activityDate)}` : undefined
  const remarkHint = `${form.remark.length} / ${REMARK_MAX}`

  return <>
    <RecruitmentShell current="reward" flow={false} compact breadcrumb={C.breadcrumb} title={TITLE} demo={rewardDemo}
      tools={tools} primary={{ label: 'Save draft', icon: 'save', onClick: save }} locked={locked} pending={editor.pending} focusError={editor.focusError}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss}
      steps={STEPS.map((name, index) => [name, index === 1 && summary.total ? C.step.rated(summary.rated, summary.total) : doneSteps[index] ? C.step.done : C.step.open])} step={step} onStep={setStep} doneSteps={doneSteps} lockedSteps={lockedSteps} onContinue={continueStep} finalLabel="Save draft" onFinal={save}
      side={<>
        <Tilt className={`zrv-hr-esf-reward-card${summary.total && summary.rated === summary.total ? ' zrv-hr-is-complete' : ''}`} aria-label="Nomination card">
          <div className="zrv-hr-dark__top"><span className="zrv-hr-mono">{record?.requestNo || 'RWD · Draft'}</span><span className="zrv-hr-dark__status">{status ? STATUS_TEXT[status] : 'Not saved'}</span></div>
          <div className="zrv-hr-esf-trophy" aria-hidden="true">
            <svg viewBox="0 0 100 100" className="zrv-hr-esf-trophy__ring"><circle cx="50" cy="50" r="40" className="zrv-hr-esf-g0" />
              <circle cx="50" cy="50" r="40" className="zrv-hr-esf-g1" strokeDasharray={`${(summary.total ? summary.rated / summary.total : 0) * ring} ${ring}`} transform="rotate(-90 50 50)" /></svg>
            <svg viewBox="0 0 24 24" className="zrv-hr-esf-trophy__cup"><path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9 17h6" /></svg>
          </div>
          <h3 className="zrv-hr-dark__title zrv-hr-esf-center">{employee?.name || 'Nominee'}</h3>
          <div className="zrv-hr-dark__sub zrv-hr-esf-center">{employee ? `${employee.position || '—'} · ${employee.departmentName || '—'}` : 'Position · department'}</div>
          <div className="zrv-hr-dark__badges zrv-hr-esf-center">
            {department ? <span>{department.name}</span> : <span>Choose a section</span>}
            {form.overallRating && <span>{scale.find((item) => item.code === form.overallRating)?.label ?? form.overallRating}</span>}
          </div>
          <dl className="zrv-hr-esf-tally">
            {scale.map((item) => <div key={item.code}><dt>{item.label}</dt><dd>{summary.counts[item.code]}</dd></div>)}
          </dl>
          <p className="zrv-hr-esf-meta">{criteriaList.length ? `${summary.rated} of ${criteriaList.length} areas rated` : 'Choose a section to see its areas'}</p>
        </Tilt>
        <Orbit done={progress} total={progressTotal} hint={!form.department ? 'Choose the section first.' : !employee ? 'Choose the employee.'
          : summary.rated < criteriaList.length ? `${criteriaList.length - summary.rated} area${criteriaList.length - summary.rated === 1 ? '' : 's'} still to rate.`
            : !form.overallRating ? 'Choose the overall feedback.' : 'Ready to save.'} />
      </>}>
      {step === 0 && <>
        <StepHead title="Who deserves recognition?" desc={record ? 'The section of a saved nomination cannot change.' : undefined} />
        <ChoiceCards label="Choose department" value={form.department} error={errors.department} onChange={chooseDepartment}
          options={Object.entries(DEPARTMENT_TEXT).map(([value, item]) => ({ value, icon: item.icon, title: item.name, desc: item.desc }))} />
        <div className="zrv-hr-grid zrv-hr-is-2 zrv-hr-mt">
          <EmployeePicker id="rw-employee" label="Employee" required value={employee} error={errors.employee} cacheKey="hr-reward-employees"
            placeholder="Search by number, name or email…" searchService={(term, options) => rewardService.searchEmployees(term, options)}
            onPick={(item) => { patch({ employee: item }); clear('employee') }} disabled={locked} />
          <HrField id="rw-date" label="Effective date" required error={errors.activityDate}
            hint={dateHint}>
            <input {...fieldProps('rw-date', { error: errors.activityDate, hint: dateHint })} type="date" className="ux-input zrv-hr-input" value={form.activityDate} onChange={set('activityDate')} />
          </HrField>
        </div>
        {employee && <dl className="zrv-hr-esf-chosen zrv-hr-mt">
          {[['Employee number', employee.employeeNumber], ['Employee name', employee.name], ['Employee email', employee.email || '—'], ['Department', employee.departmentName || '—'], ['Position', employee.position || '—']]
            .map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>}
        {duplicate && <p className="zrv-hr-esf-note" role="status">{employee.name} already has a nomination for this month ({duplicate.requestNo}).</p>}
        {sameMonth.status === 'error' && <p className="zrv-hr-esf-note" role="status">Earlier nominations for this month could not be checked.</p>}
      </>}

      {step === 1 && <>
        <StepHead title={department ? `Rate ${department.name.toLowerCase()} performance.` : 'Choose a section first.'}
          desc={department ? 'Choose a rating for each area and give a short, real example as evidence.' : 'Choose a section first.'} />
        {!form.department && <button type="button" className="btn-secondary zrv-hr-btn" onClick={() => setStep(0)}>Choose section</button>}
        {form.department && criteria.status === 'loading' && <p className="zrv-admin-state" role="status">Loading the criteria…</p>}
        {criteria.status === 'error' && <div className="zrv-admin-state zrv-admin-state--error" role="alert"><p>The criteria could not be loaded.</p><button type="button" className="btn-secondary" onClick={criteria.reload}>Retry</button></div>}
        <div className="zrv-hr-esf-criteria">
          {criteriaList.map((item, index) => {
            const line = lines[index]
            const bad = errors[`rating:${index}`] || errors[`remark:${index}`]
            return (
              <article key={item.lineNumber} className={`zrv-hr-esf-criterion${line.rating ? ' zrv-hr-is-done' : ''}${bad ? ' zrv-hr-is-bad' : ''}`} style={{ '--i': index }}>
                <div className="zrv-hr-esf-criterion__head">
                  <span className="zrv-hr-esf-criterion__n">{String(index + 1).padStart(2, '0')}</span>
                  <b id={`rw-crit-${index}`}>{item.criterion}</b>
                </div>
                <RatingChips name={`rw-rating-${index}`} labelledBy={`rw-crit-${index}`} scale={scale} value={line.rating}
                  onChange={(rating) => setLine(index, { rating })} error={errors[`rating:${index}`]} />
                <HrField id={`rw-evidence-${index}`} label="Evidence" required error={errors[`remark:${index}`]}>
                  <input {...fieldProps(`rw-evidence-${index}`, { error: errors[`remark:${index}`] })} className="ux-input zrv-hr-input" value={line.remark} maxLength={LINE_REMARK_MAX}
                    placeholder={`${item.criterion} – evidence (a real example)`}
                    onChange={(event) => setLine(index, { remark: event.target.value })} />
                </HrField>
              </article>
            )
          })}
        </div>
      </>}

      {step === 2 && <>
        <StepHead title="Your overall recommendation." />
        <span className="zrv-hr-label" id="rw-overall">Overall feedback<i className="zrv-hr-req" aria-hidden="true">*</i></span>
        {criteria.status === 'ready'
          ? <RatingChips name="rw-overall" labelledBy="rw-overall" scale={scale} value={form.overallRating} onChange={set('overallRating')} error={errors.overallRating} />
          : <p className="zrv-admin-hint">Choose a section first to load the rating scale.</p>}
        <div className="zrv-hr-grid zrv-hr-mt">
          <HrField id="rw-remark" label="Remark" required wide error={errors.remark} hint={remarkHint}>
            <textarea {...fieldProps('rw-remark', { error: errors.remark, hint: remarkHint })} className="ux-textarea zrv-hr-input" rows={3} value={form.remark} maxLength={REMARK_MAX} onChange={set('remark')}
              placeholder="Why does this employee deserve the reward?" />
          </HrField>
        </div>
        <div className="zrv-hr-sep" />
        <Review rows={[
          ['Nominee', employee ? `${employee.employeeNumber} · ${employee.name}` : '', !employee],
          ['Section', department?.name, !department],
          ['Effective date', form.activityDate && enDate(form.activityDate), !form.activityDate],
          ['Ratings', summary.rated ? scale.map((item) => `${item.label}: ${summary.counts[item.code]}`).join(' · ') : '', !summary.rated],
          ['Overall feedback', scale.find((item) => item.code === form.overallRating)?.label, !form.overallRating],
        ]} />
        <p className="zrv-admin-hint zrv-hr-mt">The nomination is saved as a draft. Sending it for approval is not available yet.</p>
      </>}
    </RecruitmentShell>
    {dialog === 'new' && <NewFormDialog onConfirm={() => { setDialog(null); startNew() }} onClose={() => setDialog(null)} />}
  </>
}
