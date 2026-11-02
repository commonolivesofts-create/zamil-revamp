import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { enDate, initials } from '@/features/hr-recruitment/shared/hrFormat.js'
import { useRecruitmentForm } from '@/features/hr-recruitment/shared/useRecruitmentForm.js'
import { NewFormDialog } from '@/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx'
import { RecruitmentLoader } from '@/features/hr-recruitment/shared/components/RecruitmentLoader.jsx'
import { ChoiceCards, HrField, Review } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
import { EmployeePicker } from '@/features/hr-recruitment/shared/components/EmployeePicker.jsx'
import { Orbit, PanelHead, Pill, RecruitmentShell, Ticket, Tilt } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { FORM_PATHS } from '../employeeServicesPaths.js'
import { STATUS_TEXT, STATUS_TONE, isEditable } from '../shared/formRecords.js'
import { NO_IDENTIFY } from '../shared/useEmployeeServicesUser.js'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'
import { IDEA_MAX, IDEA_MIN, TITLE_MAX, cleanAmount, formatSar, ideaProgress, stepOfErrors, validateIdea } from './ideaModel.js'
import { ideaDemo, ideaService } from './ideaService.js'

const TITLE = 'Share an Idea'
const SUBTITLE = 'Every improvement starts with an idea. Describe it and show its impact; the feasibility is calculated when you save.'
const STEPS = [['Idea', 'What and why'], ['Impact', 'Investment and saving'], ['Review', 'Check and save']]

export default function IdeaPage() {
  return (
    <RecruitmentLoader current="idea" flow={false} identify={NO_IDENTIFY} breadcrumb={C.breadcrumb} demo={ideaDemo}
      title={TITLE} subtitle={SUBTITLE} param="ideaId" load={ideaService.getById} loadLookups={(signal) => ideaService.getLookups({ signal })}>
      {({ lookups, record, editorKey }) => <IdeaEditor key={editorKey} lookups={lookups} initial={record} />}
    </RecruitmentLoader>
  )
}

function Bulb({ level }) {
  return (
    <svg className="zrv-hr-esf-bulb" viewBox="0 0 120 120" aria-hidden="true" style={{ '--lv': level }}>
      <defs><radialGradient id="zrv-idea-glow"><stop offset="0" stopColor="#ffe38a" stopOpacity=".95" /><stop offset=".6" stopColor="#ffd25a" stopOpacity=".25" /><stop offset="1" stopColor="#ffd25a" stopOpacity="0" /></radialGradient></defs>
      <circle cx="60" cy="50" r="52" fill="url(#zrv-idea-glow)" className="zrv-hr-esf-bulb__halo" />
      {[-75, -50, -25, 0, 25, 50, 75].map((angle) => <line key={angle} x1="60" y1="2" x2="60" y2="10" className="zrv-hr-esf-bulb__ray" transform={`rotate(${angle} 60 50)`} />)}
      <path d="M60 18c-17 0-30 13-30 29 0 11 6 18 11 23 3 3 4 6 4 9v4h30v-4c0-3 1-6 4-9 5-5 11-12 11-23 0-16-13-29-30-29z" className="zrv-hr-esf-bulb__glass" />
      <path d="M50 64l5-8 5 8 5-8 5 8" className="zrv-hr-esf-bulb__fil" />
      <rect x="47" y="86" width="26" height="6" rx="3" className="zrv-hr-esf-bulb__base" /><rect x="50" y="95" width="20" height="6" rx="3" className="zrv-hr-esf-bulb__base" />
    </svg>
  )
}

// A labelled select of { value, label } options.
function SelectField({ id, label, value, onChange, options, placeholder, error }) {
  return (
    <HrField id={id} label={label} required error={error}>
      <select {...fieldProps(id, { error })} className="ux-select zrv-hr-input" value={value} onChange={onChange} aria-required="true">
        <option value="">{placeholder}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </HrField>
  )
}

function IdeaEditor({ lookups, initial }) {
  const navigate = useNavigate()
  const permissions = usePermissions()
  const editor = useRecruitmentForm({ basePath: FORM_PATHS.idea, idKey: 'ideaId', record: initial, initialForm: initial ? {
    employee: initial.employee, division: initial.division, investmentCategory: initial.investmentCategory, projectType: initial.projectType,
    title: initial.title, idea: initial.idea, hasInvestment: initial.hasInvestment,
    investmentValue: initial.hasInvestment === 'yes' && initial.investmentValue !== null ? String(initial.investmentValue) : '',
    saving: initial.saving ? String(initial.saving) : '',
  } : { employee: null, division: '', investmentCategory: '', projectType: '', title: '', idea: '', hasInvestment: '', investmentValue: '', saving: '' } })
  const { form, patch, step, setStep, record } = editor
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const employeeRequest = useRef(0)
  const canWrite = permissions.can(record ? 'HR.IDEAS:UPDATE' : 'HR.IDEAS:CREATE')
  const locked = Boolean(record && !isEditable(record.status)) || !canWrite
  const progress = ideaProgress(form)
  const level = progress.done / progress.total
  const status = record?.status ?? null
  const nameOf = (list, value) => list.find((item) => item.value === value)?.label ?? ''
  const feasibility = record?.feasibility
  const ideaHint = `${form.idea.trim().length} characters${form.idea.trim().length < IDEA_MIN ? ` · at least ${IDEA_MIN}` : ' ✓'}`

  const clear = (...keys) => setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key))))
  const set = (key) => (event) => { editor.set(key)(event); clear(key) }
  // The employee's details fill the name and department and suggest the division.
  const selectEmployee = async (item) => {
    const request = ++employeeRequest.current
    patch({ employee: item })
    clear('employee')
    try {
      const details = await ideaService.employeeDetails(item.employeeNumber)
      if (request !== employeeRequest.current) return
      patch((current) => ({ employee: details, division: current.division || details.divisionId }))
    } catch {
      if (request === employeeRequest.current) setErrors((current) => ({ ...current, employee: 'The employee details could not be loaded. Try again.' }))
    }
  }

  const save = () => {
    if (locked) return
    const next = validateIdea(form)
    setErrors(next)
    if (Object.keys(next).length) {
      editor.reject(stepOfErrors(next), 'Review the highlighted fields.')
      return
    }
    editor.perform(async ({ saved }) => {
      const result = await ideaService.save(editor.recordId, form)
      saved(result)
      return result
    }, { success: (result) => `Idea ${result.idNo} saved as draft; feasibility recalculated.` })
  }
  const startNew = () => navigate(FORM_PATHS.idea)
  const tools = [
    { icon: 'save', label: 'Save draft', onClick: save, disabled: editor.pending || locked },
    { icon: 'printer', label: C.print, onClick: () => window.print() },
    { icon: 'chart-column', label: 'Report', onClick: () => navigate(FORM_PATHS.ideaReport) },
    { icon: 'file-plus', label: 'New idea', onClick: () => (editor.dirty && !locked ? setDialog('new') : startNew()) },
  ]
  const doneSteps = [
    Boolean(form.employee && form.division && form.investmentCategory && form.projectType && form.title.trim() && form.idea.trim().length >= IDEA_MIN),
    Boolean(form.hasInvestment && (form.hasInvestment === 'no' || Number(form.investmentValue) > 0)),
    Boolean(record),
  ]

  return <>
    <RecruitmentShell current="idea" flow={false} compact breadcrumb={C.breadcrumb} title={TITLE} subtitle={SUBTITLE} demo={ideaDemo}
      tools={tools} primary={{ label: 'Save draft', icon: 'save', onClick: save }} locked={locked} pending={editor.pending} focusError={editor.focusError}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss}
      ticket={<Ticket avatar={initials(form.employee?.name)} code="IDEA · 1097" items={[
        { k: 'Idea no.', v: record?.idNo || 'Assigned on save' },
        { k: 'Employee', v: form.employee?.name || 'Not selected', big: true },
        { k: 'Department', v: form.employee?.departmentName || '—' },
        { k: 'Date', v: record?.creationDate ? enDate(record.creationDate) : 'Set on save' },
        { k: 'Status', v: <Pill tone={STATUS_TONE[status] ?? 'warn'}>{status ? STATUS_TEXT[status] : 'Not saved'}</Pill> },
      ]} />}
      steps={STEPS} step={step} onStep={setStep} doneSteps={doneSteps} finalLabel="Save draft" onFinal={save}
      side={<>
        <Tilt className={`zrv-hr-esf-idea-card${level >= 1 ? ' zrv-hr-is-lit' : ''}`} aria-label="Idea card">
          <div className="zrv-hr-dark__top"><span className="zrv-hr-eyebrow">Idea card</span><span className="zrv-hr-mono">{record?.idNo || 'IDEA · DRAFT'}</span></div>
          <div className="zrv-hr-esf-idea-head"><Bulb level={level} /><div>
            <h3 className="zrv-hr-dark__title">{form.title.trim() || 'Your idea title'}</h3>
            <div className="zrv-hr-dark__sub">{form.employee ? `${form.employee.name} · ${form.employee.departmentName || '—'}` : 'Employee · department'}</div>
          </div></div>
          <div className="zrv-hr-dark__badges">
            {form.projectType ? <span>{nameOf(lookups.projectTypes, form.projectType)}</span> : <span>Project type</span>}
            {form.investmentCategory && <span>{nameOf(lookups.investmentCategories, form.investmentCategory)}</span>}
          </div>
          <dl className="zrv-hr-esf-grid">
            <div><dt>Saving / year</dt><dd>{form.saving ? formatSar(form.saving) : '—'}</dd></div>
            <div><dt>Investment</dt><dd>{form.hasInvestment === 'yes' ? (form.investmentValue ? formatSar(form.investmentValue) : 'Yes') : form.hasInvestment === 'no' ? 'None' : '—'}</dd></div>
            <div><dt>NPV (8 %)</dt><dd>{feasibility ? formatSar(feasibility.npv) : 'On save'}</dd></div>
            <div><dt>IRR · ROI</dt><dd>{feasibility ? `${feasibility.irr ?? 0} % · ${feasibility.roi ?? 0}` : 'On save'}</dd></div>
          </dl>
          <div className="zrv-hr-esf-meter" aria-label={`Idea ${Math.round(level * 100)}% described`}><i style={{ transform: `scaleX(${level})` }} />
            <span>{level >= 1 ? 'Bright idea — ready to save' : `${Math.round(level * 100)}% described`}</span></div>
        </Tilt>
        <Orbit done={progress.done} total={progress.total} hint={level >= 1 ? 'Ready to save.' : !form.employee ? 'Start with the employee.' : 'Keep describing your idea.'} />
      </>}>
      {step === 0 && <>
        <PanelHead n={1} eyebrow="Step 01 · Idea" title="What’s your idea?" />
        <div className="zrv-hr-grid zrv-hr-is-2">
          <EmployeePicker id="id-employee" label="EMP #" required value={form.employee} error={errors.employee} cacheKey="hr-idea-employees"
            placeholder="Enter employee number or name…" searchService={(term, options) => ideaService.searchEmployees(term, options)}
            onPick={selectEmployee} disabled={locked} />
          <HrField id="id-dept" label="Department"><input id="id-dept" className="ux-input zrv-hr-input" readOnly value={form.employee?.departmentName ?? ''} placeholder="Fills from the employee" /></HrField>
          <SelectField id="id-division" label="Division" value={form.division} onChange={set('division')} error={errors.division}
            options={lookups.divisions} placeholder="Select division" />
          <SelectField id="id-category" label="Investment category" value={form.investmentCategory} onChange={set('investmentCategory')}
            error={errors.investmentCategory} options={lookups.investmentCategories} placeholder="Select category" />
          <SelectField id="id-type" label="Project type" value={form.projectType} onChange={set('projectType')} error={errors.projectType}
            options={lookups.projectTypes} placeholder="Select project type" />
          <HrField id="id-title" label="Idea title" required wide error={errors.title}>
            <input {...fieldProps('id-title', { error: errors.title })} className="ux-input zrv-hr-input zrv-hr-esf-title" value={form.title} maxLength={TITLE_MAX} onChange={set('title')}
              placeholder="Write the idea title in one line" />
          </HrField>
          <HrField id="id-idea" label="Your idea" required wide error={errors.idea} hint={ideaHint}>
            <textarea {...fieldProps('id-idea', { error: errors.idea, hint: ideaHint })} className="ux-textarea zrv-hr-input" rows={5} value={form.idea} maxLength={IDEA_MAX} onChange={set('idea')}
              placeholder="What would you change, and how?" />
          </HrField>
        </div>
      </>}

      {step === 1 && <>
        <PanelHead n={2} eyebrow="Step 02 · Impact" title="What will it change?" desc="Depreciation, NPV (8 %), IRR and ROI are calculated by the server from these values when you save." />
        <div className="zrv-hr-grid zrv-hr-is-2">
          <ChoiceCards compact label="Investment needed?" value={form.hasInvestment} error={errors.hasInvestment}
            onChange={(value) => { patch({ hasInvestment: value, ...(value === 'no' ? { investmentValue: '' } : {}) }); clear('hasInvestment', 'investmentValue') }}
            options={[{ value: 'yes', icon: 'wallet', title: 'Yes', desc: 'Needs money to implement' }, { value: 'no', icon: 'check', title: 'No', desc: 'Can be done with what we have' }]} />
          <div className="zrv-hr-grid">
            {form.hasInvestment === 'yes' && <HrField id="id-amount" label="Estimated investment (SAR)" required error={errors.investmentValue}>
              <input {...fieldProps('id-amount', { error: errors.investmentValue })} className="ux-input zrv-hr-input" inputMode="decimal" value={form.investmentValue} placeholder="e.g. 12000"
                onChange={(event) => { patch({ investmentValue: cleanAmount(event.target.value) }); clear('investmentValue') }} />
            </HrField>}
            <HrField id="id-saving" label="Saving value (SAR per year)" error={errors.saving}>
              <input {...fieldProps('id-saving', { error: errors.saving })} className="ux-input zrv-hr-input" inputMode="decimal" value={form.saving} placeholder="Enter saving value"
                onChange={(event) => { patch({ saving: cleanAmount(event.target.value) }); clear('saving') }} />
            </HrField>
          </div>
        </div>
        {feasibility && <dl className="zrv-hr-esf-chosen zrv-hr-mt" aria-label="Feasibility (last save)">
          {[['Depreciation / year', formatSar(feasibility.depreciation)], ['NPV (8 %)', formatSar(feasibility.npv)], ['IRR', `${feasibility.irr ?? 0} %`], ['ROI', String(feasibility.roi ?? 0)]]
            .map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>}
      </>}

      {step === 2 && <>
        <PanelHead n={3} eyebrow="Step 03 · Review" title="Check the idea and save it." />
        {record?.attachments.length > 0 && <>
          <h3 className="zrv-hr-esf-subhead">Attachments on file</h3>
          <ul className="zrv-hr-files">{record.attachments.map((item) => (
            <li key={item.attachmentId} className="zrv-hr-file"><span className="zrv-hr-bubble"><OrvexaIcon name="file-text" size={16} /></span>
              <span className="zrv-hr-file__name">{item.fileName}</span>{item.attachedOn && <small>{enDate(item.attachedOn)}</small>}</li>))}</ul>
        </>}
        <Review rows={[
          ['Title', form.title, !form.title.trim()],
          ['Employee', form.employee ? `${form.employee.employeeNumber} · ${form.employee.name}` : '', !form.employee],
          ['Division · department', `${nameOf(lookups.divisions, form.division) || '—'} · ${form.employee?.departmentName || '—'}`, !form.division],
          ['Category · type', `${nameOf(lookups.investmentCategories, form.investmentCategory) || '—'} · ${nameOf(lookups.projectTypes, form.projectType) || '—'}`, !form.investmentCategory || !form.projectType],
          ['Idea', form.idea.trim().slice(0, 140) + (form.idea.trim().length > 140 ? '…' : ''), form.idea.trim().length < IDEA_MIN],
          ['Investment', form.hasInvestment === 'yes' ? `Yes · ${formatSar(form.investmentValue)}` : form.hasInvestment === 'no' ? 'No' : '', !form.hasInvestment],
          ['Saving', form.saving ? `${formatSar(form.saving)} a year` : 'Not given', false],
        ]} />
        <p className="zrv-admin-hint zrv-hr-mt">The idea is saved as a draft. Adding files and sending the idea for approval are not available yet.</p>
      </>}
    </RecruitmentShell>
    {dialog === 'new' && <NewFormDialog onConfirm={() => { setDialog(null); startNew() }} onClose={() => setDialog(null)} />}
  </>
}
