import { useState } from 'react'
import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { ConfirmDialog } from '@/features/security-administration/components/AdminUi.jsx'
import { COMMON_TEXT, REQUISITION_TEXT as T } from '../hrRecruitmentText.js'
import { attachmentsSupported, hrRecruitmentServices } from '../hrRecruitmentService.js'
import { businessToday, enDate } from '../shared/hrFormat.js'
import { useRecruitmentForm } from '../shared/useRecruitmentForm.js'
import { RecruitmentLoader } from '../shared/components/RecruitmentLoader.jsx'
import { NewFormDialog, ReportDialog } from '../shared/components/RecruitmentDialogs.jsx'
import { Orbit, PanelHead, Pill, RecruitmentShell, RouteCard, Ticket, Tilt } from '../shared/components/RecruitmentShell.jsx'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { ChoiceCards, ExpTrack, FileDrop, HrField, LookupSelect, MultiTiles, Review, TagInput } from '../shared/components/RecruitmentInputs.jsx'
import {
  approvalRoute, blankRequisition, isRequisitionLocked, leadTime, minimumEducation, requisitionFormFromRecord, requisitionPayload, requisitionProgress,
} from './requisitionModel.js'

const BASE = '/hr/recruitment/requisition'
const service = hrRecruitmentServices.requisitions

export default function RequisitionPage() {
  return (
    <RecruitmentLoader current="requisition" title={T.title} subtitle={T.subtitle} param="requisitionId" load={service.getById}>
      {({ lookups, record, editorKey }) => <RequisitionEditor key={editorKey} lookups={lookups} record={record} />}
    </RecruitmentLoader>
  )
}

const nameOf = (options, code) => options.find((option) => option.code === code)?.name ?? ''

function RequisitionEditor({ lookups, record: savedRecord }) {
  const navigate = useNavigate()
  const today = businessToday()
  const editor = useRecruitmentForm({
    basePath: BASE, idKey: 'requisitionId', record: savedRecord,
    initialForm: savedRecord ? requisitionFormFromRecord(savedRecord) : blankRequisition(today),
  })
  const { form, set, record, step, setStep } = editor
  const [dialog, setDialog] = useState(null)
  const [showErrors, setShowErrors] = useState(false)
  const locked = isRequisitionLocked(record?.status)
  const progress = requisitionProgress(form)
  const errors = showErrors ? Object.fromEntries(progress.missing.map((check) => [check.key, COMMON_TEXT.required])) : {}
  const lead = leadTime(today, form.neededDate)
  const route = approvalRoute(lookups.approvalRoute, form.budgeted)
  const education = minimumEducation(form.educationCodes, lookups.educationLevels)
  const department = nameOf(lookups.departments, form.departmentCode)
  const bands = lookups.experienceBands
  const statusLabel = T.status[record?.status ?? 'NEW']
  const body = () => requisitionPayload(form, { attachments: attachmentsSupported })

  const save = () => editor.perform(async ({ saved }) => {
    const result = await service.saveDraft(editor.recordId, body())
    saved(result)
    return result
  }, { success: (result) => T.saved(result.requisitionNumber) })

  const submit = () => editor.perform(async ({ saved }) => {
    const draft = await service.saveDraft(editor.recordId, body())
    saved(draft)
    const result = await service.submit(draft.requisitionId)
    saved(result)
    return result
  }, { success: (result) => T.submitted(result.requisitionNumber) }).then((outcome) => {
    // A failure stays visible inside the dialog.
    if (outcome.status === 'success') setDialog(null)
  })

  const reviewAndSubmit = () => {
    if (progress.missing.length) {
      setShowErrors(true)
      editor.reject(progress.firstStep, `${COMMON_TEXT.stillNeeded} ${progress.missing.map((check) => check.label).join(', ')}`)
      return
    }
    setDialog('submit')
  }
  const startNew = () => navigate(BASE)

  const tools = [
    { icon: 'save', label: COMMON_TEXT.save, onClick: save, disabled: locked || editor.pending },
    { icon: 'printer', label: COMMON_TEXT.print, onClick: () => window.print() },
    { icon: 'chart-column', label: COMMON_TEXT.report, onClick: () => setDialog('report') },
    { icon: 'file-plus', label: COMMON_TEXT.requestForm, onClick: () => (editor.dirty ? setDialog('new') : startNew()) },
    { icon: 'house', label: COMMON_TEXT.home, onClick: () => navigate('/dashboard') },
  ]
  const ticketStatus = locked ? T.ticket.closed : T.ticket.open

  return (
    <>
      <RecruitmentShell
        current="requisition" title={T.title} subtitle={T.subtitle}
        flowStatus={record ? [record.requisitionNumber, statusLabel].filter(Boolean).join(' · ') : null}
        tools={tools} primary={{ label: T.primary, icon: 'send', onClick: () => (step === 3 ? reviewAndSubmit() : setStep(3)) }}
        feedback={editor.feedback} onDismissFeedback={editor.dismiss} locked={locked} pending={editor.pending} focusError={editor.focusError}
        ticket={<Ticket avatar="ZP" code={T.code} items={[
          { k: T.ticket.number, v: record?.requisitionNumber || T.ticket.numberPending },
          { k: T.ticket.requester, v: record?.requesterName || T.ticket.requesterPending, big: true },
          { k: T.ticket.requestDate, v: enDate(record?.requestDate ?? today).replace(/ /g, '-') },
          { k: T.ticket.status, v: statusLabel },
          { k: T.ticket.ticketStatus, v: <Pill tone={locked ? 'warn' : 'ok'}>{ticketStatus}</Pill> },
        ]} />}
        steps={T.steps} step={step} onStep={setStep} doneSteps={progress.doneSteps} finalLabel={T.final} onFinal={reviewAndSubmit}
        side={<>
          <Tilt aria-label={T.card.label}>
            <div className="zrv-hr-dark__top"><span className="zrv-hr-eyebrow">{T.card.eyebrow}</span><span className="zrv-hr-mono">{T.card.brand}</span></div>
            <h3 className={`zrv-hr-dark__title${form.jobTitle.trim() ? '' : ' zrv-hr-is-empty'}`}>{form.jobTitle.trim() || T.card.jobTitle}</h3>
            <div className={`zrv-hr-dark__sub${department ? '' : ' zrv-hr-is-empty'}`}>{department || T.card.department}</div>
            <div className="zrv-hr-dark__badges">
              {form.reason && <span className="zrv-hr-is-solid">{form.reason === 'REPLACEMENT' ? T.card.replacement : T.card.addition}</span>}
              {form.budgeted && <span>{form.budgeted === 'yes' ? T.card.budgeted : T.card.notBudgeted}</span>}
              {form.reason === 'REPLACEMENT' && form.replacementFor.trim() && <span>{T.card.replacementFor(form.replacementFor.trim())}</span>}
              {!form.reason && !form.budgeted && <span>{T.card.draft}</span>}
            </div>
            <div className="zrv-hr-dark__grid">
              <div><small>{T.card.neededBy}</small><b>{form.neededDate ? enDate(form.neededDate) : COMMON_TEXT.dash}</b></div>
              <div><small>{T.card.education}</small><b>{education ? `${education.name}${education.more ? ` +${education.more}` : ''}` : COMMON_TEXT.dash}</b></div>
              {[[T.labels.gccExperience, form.gccExperienceCode], [T.labels.workExperience, form.workExperienceCode]].map(([label, code]) => {
                const index = bands.findIndex((band) => band.code === code)
                return <div key={label}><small>{label}</small><div className="zrv-hr-meter">{bands.map((band, position) => <i key={band.code} className={index >= 0 && position <= index ? 'zrv-hr-is-on' : ''} />)}</div></div>
              })}
            </div>
            <div className="zrv-hr-dark__chips">{form.skills.slice(0, 6).map((skill) => <span key={skill}>{skill}</span>)}{form.skills.length > 6 && <span>+{form.skills.length - 6}</span>}</div>
          </Tilt>
          <Orbit done={progress.done} total={progress.total} hint={progress.missing.length ? COMMON_TEXT.next(progress.missing.slice(0, 2).map((check) => check.label)) : T.orbitReady} />
          <RouteCard title={T.route.title} note={T.route.note} steps={route} />
        </>}
      >
        {step === 0 && <>
          <PanelHead n={1} {...T.heads[0]} />
          <div className="zrv-hr-grid">
            <HrField id="rq-title" label={T.labels.jobTitle} required error={errors.jobTitle}>
              <input {...fieldProps('rq-title', { error: errors.jobTitle })} className="ux-input zrv-hr-input" value={form.jobTitle} onChange={set('jobTitle')} placeholder={T.placeholders.jobTitle} autoComplete="off" aria-required="true" maxLength={200} />
            </HrField>
            <HrField id="rq-dept" label={T.labels.department} required error={errors.departmentCode}>
              <LookupSelect id="rq-dept" value={form.departmentCode} onChange={set('departmentCode')} options={lookups.departments} placeholder={T.placeholders.department} required error={errors.departmentCode} />
            </HrField>
            <HrField id="rq-need" label={T.labels.neededDate} required error={errors.neededDate} hint={lead && <Pill tone={lead.tone || 'ok'}>{lead.text}</Pill>}>
              <input {...fieldProps('rq-need', { error: errors.neededDate, hint: lead?.text })} type="date" className="ux-input zrv-hr-input" value={form.neededDate} onChange={set('neededDate')} aria-required="true" />
            </HrField>
            <HrField id="rq-remark" label={T.labels.remark} wide>
              <textarea id="rq-remark" className="ux-textarea zrv-hr-input" value={form.remark} onChange={set('remark')} placeholder={T.placeholders.remark} />
            </HrField>
          </div>
        </>}

        {step === 1 && <>
          <PanelHead n={2} {...T.heads[1]} />
          <ChoiceCards label={T.labels.reason} value={form.reason} onChange={set('reason')} error={errors.reason} options={[
            { value: 'REPLACEMENT', icon: 'users', ...T.reasons.REPLACEMENT },
            { value: 'ADDITION', icon: 'plus', ...T.reasons.ADDITION },
          ]} />
          {form.reason === 'REPLACEMENT' && (
            <div className="zrv-hr-reveal zrv-hr-mt">
              <HrField id="rq-rep" label={T.labels.replacementFor} required error={errors.replacementFor}>
                <input {...fieldProps('rq-rep', { error: errors.replacementFor })} className="ux-input zrv-hr-input" value={form.replacementFor} onChange={set('replacementFor')} placeholder={T.placeholders.replacementFor} aria-required="true" maxLength={200} />
              </HrField>
            </div>
          )}
          {form.reason === 'ADDITION' && (
            <div className="zrv-hr-reveal zrv-hr-mt">
              <HrField id="rq-add" label={T.labels.additionReason} required error={errors.additionReason}>
                <textarea {...fieldProps('rq-add', { error: errors.additionReason })} className="ux-textarea zrv-hr-input" value={form.additionReason} onChange={set('additionReason')} placeholder={T.placeholders.additionReason} aria-required="true" />
              </HrField>
            </div>
          )}
          <div className="zrv-hr-sep" />
          <ChoiceCards compact label={T.labels.budgeted} value={form.budgeted} onChange={set('budgeted')} error={errors.budgeted} options={[
            { value: 'yes', icon: 'check', ...T.budget.yes },
            { value: 'no', icon: 'wallet', ...T.budget.no },
          ]} />
          <div className="zrv-hr-grid zrv-hr-mt">
            {form.budgeted === 'yes' && (
              <div className="zrv-hr-reveal">
                <HrField id="rq-bud" label={T.labels.budgetedSalary} required error={errors.budgetedSalary}>
                  <input {...fieldProps('rq-bud', { error: errors.budgetedSalary })} type="number" min="0" inputMode="decimal" className="ux-input zrv-hr-input" value={form.budgetedSalary} onChange={set('budgetedSalary')} placeholder={T.placeholders.budgetedSalary} aria-required="true" />
                </HrField>
              </div>
            )}
            <HrField id="rq-basic" label={T.labels.basicSalary}>
              <div className="zrv-hr-lock">
                <input id="rq-basic" className="ux-input zrv-hr-input" readOnly value={record?.basicSalary ?? ''} placeholder={T.placeholders.basicSalary} />
                <OrvexaIcon name="lock" size={17} />
              </div>
            </HrField>
          </div>
        </>}

        {step === 2 && <>
          <PanelHead n={3} {...T.heads[2]} />
          <MultiTiles label={T.labels.education} options={lookups.educationLevels} value={form.educationCodes} onChange={set('educationCodes')} error={errors.educationCodes} />
          <div className="zrv-hr-sep" />
          <div className="zrv-hr-grid">
            <ExpTrack label={T.labels.gccExperience} options={bands} value={form.gccExperienceCode} onChange={set('gccExperienceCode')} error={errors.gccExperienceCode} />
            <ExpTrack label={T.labels.workExperience} options={bands} value={form.workExperienceCode} onChange={set('workExperienceCode')} error={errors.workExperienceCode} />
          </div>
          <div className="zrv-hr-sep" />
          <div className="zrv-hr-grid">
            <HrField id="rq-skills" label={T.labels.skills} required wide hint={T.hints.skills} error={errors.skills}>
              <TagInput id="rq-skills" value={form.skills} onChange={set('skills')} placeholder={T.placeholders.skills}
                invalid={Boolean(errors.skills)} describedBy={errors.skills ? 'rq-skills-error' : 'rq-skills-hint'} />
            </HrField>
            <HrField id="rq-other" label={T.labels.otherRequirements} wide>
              <textarea id="rq-other" className="ux-textarea zrv-hr-input" value={form.otherRequirements} onChange={set('otherRequirements')} placeholder={T.placeholders.otherRequirements} />
            </HrField>
          </div>
        </>}

        {step === 3 && <>
          <PanelHead n={4} {...T.heads[3]} />
          {attachmentsSupported && <><FileDrop files={form.attachments} onChange={set('attachments')} /><div className="zrv-hr-sep" /></>}
          <Review rows={[
            [T.review.jobTitle, form.jobTitle, !form.jobTitle.trim()],
            [T.review.department, department, !form.departmentCode],
            [T.review.neededBy, enDate(form.neededDate), !form.neededDate],
            [T.review.reason, form.reason === 'REPLACEMENT' ? T.review.replacement(form.replacementFor) : T.review.addition(form.additionReason), !form.reason],
            [T.review.budget, form.budgeted === 'yes' ? T.review.budgeted(form.budgetedSalary) : T.review.notBudgeted, !form.budgeted],
            [T.review.education, lookups.educationLevels.filter((level) => form.educationCodes.includes(level.code)).map((level) => level.name).join(', '), !form.educationCodes.length],
            [T.review.experience, `${nameOf(bands, form.gccExperienceCode) || COMMON_TEXT.dash} / ${nameOf(bands, form.workExperienceCode) || COMMON_TEXT.dash}`, !form.gccExperienceCode || !form.workExperienceCode],
            [T.review.skills, form.skills.join(', '), !form.skills.length],
            ...(attachmentsSupported ? [[T.review.attachments, T.review.files(form.attachments.length), false]] : []),
          ]} />
        </>}
      </RecruitmentShell>

      {dialog === 'submit' && (
        <ConfirmDialog title={T.submitTitle} confirmLabel={T.submitConfirm} pending={editor.pending} feedback={editor.feedback}
          onConfirm={submit} onClose={() => setDialog(null)}>
          <p className="zrv-admin-confirm">
            <b>{form.jobTitle}</b> · {department}<br />
            {form.reason === 'REPLACEMENT' ? T.submitBody.replacement(form.replacementFor) : T.submitBody.addition} · {form.budgeted === 'yes' ? T.card.budgeted : T.card.notBudgeted}<br />
            {T.submitBody.neededBy(enDate(form.neededDate))}
          </p>
        </ConfirmDialog>
      )}
      {dialog === 'new' && <NewFormDialog onConfirm={() => { setDialog(null); startNew() }} onClose={() => setDialog(null)} />}
      {dialog === 'report' && (
        <ReportDialog title={T.reportTitle} resourceKey="hr-requisition-report" load={service.list} onClose={() => setDialog(null)}
          numberOf={(item) => item.requisitionNumber} statusOf={(item) => T.status[item.status]} pathOf={(item) => `${BASE}/${item.requisitionId}`}
          columns={[[T.reportColumns.title, (item) => item.jobTitle], [T.reportColumns.department, (item) => nameOf(lookups.departments, item.departmentCode)]]} />
      )}
    </>
  )
}
