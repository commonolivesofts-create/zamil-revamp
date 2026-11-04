import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { ConfirmDialog } from '@/features/security-administration/components/AdminUi.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from '../hrRecruitmentActions.js'
import { COMMON_TEXT, INTERVIEW_TEXT as T } from '../hrRecruitmentText.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { businessToday, daysBetween, formatAmount, initials } from '../shared/hrFormat.js'
import { useRecruitmentForm } from '../shared/useRecruitmentForm.js'
import { RecruitmentLoader } from '../shared/components/RecruitmentLoader.jsx'
import { NewFormDialog } from '../shared/components/RecruitmentDialogs.jsx'
import { Orbit, Pill, RecruitmentShell, StepHead, Tilt } from '../shared/components/RecruitmentShell.jsx'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { ChoiceCards, HrField, LookupSelect } from '../shared/components/RecruitmentInputs.jsx'
import { Gauge, Radar, RatingRows } from './Scores.jsx'
import {
  BANDS, COMP_KEYS, HR_FIELDS, SCORE_MAX, SPEC_KEYS, bandLabel, blankInterview, hrField, interviewDoneSteps, interviewFormFromRecord, interviewPayload,
  interviewProgress, interviewStatus, isInterviewLocked, linkedPosition, ratedCount, salaryDelta, sumRatings, validateInterview,
} from './interviewModel.js'

const BASE = '/hr/recruitment/interview'
const service = hrRecruitmentServices.interviews
const NO_MISSING = Object.freeze({ spec: [], comp: [], outcome: false })

export default function InterviewPage() {
  return (
    <RecruitmentLoader current="interview" title={T.title} param="assessmentId" load={service.getById} loadLookups={(signal) => service.getLookups({ signal })}>
      {({ lookups, lookupStatus, reloadLookups, record, editorKey }) => <InterviewEditor key={editorKey} lookups={lookups} lookupStatus={lookupStatus} reloadLookups={reloadLookups} record={record} />}
    </RecruitmentLoader>
  )
}

const nameOf = (options, code) => options.find((option) => option.code === code)?.name ?? ''
const HR_REQUIRED = HR_FIELDS.filter(([, , rules]) => rules.required).map(([key]) => key)

function InterviewEditor({ lookups, lookupStatus, reloadLookups, record: savedRecord }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const permissions = usePermissions()
  const today = businessToday()
  const requestedRequisition = searchParams.get('requisitionNumber')?.trim().toLowerCase()
  // Only seed a new assessment from the server's current approved options.
  const sourceRequisition = !savedRecord && requestedRequisition
    ? lookups.requisitions.find((item) => item.requisitionNumber.toLowerCase() === requestedRequisition)
    : null
  const editor = useRecruitmentForm({
    basePath: BASE, idKey: 'assessmentId', record: savedRecord,
    initialForm: savedRecord
      ? interviewFormFromRecord(savedRecord)
      : { ...blankInterview(today), requisitionNumber: sourceRequisition?.requisitionNumber ?? '' },
  })
  const { form, record, step, setStep, patch } = editor
  const [errors, setErrors] = useState({})
  const [missing, setMissing] = useState(NO_MISSING)
  const [dialog, setDialog] = useState(null)
  const canSave = record ? permissions.can(ACTIONS.INTERVIEW_UPDATE) : permissions.can(ACTIONS.INTERVIEW_CREATE)
  const canDelete = Boolean(record && permissions.can(ACTIONS.INTERVIEW_DELETE))
  const locked = isInterviewLocked(record?.status) || !canSave

  // The backend lookup is restricted to approved requisitions.
  const linkedRequisition = lookups.requisitions.find((item) => item.requisitionNumber.toLowerCase() === form.requisitionNumber.trim().toLowerCase())
  const linkedTitle = linkedPosition(form.requisitionNumber, linkedRequisition && {
    requisitionNumber: linkedRequisition.requisitionNumber, status: 'Approved', jobTitle: linkedRequisition.jobName,
  })
  const savedTitle = record && record.requisitionNumber.toLowerCase() === form.requisitionNumber.trim().toLowerCase() ? record.positionTitle : ''
  const position = linkedTitle || (!lookups.lookupErrors?.includes('requisitions') ? '' : savedTitle || '')
  const linkChip = !form.requisitionNumber.trim() ? null
    : lookups.lookupErrors?.includes('requisitions') ? <Pill tone="warn">{T.link.failed}</Pill>
      : linkedTitle ? <Pill tone="ok">{T.link.linked(linkedRequisition.requisitionNumber)}</Pill>
          : <Pill tone="warn">{T.link.missing}</Pill>

  const lookupNotice = lookupStatus === 'loading'
    ? <p className="zrv-admin-state" role="status">Loading interview form options…</p>
    : lookupStatus === 'error' || lookups.lookupErrors?.length
      ? <div className="zrv-admin-state zrv-admin-state--error" role="alert">
          <p>Some interview form options could not be loaded. You can still enter the candidate details; retry to reload the available lists.</p>
          <button type="button" className="btn-secondary" onClick={reloadLookups}>Retry</button>
        </div>
      : null

  const set = (key) => (eventOrValue) => {
    editor.set(key)(eventOrValue)
    setErrors((current) => ({ ...current, [key]: undefined }))
  }
  const rate = (group) => (key, rating) => {
    patch((current) => ({ [group]: { ...current[group], [key]: { ...current[group][key], rating } } }))
    setMissing((current) => ({ ...current, [group]: current[group].filter((item) => item !== key) }))
  }
  const remark = (group) => (key, text) => patch((current) => ({ [group]: { ...current[group], [key]: { ...current[group][key], remark: text } } }))

  const doneSteps = interviewDoneSteps(form)
  const status = interviewStatus(form, record?.status)
  const progress = interviewProgress(form)
  const specTotal = sumRatings(form.spec)
  const compTotal = sumRatings(form.comp)
  const specRated = ratedCount(form.spec, SPEC_KEYS)
  const compRated = ratedCount(form.comp, COMP_KEYS)
  const expectedTotal = Number(form.expectedTotal) || 0
  const currentTotal = Number(form.currentTotal) || 0
  const delta = salaryDelta(form.expectedTotal, form.currentTotal)
  const joinDays = daysBetween(today, form.expectedJoiningDate)
  const signedDelta = delta === null ? COMMON_TEXT.dash : `${delta > 0 ? '+' : ''}${delta}%`

  // Save needs all four tabs; the first tab with a problem opens.
  const validate = () => {
    const result = validateInterview(form)
    setErrors(result.errors)
    setMissing(result.missing)
    if (!result.valid) editor.reject(result.firstStep, T.errors.incomplete, result.firstStep === 0 ? Object.values(result.errors) : [])
    return result.valid
  }
  const saveRecord = async ({ saved }) => {
    // The backend requires the position name; it is derived from the linked requisition.
    const result = await service.save(editor.recordId, { ...interviewPayload(form), positionTitle: position })
    saved(result)
    return result
  }
  const save = () => {
    if (!canSave) return editor.showProblem(T.readOnly)
    if (validate()) editor.perform(saveRecord, { success: (result) => T.saved(result.assessmentNumber) })
  }
  const deleteRecord = () => editor.perform(async () => {
    await service.remove(record.assessmentId)
    return true
  }, { success: T.deleted }).then((outcome) => {
    if (outcome.status === 'success') navigate(BASE, { replace: true })
  })
  // Leaving with unsaved answers asks first (New form and Report).
  const leave = (path) => (editor.dirty ? setDialog({ path }) : navigate(path))

  const input = (key) => {
    const [, type, rules] = hrField(key)
    const id = `ia-${key}`
    const label = T.labels[key]
    const error = errors[key]
    return (
      <HrField key={key} id={id} label={label} required={rules.required} error={error}>
        {type === 'select'
          ? <LookupSelect id={id} value={form[key]} onChange={set(key)} options={lookups[rules.lookup]} required={rules.required} error={error} />
          : <input {...fieldProps(id, { error })} className="ux-input zrv-hr-input" type={type} value={form[key]} onChange={set(key)}
            list={key === 'requisitionNumber' ? 'ia-approved-requisitions' : key === 'nationality' ? 'ia-nationalities' : undefined}
            aria-required={rules.required || undefined} inputMode={type === 'number' ? 'decimal' : undefined} min={rules.min} max={rules.max} maxLength={type === 'text' ? 200 : undefined} />}
        {key === 'requisitionNumber' && <datalist id="ia-approved-requisitions">{lookups.requisitions.map((item) => <option key={item.requisitionNumber} value={item.requisitionNumber}>{item.jobName}</option>)}</datalist>}
        {key === 'nationality' && <datalist id="ia-nationalities">{lookups.nationalities.map((name) => <option key={name} value={name} />)}</datalist>}
      </HrField>
    )
  }

  // The primary button saves, so the toolbar has no second Save.
  const tools = [
    ...(canDelete ? [{ icon: 'trash-2', label: T.deleteAction, onClick: () => setDialog('delete'), disabled: editor.pending }] : []),
    { icon: 'printer', label: COMMON_TEXT.print, onClick: () => window.print() },
    { icon: 'chart-column', label: COMMON_TEXT.report, onClick: () => leave(`${BASE}/report`) },
    { icon: 'file-plus', label: T.report.newAssessment, onClick: () => leave(BASE) },
    { icon: 'house', label: COMMON_TEXT.home, onClick: () => navigate('/dashboard') },
  ]
  const steps = [
    [T.tabNames[0], T.tabHints.required(HR_REQUIRED.filter((key) => String(form[key] ?? '').trim()).length, HR_REQUIRED.length)],
    [T.tabNames[1], T.tabHints.rated(specRated, SPEC_KEYS.length)],
    [T.tabNames[2], T.tabHints.rated(compRated, COMP_KEYS.length)],
    [T.tabNames[3], form.outcome ? T.outcomes[form.outcome] : T.tabHints.noResult],
  ]
  const scoreCards = [[T.card.spec, specTotal, SCORE_MAX.spec, BANDS.spec, specRated], [T.card.comp, compTotal, SCORE_MAX.comp, BANDS.comp, compRated]]

  return (
    <>
      <RecruitmentShell
        current="interview" title={T.title}
        flowStatus={record ? `${record.assessmentNumber} · ${T.status[record.status]}` : null}
        tools={tools} primary={{ label: T.primary, icon: 'save', onClick: save, disabled: !canSave }}
        feedback={editor.feedback} onDismissFeedback={editor.dismiss} lookupNotice={lookupNotice} locked={locked} pending={editor.pending} focusError={editor.focusError}
        banner={!record && sourceRequisition ? <p className="zrv-hr-draft-note"><OrvexaIcon name="info" size={17} /><span>Requisition <strong>{sourceRequisition.requisitionNumber}</strong> and position have been filled from the approved requisition. Complete the candidate details and assessment below.</span></p> : null}
        steps={steps} step={step} onStep={setStep} doneSteps={doneSteps} finalLabel={T.final} onFinal={save}
        side={<>
          <Tilt aria-label={T.card.label}>
            <div className="zrv-hr-dark__top"><span className="zrv-hr-mono">{record?.assessmentNumber || T.card.draft}</span><span className="zrv-hr-dark__status">{T.status[status]}</span></div>
            <div className="zrv-hr-dark__who">
              <span className="zrv-hr-dark__av" aria-hidden="true">{initials(form.candidateName)}</span>
              <div>
                <h3 className={`zrv-hr-dark__title${form.candidateName.trim() ? '' : ' zrv-hr-is-empty'}`}>{form.candidateName.trim() || T.card.candidate}</h3>
                <div className={`zrv-hr-dark__sub${position ? '' : ' zrv-hr-is-empty'}`}>{position || T.card.position}{form.divisionCode ? ` · ${nameOf(lookups.divisions, form.divisionCode)}` : ''}</div>
              </div>
            </div>
            <div className="zrv-hr-dark__badges">
              {form.outcome ? <span className={`zrv-hr-is-solid zrv-hr-is-${form.outcome.toLowerCase()}`}>{T.outcomes[form.outcome]}</span> : <span>{T.card.pending}</span>}
              {form.interviewTypeCode && <span>{nameOf(lookups.interviewTypes, form.interviewTypeCode)}</span>}
              {joinDays !== null && <span>{joinDays < 0 ? T.card.joinPassed : joinDays === 0 ? T.card.joinToday : T.card.joinIn(joinDays)}</span>}
            </div>
            <div className="zrv-hr-dark__grid">
              {scoreCards.map(([label, total, max, bands, rated]) => (
                <div key={label}><small>{label}</small><b>{total}<em>/{max}</em> · {bandLabel(total, bands, rated > 0)}</b><div className="zrv-hr-bar"><i style={{ transform: `scaleX(${total / max})` }} /></div></div>
              ))}
              <div><small>{T.card.expected}</small><b>{expectedTotal ? formatAmount(expectedTotal) : COMMON_TEXT.dash}</b></div>
              <div><small>{T.card.versus}</small><b>{signedDelta}</b></div>
            </div>
          </Tilt>
          {step === 1 && <section className="zrv-hr-scorecard zrv-hr-card"><Gauge total={specTotal} max={SCORE_MAX.spec} bands={BANDS.spec} rated={specRated} count={SPEC_KEYS.length} /><Radar keys={SPEC_KEYS} values={form.spec} /></section>}
          {step === 2 && <section className="zrv-hr-scorecard zrv-hr-card"><Gauge total={compTotal} max={SCORE_MAX.comp} bands={BANDS.comp} rated={compRated} count={COMP_KEYS.length} /><Radar keys={COMP_KEYS} values={form.comp} /></section>}
          <Orbit done={progress.filled} total={progress.total}
            hint={doneSteps.every(Boolean) ? T.orbitDone : COMMON_TEXT.stillOpen(T.tabNames.filter((_, index) => !doneSteps[index]))} />
        </>}
      >
        {step === 0 && <>
          <StepHead {...T.heads[0]} />
          <h3 className="zrv-hr-subh">{T.subheads.interview}</h3>
          <div className="zrv-hr-grid zrv-hr-is-4">
            <HrField id="ia-no" label={T.labels.assessmentNumber}>
              <input id="ia-no" className="ux-input zrv-hr-input" readOnly value={record?.assessmentNumber ?? ''} placeholder={T.placeholders.numberPending} />
            </HrField>
            {input('requisitionNumber')}
            <HrField id="ia-pos" label={T.labels.position} hint={linkChip}>
              <input {...fieldProps('ia-pos', { hint: linkChip })} className="ux-input zrv-hr-input" readOnly value={position} placeholder={T.placeholders.position} />
            </HrField>
            <HrField id="ia-status" label={T.labels.status}>
              <input id="ia-status" className="ux-input zrv-hr-input" readOnly value={T.status[status]} />
            </HrField>
            {['preScreeningDate', 'interviewTime', 'divisionCode', 'expectedJoiningDate', 'interviewTypeCode'].map(input)}
          </div>
          <h3 className="zrv-hr-subh">{T.subheads.candidate}</h3>
          <div className="zrv-hr-grid zrv-hr-is-4">
            {['candidateName', 'candidateAge', 'nationality', 'maritalStatusCode', 'location', 'certificateCode', 'certificateCheckedCode', 'major', 'currentEmployer', 'lastPosition', 'relevantExperienceYears'].map(input)}
          </div>
          <h3 className="zrv-hr-subh">{T.subheads.salary}</h3>
          <div className="zrv-hr-grid zrv-hr-is-4">{['expectedBasic', 'expectedTotal', 'currentBasic', 'currentTotal'].map(input)}</div>
          {expectedTotal > 0 && currentTotal > 0 && (
            <p className="zrv-hr-note zrv-hr-reveal">{T.note(formatAmount(Math.abs(expectedTotal - currentTotal)), expectedTotal >= currentTotal, delta)}</p>
          )}
        </>}

        {step === 1 && <>
          <StepHead {...T.heads[1]} />
          <RatingRows group="spec" keys={SPEC_KEYS} values={form.spec} onRate={rate('spec')} onRemark={remark('spec')} missing={missing.spec} />
          <div className="zrv-hr-grid zrv-hr-mt">
            <HrField id="ia-specrem" label={T.labels.specRemarks} wide>
              <input id="ia-specrem" className="ux-input zrv-hr-input" value={form.specRemarks} onChange={set('specRemarks')} maxLength={500} />
            </HrField>
          </div>
        </>}

        {step === 2 && <>
          <StepHead {...T.heads[2]} />
          <RatingRows group="comp" keys={COMP_KEYS} values={form.comp} onRate={rate('comp')} onRemark={remark('comp')} missing={missing.comp} />
          <div className="zrv-hr-grid zrv-hr-is-2 zrv-hr-mt">
            <HrField id="ia-comprem" label={T.labels.compRemarks} wide>
              <input id="ia-comprem" className="ux-input zrv-hr-input" value={form.compRemarks} onChange={set('compRemarks')} maxLength={500} />
            </HrField>
            <HrField id="ia-str" label={T.labels.strengths}>
              <textarea id="ia-str" className="ux-textarea zrv-hr-input" value={form.strengths} onChange={set('strengths')} />
            </HrField>
            <HrField id="ia-weak" label={T.labels.weakness}>
              <textarea id="ia-weak" className="ux-textarea zrv-hr-input" value={form.weakness} onChange={set('weakness')} />
            </HrField>
          </div>
        </>}

        {step === 3 && <>
          <StepHead {...T.heads[3]} />
          <ChoiceCards compact label={T.labels.outcome} value={form.outcome} error={missing.outcome ? T.errors.outcome : ''}
            onChange={(value) => { set('outcome')(value); setMissing((current) => ({ ...current, outcome: false })) }}
            options={[
              { value: 'PASSED', icon: 'check', title: T.outcomes.PASSED, tone: 'pass' },
              { value: 'HOLD', icon: 'clock', title: T.outcomes.HOLD, tone: 'hold' },
              { value: 'FAILED', icon: 'x', title: T.outcomes.FAILED, tone: 'fail' },
            ]} />
          <div className="zrv-hr-grid zrv-hr-is-3 zrv-hr-mt">
            <HrField id="ia-adm" label={T.labels.adminManager}>
              <input id="ia-adm" className="ux-input zrv-hr-input" readOnly value={form.adminManagerName} placeholder={T.placeholders.adminManager} />
            </HrField>
            <HrField id="ia-rep" label={T.labels.deptRep}>
              <input id="ia-rep" className="ux-input zrv-hr-input" value={form.departmentRepresentative} onChange={set('departmentRepresentative')} maxLength={200} />
            </HrField>
            <HrField id="ia-pay" label={T.labels.payroll}>
              <select id="ia-pay" className="ux-input zrv-hr-input" value={form.payroll} onChange={set('payroll')}>
                <option value="">Choose a business unit</option>
                {lookups.payrollBusinessUnits.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
            </HrField>
            {form.interviewers.map((name, index) => (
              <HrField key={index} id={`ia-int${index + 1}`} label={T.labels.interviewer(index)}>
                <input id={`ia-int${index + 1}`} className="ux-input zrv-hr-input" value={name} maxLength={200} list="ia-employee-options"
                  onChange={(event) => { const value = event.target.value; patch((current) => ({ interviewers: current.interviewers.map((item, position) => (position === index ? value : item)) })) }} />
              </HrField>
            ))}
            <datalist id="ia-employee-options">{lookups.employees.map((name) => <option key={name} value={name} />)}</datalist>
            <HrField id="ia-hrc" label={T.labels.hrComment} wide>
              <input id="ia-hrc" className="ux-input zrv-hr-input" value={form.hrComment} onChange={set('hrComment')} maxLength={500} />
            </HrField>
          </div>
        </>}
      </RecruitmentShell>

      {dialog === 'delete' && <ConfirmDialog title={T.deleteTitle} description={T.deleteBody} confirmLabel={T.deleteAction} pending={editor.pending}
        feedback={editor.feedback} onConfirm={deleteRecord} onClose={() => setDialog(null)} />}
      {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
    </>
  )
}
