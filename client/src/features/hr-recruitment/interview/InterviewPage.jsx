import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import ContentSkeleton from '@/components/feedback/ContentSkeleton.jsx'
import { ConfirmDialog } from '@/features/security-administration/components/AdminUi.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from '../hrRecruitmentActions.js'
import { COMMON_TEXT, INTERVIEW_TEXT as T } from '../hrRecruitmentText.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { businessToday, daysBetween, enDate, formatAmount, initials } from '../shared/hrFormat.js'
import { useRecruitmentForm } from '../shared/useRecruitmentForm.js'
import { useRecruitmentSteps } from '../shared/useRecruitmentSteps.js'
import { reviewCompletion, reviewField } from '../shared/recruitmentSteps.js'
import { RecruitmentLoader } from '../shared/components/RecruitmentLoader.jsx'
import { NewFormDialog } from '../shared/components/RecruitmentDialogs.jsx'
import { Orbit, Pill, RecruitmentShell, StepHead, Tilt } from '../shared/components/RecruitmentShell.jsx'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { ChoiceCards, HrField, Review, SearchableLookup } from '../shared/components/RecruitmentInputs.jsx'
import { Gauge, Radar, RatingRows } from './Scores.jsx'
import {
  BANDS, COMP_KEYS, HR_FIELDS, INTERVIEW_VALIDATION_FIELDS, SCORE_MAX, SPEC_KEYS, bandLabel, blankInterview, hrField, interviewFormFromRecord, interviewPayload,
  interviewStepErrors, isInterviewLocked, linkedPosition, ratedCount, salaryDelta, sumRatings, INTERVIEW_SALARY_KEYS,
} from './interviewModel.js'

const BASE = '/hr/recruitment/interview'
const service = hrRecruitmentServices.interviews

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
    stepCount: 5, validationFields: INTERVIEW_VALIDATION_FIELDS,
    initialForm: savedRecord
      ? interviewFormFromRecord(savedRecord)
      : { ...blankInterview(today), requisitionNumber: sourceRequisition?.requisitionNumber ?? '' },
  })
  const { form, record, step, setStep, patch } = editor
  const [saving, setSaving] = useState(false)
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
  const position = linkedTitle || savedTitle || ''
  const linkChip = !form.requisitionNumber.trim() ? null
    : lookups.lookupErrors?.includes('requisitions') ? <Pill tone="warn">{T.link.failed}</Pill>
      : linkedTitle ? <Pill tone="ok">{T.link.linked(linkedRequisition.requisitionNumber)}</Pill>
          : <Pill tone="warn">{T.link.missing}</Pill>

  const stepErrors = interviewStepErrors(form, lookups)
  if (form.requisitionNumber.trim() && !position && !lookups.lookupErrors?.includes('requisitions')) {
    stepErrors[0].requisitionNumber = 'Choose an approved requisition from the available options.'
  }
  const navigation = useRecruitmentSteps({ step, setStep, errorsByStep: stepErrors, reject: editor.reject, readOnly: locked })
  const errors = { ...navigation.errors, ...editor.fieldErrors }
  const allErrors = { ...Object.assign({}, ...stepErrors), ...editor.fieldErrors }
  const missing = {
    spec: SPEC_KEYS.filter((key) => errors[`spec.${key}`]),
    comp: COMP_KEYS.filter((key) => errors[`comp.${key}`]),
    outcome: Boolean(errors.outcome),
  }

  const lookupNotice = lookupStatus === 'loading'
    ? <ContentSkeleton variant="inline" label="Preparing interview options" />
    : lookupStatus === 'error' || lookups.lookupErrors?.length
      ? <div className="zrv-admin-state zrv-admin-state--error" role="alert">
          <p>Some interview form options could not be loaded. You can still enter the candidate details; retry to reload the available lists.</p>
          <button type="button" className="btn-secondary" onClick={reloadLookups}>Retry</button>
        </div>
      : null

  const set = (key) => (eventOrValue) => {
    const value = typeof eventOrValue === 'string' ? eventOrValue : eventOrValue?.target?.value
    if (INTERVIEW_SALARY_KEYS.includes(key) && value !== '' && !/^(?:\d{0,12})?(?:\.\d{0,2})?$/.test(value)) return
    editor.set(key)(eventOrValue)
  }
  const setInterviewer = (index) => (value) => {
    patch((current) => ({ interviewers: current.interviewers.map((name, position) => (position === index ? value : name)) }))
  }
  const rate = (group) => (key, rating) => {
    patch((current) => ({ [group]: { ...current[group], [key]: { ...current[group][key], rating } } }))
  }
  const remark = (group) => (key, text) => patch((current) => ({ [group]: { ...current[group], [key]: { ...current[group][key], remark: text } } }))

  const doneSteps = navigation.doneSteps
  const status = record?.status ?? 'INCOMPLETE'
  const specTotal = sumRatings(form.spec)
  const compTotal = sumRatings(form.comp)
  const specRated = ratedCount(form.spec, SPEC_KEYS)
  const compRated = ratedCount(form.comp, COMP_KEYS)
  const expectedTotal = Number(form.expectedTotal) || 0
  const currentTotal = Number(form.currentTotal) || 0
  const delta = salaryDelta(form.expectedTotal, form.currentTotal)
  const joinDays = daysBetween(today, form.expectedJoiningDate)
  const signedDelta = delta === null ? COMMON_TEXT.dash : `${delta > 0 ? '+' : ''}${delta}%`

  const saveRecord = async ({ saved }) => {
    // The backend requires the position name; it is derived from the linked requisition.
    const result = await service.save(editor.recordId, { ...interviewPayload(form), positionTitle: position })
    saved(result)
    return result
  }
  const save = async () => {
    if (saving || editor.pending) return
    if (!canSave) return editor.showProblem(T.readOnly || COMMON_TEXT.readOnly)
    if (!navigation.validateAll()) return
    setSaving(true)
    try {
      const outcome = await editor.perform(saveRecord, { success: (result) => `${T.saved(result.assessmentNumber)} Status: ${T.status[result.status] || result.status}.` })
      if (outcome.status === 'success') editor.resetToSaved(outcome.value, interviewFormFromRecord(outcome.value))
      return outcome
    } finally {
      setSaving(false)
    }
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
    if (key === 'requisitionNumber') {
      return (
        <HrField key={key} id={id} label={label} required={rules.required} error={error}>
          <SearchableLookup
            id={id}
            value={form.requisitionNumber}
            customValue={form.requisitionNumber}
            options={lookups.requisitions.map((item) => ({
              code: item.requisitionNumber,
              name: item.requisitionNumber,
              description: item.jobName,
              searchText: `${item.requisitionNumber} ${item.jobName}`,
            }))}
            onChange={(option) => set(key)(option.code)}
            onInputChange={() => set(key)('')}
            maxLength={100}
            required={rules.required}
            error={error}
            loading={lookupStatus === 'loading'}
            placeholder="Search approved requisitions"
            noResults="No approved requisitions match your search"
          />
        </HrField>
      )
    }
    return (
      <HrField key={key} id={id} label={label} required={rules.required} error={error}>
        {type === 'select' || key === 'nationality'
          ? <SearchableLookup id={id} value={form[key]} customValue={form[key]} onChange={(option) => set(key)(option.code)} onInputChange={key === 'nationality' ? () => set(key)('') : undefined}
              onClear={!rules.required ? () => set(key)('') : undefined}
              options={key === 'nationality' ? lookups.nationalities.map((name) => ({ code: name, name })) : lookups[rules.lookup]}
              placeholder={`Search ${label.toLowerCase()}`} maxLength={key === 'nationality' ? 100 : 200} required={rules.required} error={error} />
          : <input {...fieldProps(id, { error })} className="ux-input zrv-hr-input" type={INTERVIEW_SALARY_KEYS.includes(key) ? 'text' : type} value={form[key]} onChange={set(key)}
              aria-required={rules.required || undefined} inputMode={INTERVIEW_SALARY_KEYS.includes(key) ? 'decimal' : type === 'number' ? 'numeric' : undefined} min={rules.min} max={rules.max} step={type === 'number' ? 1 : undefined} maxLength={INTERVIEW_SALARY_KEYS.includes(key) ? 20 : type === 'text' ? (key === 'nationality' ? 100 : 200) : undefined} />}
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
    [T.tabNames[3], T.tabHints.required(Number(Boolean(form.outcome)) + Number(Boolean(form.payroll)), 2)],
    ['Review', navigation.firstInvalid < 0 ? 'Ready to save' : 'Check required details'],
  ]
  const scoreCards = [[T.card.spec, specTotal, SCORE_MAX.spec, BANDS.spec, specRated], [T.card.comp, compTotal, SCORE_MAX.comp, BANDS.comp, compRated]]

  const hrReview = (keys) => keys.map((key) => {
    const [, type, rules] = hrField(key)
    const value = type === 'select' ? nameOf(lookups[rules.lookup], form[key]) || form[key] : type === 'date' ? enDate(form[key]) : form[key]
    return reviewField(T.labels[key], value, Boolean(rules.required), allErrors[key])
  })
  const ratingReview = (group, keys) => keys.flatMap((key) => [
    reviewField(T.criteria[key][0], form[group][key].rating, true, allErrors[`${group}.${key}`]),
    reviewField(`${T.criteria[key][0]} - remark`, form[group][key].remark, false, allErrors[`${group}.${key}.remark`]),
  ])
  const reviewSections = [
    { title: 'Interview and requisition', rows: [
      ...hrReview(['requisitionNumber', 'preScreeningDate', 'interviewTime', 'divisionCode', 'expectedJoiningDate', 'interviewTypeCode']),
      reviewField(T.labels.position, position),
    ] },
    { title: 'Candidate profile', rows: hrReview(['candidateName', 'candidateAge', 'nationality', 'maritalStatusCode', 'location', 'certificateCode', 'certificateCheckedCode', 'major', 'currentEmployer', 'lastPosition', 'relevantExperienceYears']) },
    { title: 'Salary details', rows: hrReview(['expectedBasic', 'expectedTotal', 'currentBasic', 'currentTotal']) },
    { title: 'Personal specification', rows: [...ratingReview('spec', SPEC_KEYS), reviewField('Personal specification remarks', form.specRemarks, false, allErrors.specRemarks), reviewField('Personal specification score', `${specTotal}/${SCORE_MAX.spec}`)] },
    { title: 'Competency', rows: [...ratingReview('comp', COMP_KEYS), reviewField('Competency remarks', form.compRemarks, false, allErrors.compRemarks), reviewField('Competency score', `${compTotal}/${SCORE_MAX.comp}`), reviewField(T.labels.strengths, form.strengths, false, allErrors.strengths), reviewField(T.labels.weakness, form.weakness, false, allErrors.weakness)] },
    { title: 'Evaluation and interview panel', rows: [
      reviewField(T.labels.outcome, T.outcomes[form.outcome], true, allErrors.outcome),
      reviewField(T.labels.payroll, nameOf(lookups.payrollBusinessUnits, form.payroll) || form.payroll, true, allErrors.payroll),
      reviewField(T.labels.adminManager, form.adminManagerName), reviewField(T.labels.deptRep, form.departmentRepresentative, false, allErrors.departmentRepresentative),
      reviewField('Managing director', form.managingDirector), reviewField('HR representative', form.hrRepresentative),
      ...form.interviewers.map((name, index) => reviewField(T.labels.interviewer(index), name, false, allErrors[`interviewer${index}`])),
      reviewField(T.labels.hrComment, form.hrComment, false, allErrors.hrComment),
    ] },
  ]
  const reviewProgress = reviewCompletion(reviewSections)
  const saveLabel = saving ? 'Saving...' : record ? 'Save changes' : T.primary

  return (
    <>
      <RecruitmentShell
        current="interview" title={T.title}
        flowStatus={record ? `${record.assessmentNumber} · ${T.status[record.status]}` : null}
        tools={tools} primary={{ label: saveLabel, icon: 'save', onClick: save, disabled: !canSave }}
        secondaryAction={canSave && (!record || ['INCOMPLETE', 'REJECTED'].includes(record.status)) ? { label: 'Submit for Approval', icon: 'send', onClick: () => editor.showNotice('The approval workflow is pending setup. This assessment has not been submitted.') } : null}
        feedback={editor.feedback} feedbackMode="toast" pendingMessage={saving ? "Saving interview assessment" : editor.pending ? "Updating interview assessment" : null} onDismissFeedback={editor.dismiss} lookupNotice={lookupNotice} locked={locked} pending={editor.pending} focusError={editor.focusError}
        banner={<><p className="zrv-hr-draft-note"><OrvexaIcon name="info" size={17} /><span><strong>{record ? 'Save changes' : T.primary}</strong> stores the assessment without submitting it for approval. New assessments are saved as Incomplete.</span></p>{!record && sourceRequisition ? <p className="zrv-hr-draft-note"><OrvexaIcon name="info" size={17} /><span>Requisition <strong>{sourceRequisition.requisitionNumber}</strong> and position have been filled from the approved requisition. Complete the candidate details and assessment below.</span></p> : null}</>}
        steps={steps} step={step} onStep={setStep} doneSteps={doneSteps} lockedSteps={navigation.lockedSteps} onContinue={navigation.validateStep} finalLabel={saveLabel} onFinal={save}
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
          <Orbit done={reviewProgress.complete} total={reviewProgress.total}
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
          <RatingRows errors={errors} group="spec" keys={SPEC_KEYS} values={form.spec} onRate={rate('spec')} onRemark={remark('spec')} missing={missing.spec} />
          <div className="zrv-hr-grid zrv-hr-mt">
            <HrField id="ia-specrem" error={errors.specRemarks} label={T.labels.specRemarks} wide>
              <input {...fieldProps('ia-specrem', { error: errors.specRemarks })} className="ux-input zrv-hr-input" value={form.specRemarks} onChange={set('specRemarks')} maxLength={500} />
            </HrField>
          </div>
        </>}

        {step === 2 && <>
          <StepHead {...T.heads[2]} />
          <RatingRows errors={errors} group="comp" keys={COMP_KEYS} values={form.comp} onRate={rate('comp')} onRemark={remark('comp')} missing={missing.comp} />
          <div className="zrv-hr-grid zrv-hr-is-2 zrv-hr-mt">
            <HrField id="ia-comprem" error={errors.compRemarks} label={T.labels.compRemarks} wide>
              <input {...fieldProps('ia-comprem', { error: errors.compRemarks })} className="ux-input zrv-hr-input" value={form.compRemarks} onChange={set('compRemarks')} maxLength={500} />
            </HrField>
            <HrField id="ia-str" error={errors.strengths} label={T.labels.strengths}>
              <textarea {...fieldProps('ia-str', { error: errors.strengths })} className="ux-textarea zrv-hr-input" value={form.strengths} onChange={set('strengths')} maxLength={4000} />
            </HrField>
            <HrField id="ia-weak" error={errors.weakness} label={T.labels.weakness}>
              <textarea {...fieldProps('ia-weak', { error: errors.weakness })} className="ux-textarea zrv-hr-input" value={form.weakness} onChange={set('weakness')} maxLength={4000} />
            </HrField>
          </div>
        </>}

        {step === 3 && <>
          <StepHead {...T.heads[3]} />
          <ChoiceCards compact label={T.labels.outcome} value={form.outcome} error={missing.outcome ? T.errors.outcome : ''}
            onChange={set('outcome')}
            options={[
              { value: 'PASSED', icon: 'check', title: T.outcomes.PASSED, tone: 'pass' },
              { value: 'HOLD', icon: 'clock', title: T.outcomes.HOLD, tone: 'hold' },
              { value: 'FAILED', icon: 'x', title: T.outcomes.FAILED, tone: 'fail' },
            ]} />
          <div className="zrv-hr-grid zrv-hr-is-3 zrv-hr-mt">
            <HrField id="ia-adm" label={T.labels.adminManager}>
              <input id="ia-adm" className="ux-input zrv-hr-input" readOnly value={form.adminManagerName} placeholder={T.placeholders.adminManager} />
            </HrField>
            <HrField id="ia-rep" error={errors.departmentRepresentative} label={T.labels.deptRep}>
              <input {...fieldProps('ia-rep', { error: errors.departmentRepresentative })} className="ux-input zrv-hr-input" value={form.departmentRepresentative} onChange={set('departmentRepresentative')} maxLength={200} />
            </HrField>
            <HrField id="ia-pay" label={T.labels.payroll} required error={errors.payroll}>
              <SearchableLookup id="ia-pay" value={form.payroll} customValue={form.payroll} options={lookups.payrollBusinessUnits}
                onChange={(option) => set('payroll')(option.code)} placeholder="Choose a payroll business unit" required error={errors.payroll} />
            </HrField>
            {form.interviewers.map((name, index) => (
              <HrField key={index} id={`ia-int${index + 1}`} label={T.labels.interviewer(index)} error={errors[`interviewer${index}`]}>
                <SearchableLookup
                  id={`ia-int${index + 1}`}
                  value={name}
                  error={errors[`interviewer${index}`]}
                  customValue={name}
                  options={lookups.employees.map((employee) => ({ code: employee, name: employee }))}
                  onChange={(option) => setInterviewer(index)(option.code)}
                  onInputChange={() => setInterviewer(index)('')}
                  loading={lookupStatus === 'loading'}
                  placeholder="Search employees by name"
                  noResults="No employees match your search"
                  maxLength={200}
                />
              </HrField>
            ))}
            <HrField id="ia-hrc" error={errors.hrComment} label={T.labels.hrComment} wide>
              <input {...fieldProps('ia-hrc', { error: errors.hrComment })} className="ux-input zrv-hr-input" value={form.hrComment} onChange={set('hrComment')} maxLength={500} />
            </HrField>
          </div>
        </>}
        {step === 4 && <>
          <StepHead title="Review assessment" />
          <Review sections={reviewSections} {...reviewProgress} formTitle="Interview Assessment" reference={record?.assessmentNumber} approvalStatus={T.status[status] || status} />
        </>}
      </RecruitmentShell>

      {dialog === 'delete' && <ConfirmDialog title={T.deleteTitle} description={T.deleteBody} confirmLabel={T.deleteAction} pending={editor.pending}
        feedback={editor.feedback} onConfirm={deleteRecord} onClose={() => setDialog(null)} />}
      {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
    </>
  )
}
