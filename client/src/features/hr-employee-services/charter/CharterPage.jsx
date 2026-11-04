import { useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import useAuth from '@/features/auth/useAuth.js'
import usePermissions from '@/features/access/usePermissions.js'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { useResource } from '@/features/security-administration/useAdminData.js'
import { businessToday, enDate, initials } from '@/features/hr-recruitment/shared/hrFormat.js'
import { useSettled } from '@/features/hr-recruitment/shared/useSettled.js'
import { useRecruitmentForm } from '@/features/hr-recruitment/shared/useRecruitmentForm.js'
import { NewFormDialog } from '@/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx'
import { RecruitmentLoader } from '@/features/hr-recruitment/shared/components/RecruitmentLoader.jsx'
import { HrField } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
import { Orbit, RecruitmentShell, StepHead, Tilt } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { CHARTER_PATHS } from '../employeeServicesPaths.js'
import { NO_IDENTIFY } from '../shared/useEmployeeServicesUser.js'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'
import '@/styles/hr-project-charter.css'
import { MILESTONES, TEXT_FIELDS, blankCharter, isCharterEditable, scheduleProgress, validateCharter } from './charterModel.js'
import { charterService } from './charterService.js'

// The legacy form: pmform_codebase/views/charter (Charter controller), document ZPI.IMS.FM.13.REV.0.
const TITLE = 'Project Charter'
const STEPS = ['Project', 'Schedule', 'Team & customers']
const SAVE = 'Save charter'
const PERMISSION = 'HR.PROJECT_CHARTERS'
const loadLookups = (signal) => charterService.getLookups({ signal })

export default function CharterPage() {
  return (
    <RecruitmentLoader current="charter" flow={false} identify={NO_IDENTIFY} breadcrumb={C.breadcrumb}
      title={TITLE} param="charterId" load={charterService.getById} loadLookups={loadLookups}>
      {({ lookups, record, editorKey }) => <CharterEditor key={editorKey} lookups={lookups} initial={record} />}
    </RecruitmentLoader>
  )
}

const formOf = (record) => ({
  ideaId: record.ideaId, idea: { ideaId: record.ideaId, ideaNum: record.ideaNum, title: record.projectName, businessUnit: record.businessUnit },
  expectedStartDate: record.expectedStartDate, expectedEndDate: record.expectedEndDate,
  milestones: Object.fromEntries(MILESTONES.map(({ key }) => [key, { ...record.milestones[key] }])),
  ...Object.fromEntries(Object.keys(TEXT_FIELDS).map((key) => [key, record[key]])),
})

// Project manager: free text with employee-name suggestions (legacy datalist).
function NameSuggest({ id, value, onChange, error, max }) {
  const listId = useId()
  const term = useSettled(value.trim(), 250)
  const names = useResource(term.length >= 2 ? `hr-charter-names:${term.toLowerCase()}` : null, (signal) => charterService.searchEmployees(term, { signal }))
  return <>
    <input {...fieldProps(id, { error })} className="ux-input zrv-hr-input" aria-required="true" list={listId} autoComplete="off" maxLength={max}
      value={value} onChange={onChange} placeholder="Type a name…" />
    <datalist id={listId}>{names.status === 'ready' && names.data.map((item) => <option key={item.empNo} value={item.name}>{item.jobTitle}</option>)}</datalist>
  </>
}

function CharterEditor({ lookups, initial }) {
  const navigate = useNavigate()
  const permissions = usePermissions()
  const { user } = useAuth()
  const editor = useRecruitmentForm({
    basePath: CHARTER_PATHS.form, idKey: 'charterId', record: initial,
    initialForm: initial ? formOf(initial) : blankCharter(user?.fullName ?? ''),
  })
  const { form, patch, step, setStep, record } = editor
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const ideaRequest = useRef(0)
  const isNew = !record
  const canWrite = permissions.can(`${PERMISSION}:${isNew ? 'CREATE' : 'UPDATE'}`)
  const locked = Boolean(record && !isCharterEditable(record.status)) || !canWrite
  const progress = scheduleProgress(form.milestones)

  const clear = (...keys) => setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key))))
  const set = (key) => (event) => { editor.set(key)(event); clear(key) }
  const toggle = (key, part) => patch((current) => ({ milestones: { ...current.milestones, [key]: { ...current.milestones[key], [part]: !current.milestones[key][part] } } }))

  // Legacy proj_name: choosing the idea fills the project name and business unit.
  const selectIdea = async (event) => {
    const ideaId = event.target.value
    const request = ++ideaRequest.current
    patch({ ideaId, idea: lookups.ideas.find((item) => item.ideaId === ideaId) ?? null })
    clear('ideaId')
    if (!ideaId) return
    try {
      const idea = await charterService.idea(ideaId)
      if (request === ideaRequest.current) patch({ idea })
    } catch {
      if (request === ideaRequest.current) setErrors((current) => ({ ...current, ideaId: 'The idea details could not be loaded. Try again.' }))
    }
  }

  const save = () => {
    if (locked) return
    const problems = validateCharter(form, { isNew })
    setErrors(Object.fromEntries(problems.map((problem) => [problem.field, problem.message])))
    if (problems.length) {
      editor.reject(problems[0].step, problems.length === 1 ? problems[0].message : C.reviewProblems(problems.length),
        problems.length === 1 ? [] : problems.map((problem) => problem.message))
      return
    }
    editor.perform(async ({ saved: keep }) => {
      const result = await charterService.save(editor.recordId, form)
      keep(result)
      return result
    }, { success: (result) => `Project charter for ${result.ideaNum || 'the idea'} saved.` })
  }
  const leave = (path) => (editor.dirty && !locked ? setDialog({ path }) : navigate(path))
  const tools = [
    { icon: 'printer', label: C.print, onClick: () => window.print() },
    { icon: 'chart-column', label: 'Report', onClick: () => leave(CHARTER_PATHS.report) },
    { icon: 'file-plus', label: 'New charter', onClick: () => leave(CHARTER_PATHS.form) },
    { icon: 'house', label: C.home, onClick: () => leave('/dashboard') },
  ]

  const doneSteps = [
    Boolean((record || form.ideaId) && form.projectManager.trim() && form.expectedStartDate && form.expectedEndDate && form.purpose.trim() && form.expectedDeliverables.trim()),
    progress.started > 0,
    Boolean(form.processOwner.trim() || form.projectTeam.trim()),
  ]
  const required = [record || form.ideaId, form.projectManager.trim(), form.expectedStartDate, form.expectedEndDate, form.purpose.trim(), form.expectedDeliverables.trim()]
  const filled = required.filter(Boolean).length
  const customers = [form.processOwner, form.keyStakeholders, form.finalCustomer, form.projectTeam].filter((value) => value.trim()).length
  const open = STEPS.filter((_, index) => index !== 1 && !doneSteps[index])
  const readOnly = (id, label, value, placeholder) => (
    <HrField id={id} label={label}><input id={id} className="ux-input zrv-hr-input" readOnly value={value ?? ''} placeholder={placeholder} /></HrField>
  )
  const text = (key, label, { required: needed = false, area = false, wide = false } = {}) => (
    <HrField id={`pc-${key}`} label={label} required={needed} wide={wide} error={errors[key]}>
      {area
        ? <textarea {...fieldProps(`pc-${key}`, { error: errors[key] })} className="ux-textarea zrv-hr-input" rows={2} aria-required={needed || undefined}
          maxLength={TEXT_FIELDS[key]} value={form[key]} onChange={set(key)} />
        : <input {...fieldProps(`pc-${key}`, { error: errors[key] })} className="ux-input zrv-hr-input" aria-required={needed || undefined}
          maxLength={TEXT_FIELDS[key]} value={form[key]} onChange={set(key)} />}
    </HrField>
  )
  const dates = form.expectedStartDate ? `${enDate(form.expectedStartDate)}${form.expectedEndDate ? ` – ${enDate(form.expectedEndDate)}` : ''}` : ''

  return <>
    <RecruitmentShell current="charter" flow={false} compact breadcrumb={C.breadcrumb} title={TITLE}
      tools={tools} primary={{ label: SAVE, icon: 'save', onClick: save }} locked={locked} pending={editor.pending} focusError={editor.focusError}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss}
      steps={[
        [STEPS[0], `${filled}/${required.length} required`], [STEPS[1], `${progress.started}/${progress.total} started`],
        [STEPS[2], customers ? `${customers}/4 filled` : 'Optional'],
      ]}
      step={step} onStep={setStep} doneSteps={doneSteps} finalLabel={SAVE} onFinal={save}
      side={<>
        <Tilt aria-label="Charter card">
          <div className="zrv-hr-dark__top"><span className="zrv-hr-mono">{form.idea?.ideaNum || 'Draft'}</span><span className="zrv-hr-dark__status">{record?.status || 'Not saved'}</span></div>
          <div className="zrv-hr-dark__who"><span className="zrv-hr-dark__av" aria-hidden="true">{initials(form.idea?.title)}</span><div>
            <h3 className={`zrv-hr-dark__title${form.idea?.title ? '' : ' zrv-hr-is-empty'}`}>{form.idea?.title || 'Project'}</h3>
            <div className={`zrv-hr-dark__sub${form.projectManager.trim() ? '' : ' zrv-hr-is-empty'}`}>{form.projectManager.trim() || 'Project manager'}</div></div></div>
          <div className="zrv-hr-dark__badges">
            <span>{form.idea?.businessUnit || 'Business unit'}</span>
            {form.processOwner.trim() && <span className="zrv-hr-is-solid">{form.processOwner.trim()}</span>}
          </div>
          <div className="zrv-hr-dark__grid">
            <div><small>Expected</small><b>{dates || '—'}</b></div>
            <div><small>Prepared by</small><b>{form.preparedBy.trim() || '—'}</b></div>
            <div><small>Started</small><b>{progress.started}<em>/{progress.total}</em></b><div className="zrv-hr-bar"><i style={{ transform: `scaleX(${progress.started / progress.total})` }} /></div></div>
            <div><small>Complete</small><b>{progress.completed}<em>/{progress.total}</em></b><div className="zrv-hr-bar"><i style={{ transform: `scaleX(${progress.completed / progress.total})` }} /></div></div>
          </div>
        </Tilt>
        <Orbit done={filled} total={required.length} hint={open.length ? `Still open: ${open.join(', ')}` : 'Ready to save.'} />
      </>}>

      {step === 0 && <>
        <StepHead title="Which idea becomes a project?" desc={record ? 'Set the manager, dates and goals.' : 'Choose an approved idea, then set the manager, dates and goals.'} />
        <h3 className="zrv-hr-subh">Idea</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {record
            ? readOnly('pc-idea', 'Idea no.', form.idea?.ideaNum)
            : <HrField id="pc-idea" label="Idea no." required error={errors.ideaId}>
              <select {...fieldProps('pc-idea', { error: errors.ideaId })} className="ux-select zrv-hr-input" aria-required="true" value={form.ideaId} onChange={selectIdea}>
                <option value="">{lookups.ideas.length ? 'Select an approved idea' : 'No approved ideas'}</option>
                {lookups.ideas.map((item) => <option key={item.ideaId} value={item.ideaId}>{item.ideaNum}{item.title ? ` · ${item.title}` : ''}</option>)}
              </select>
            </HrField>}
          {readOnly('pc-name', 'Project name', form.idea?.title, 'Fills from the idea')}
          {readOnly('pc-bu', 'Business unit', form.idea?.businessUnit, 'Fills from the idea')}
          {readOnly('pc-date', 'Date', enDate(record?.creationDate || businessToday()))}
        </div>
        <h3 className="zrv-hr-subh">Plan</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          <HrField id="pc-projectManager" label="Project manager" required error={errors.projectManager}>
            <NameSuggest id="pc-projectManager" value={form.projectManager} onChange={set('projectManager')} error={errors.projectManager} max={TEXT_FIELDS.projectManager} />
          </HrField>
          <HrField id="pc-start" label="Expected start" required error={errors.expectedStartDate}>
            <input {...fieldProps('pc-start', { error: errors.expectedStartDate })} type="date" className="ux-input zrv-hr-input" aria-required="true"
              value={form.expectedStartDate} onChange={(event) => { set('expectedStartDate')(event); clear('expectedEndDate') }} />
          </HrField>
          <HrField id="pc-end" label="Expected completion" required error={errors.expectedEndDate}>
            <input {...fieldProps('pc-end', { error: errors.expectedEndDate })} type="date" className="ux-input zrv-hr-input" aria-required="true"
              min={form.expectedStartDate || undefined} value={form.expectedEndDate} onChange={set('expectedEndDate')} />
          </HrField>
          {text('processImpacted', 'Process impacted')}
        </div>
        <div className="zrv-hr-grid zrv-hr-is-2 zrv-hr-mt">
          {text('purpose', 'Purpose', { required: true, area: true })}
          {text('expectedDeliverables', 'Expected deliverables', { required: true, area: true })}
        </div>
      </>}

      {step === 1 && <>
        <StepHead title="How far along is it?" desc="Tick each milestone when it starts and when it is complete." />
        <div className="zrv-hr-pc-milestones" role="table" aria-label="Tentative schedule">
          <div className="zrv-hr-pc-milestones__head" role="row"><span role="columnheader">Key milestone</span><span role="columnheader">Start</span><span role="columnheader">Complete</span></div>
          {MILESTONES.map((item, index) => (
            <div key={item.key} role="row" className="zrv-hr-pc-milestone" style={{ '--i': index }}>
              <span role="cell"><b>{index + 1}</b>{item.label}</span>
              {['start', 'complete'].map((part) => {
                const on = form.milestones[item.key][part]
                return (
                  <span key={part} role="cell">
                    <label className={`zrv-hr-esf-chip zrv-hr-is-ok${on ? ' zrv-hr-is-on' : ''}`}>
                      <input type="checkbox" checked={on} onChange={() => toggle(item.key, part)} aria-label={`${item.label}: ${part === 'start' ? 'Start' : 'Complete'}`} />
                      <span>{part === 'start' ? 'Start' : 'Complete'}</span>
                    </label>
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      </>}

      {step === 2 && <>
        <StepHead title="Who works on it, and who is it for?" desc="Optional; fill in what is known." />
        <h3 className="zrv-hr-subh">Resources</h3>
        <div className="zrv-hr-grid zrv-hr-is-3">
          {text('projectTeam', 'Project team')}{text('supportResources', 'Support resources')}{text('specialNeeds', 'Special needs')}
        </div>
        <h3 className="zrv-hr-subh">Customers</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {text('processOwner', 'Process owner')}{text('keyStakeholders', 'Key stakeholders')}{text('finalCustomer', 'Final customer')}
          {text('preparedBy', 'Prepared by')}
        </div>
      </>}
    </RecruitmentShell>
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}
