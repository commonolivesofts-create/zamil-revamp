import { useState } from 'react'
import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import useAuth from '@/features/auth/useAuth.js'
import { useResource } from '@/features/security-administration/useAdminData.js'
import usePermissions from '@/features/access/usePermissions.js'
import { ConfirmDialog } from '@/features/security-administration/components/AdminUi.jsx'
import { COMMON_TEXT, REQUISITION_TEXT as T } from '../hrRecruitmentText.js'
import { attachmentsSupported, hrRecruitmentServices } from '../hrRecruitmentService.js'
import { businessToday, enDate } from '../shared/hrFormat.js'
import { useRecruitmentForm } from '../shared/useRecruitmentForm.js'
import { RecruitmentLoader } from '../shared/components/RecruitmentLoader.jsx'
import { NewFormDialog, ReportDialog } from '../shared/components/RecruitmentDialogs.jsx'
import { Orbit, PanelHead, Pill, RecruitmentShell, Ticket, Tilt } from '../shared/components/RecruitmentShell.jsx'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from '../hrRecruitmentActions.js'
import { ChoiceCards, ExpTrack, FileDrop, HrField, LookupSelect, MultiTiles, Review, TagInput } from '../shared/components/RecruitmentInputs.jsx'
import {
  blankRequisition, EDUCATION_FIELDS, EXPERIENCE_BANDS, isRequisitionLocked, leadTime, requisitionFormFromRecord, requisitionPayload, requisitionProgress,
} from './requisitionModel.js'

const BASE = '/hr/recruitment/requisition'
const service = hrRecruitmentServices.requisitions

export default function RequisitionPage() {
  return (
    <RecruitmentLoader current="requisition" title={T.title} subtitle={T.subtitle} param="requisitionId" load={service.getById} loadLookups={(signal) => service.getLookups({ signal })}>
      {({ lookups, lookupStatus, reloadLookups, record, editorKey }) => <RequisitionEditor key={editorKey} lookups={lookups} lookupStatus={lookupStatus} reloadLookups={reloadLookups} record={record} />}
    </RecruitmentLoader>
  )
}

const nameOf = (options, id) => options.find((option) => option.id === id)?.name ?? ''

function RequisitionEditor({ lookups, lookupStatus, reloadLookups, record: savedRecord }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const permissions = usePermissions()
  const today = businessToday()
  const loggedInName = user?.fullName?.trim() || lookups.requester || ''
  const editor = useRecruitmentForm({
    basePath: BASE, idKey: 'requisitionId', record: savedRecord,
    initialForm: savedRecord ? requisitionFormFromRecord(savedRecord) : blankRequisition(today),
  })
  const { form, set, record, step, setStep } = editor
  const [dialog, setDialog] = useState(null)
  const [showErrors, setShowErrors] = useState(false)
  const locked = isRequisitionLocked(record?.status)
  const canSave = record ? permissions.can(ACTIONS.REQUISITION_UPDATE) : permissions.can(ACTIONS.REQUISITION_CREATE)
  const canDelete = Boolean(record && record.status === 'Draft' && permissions.can(ACTIONS.REQUISITION_DELETE))
  const canRemoveAttachment = permissions.can(ACTIONS.REQUISITION_MANAGE_ATTACHMENTS)
  const budget = useResource(form.replacementFor ? `hr-requisition-budget:${form.replacementFor}` : null,
    (signal) => service.getBudget(form.replacementFor, { signal }))
  const progress = requisitionProgress(form)
  const errors = showErrors ? Object.fromEntries(progress.missing.map((check) => [check.key, COMMON_TEXT.required])) : {}
  const lead = leadTime(today, form.neededDate)
  const department = form.departmentName || nameOf(lookups.departments, form.departmentId)
  const lookupErrors = lookups.lookupErrors ?? []
  const lookupNotice = lookupStatus === 'loading'
    ? <p className="zrv-admin-state" role="status">Loading form options… You can start filling the other fields.</p>
    : lookupStatus === 'error' || lookupErrors.length
      ? <div className="zrv-admin-state zrv-admin-state--error" role="alert">
          <p>{lookupErrors.includes('requester') && loggedInName ? 'The employee details lookup is unavailable; the signed-in profile is shown for the requester. ' : ''}
            Some form options could not be loaded. You can still enter job title and replacement details directly; retry to reload available choices.</p>
          <button type="button" className="btn-secondary" onClick={reloadLookups}>Retry</button>
        </div>
      : null
  const bands = EXPERIENCE_BANDS
  const statusLabel = T.status[record?.status ?? 'NEW']
  const packageValue = form.totalPackage !== '' ? form.totalPackage : (budget.data?.totalPackage ?? '')
  const body = () => requisitionPayload({ ...form, totalPackage: packageValue })

  const save = () => {
    if (progress.missing.length) {
      setShowErrors(true)
      editor.reject(progress.firstStep, `${COMMON_TEXT.stillNeeded} ${progress.missing.map((check) => check.label).join(', ')}`)
      return
    }
    return editor.perform(async ({ saved }) => {
    const result = await service.saveDraft(editor.recordId, body(), form.requestDate || today, form.attachments)
    saved(result)
    return result
    }, { success: (result) => T.saved(result.requisitionNumber) })
  }

  const saveFromReview = () => {
    if (progress.missing.length) {
      setShowErrors(true)
      editor.reject(progress.firstStep, `${COMMON_TEXT.stillNeeded} ${progress.missing.map((check) => check.label).join(', ')}`)
      return
    }
    save()
  }
  const removeAttachment = async (file) => {
    if (!record?.requisitionId || !file?.attachmentId || !canRemoveAttachment) return
    const outcome = await editor.perform(async () => {
      await service.removeAttachment(record.requisitionId, file.attachmentId)
      return true
    }, { success: T.files.removed(file.fileName) })
    if (outcome.status === 'success') {
      editor.resetToSaved(record, { ...form, attachments: form.attachments.filter((item) => item.attachmentId !== file.attachmentId) })
    }
  }
  const deleteDraft = () => editor.perform(async () => {
    await service.deleteDraft(record.requisitionId)
    return true
  }, { success: T.deleted }).then((outcome) => {
    if (outcome.status === 'success') navigate(BASE, { replace: true })
  })
  const startNew = () => navigate(BASE)

  const tools = [
    { icon: 'save', label: COMMON_TEXT.save, onClick: save, disabled: locked || !canSave || editor.pending },
    { icon: 'printer', label: COMMON_TEXT.print, onClick: () => window.print() },
    { icon: 'chart-column', label: COMMON_TEXT.report, onClick: () => setDialog('report') },
    ...(canDelete ? [{ icon: 'trash-2', label: T.deleteAction, onClick: () => setDialog('delete'), disabled: editor.pending }] : []),
    { icon: 'file-plus', label: COMMON_TEXT.requestForm, onClick: () => (editor.dirty ? setDialog('new') : startNew()) },
    { icon: 'house', label: COMMON_TEXT.home, onClick: () => navigate('/dashboard') },
  ]
  const ticketStatus = record?.ticketStatus || T.ticket.open
  const selectedEducation = EDUCATION_FIELDS.filter(([key]) => form[key] === 'yes').map(([, label]) => label)
  const skillList = form.skills ? form.skills.split(',').map((item) => item.trim()).filter(Boolean) : []
  const selectedEducationCodes = EDUCATION_FIELDS.filter(([key]) => form[key] === 'yes').map(([key]) => key)
  const educationOptions = EDUCATION_FIELDS.map(([code, name], index) => ({ code, name, level: index + 1 }))
  const experienceOptions = bands.map((code) => ({ code, name: code }))

  return (
    <>
      <RecruitmentShell
        current="requisition" title={T.title} subtitle={T.subtitle}
        flowStatus={record ? [record.requisitionNumber, statusLabel].filter(Boolean).join(' · ') : null}
        tools={tools} primary={{ label: T.primary, icon: 'save', onClick: () => (step === 3 ? saveFromReview() : save()), disabled: !canSave }}
        feedback={editor.feedback} onDismissFeedback={editor.dismiss} lookupNotice={lookupNotice} locked={locked} pending={editor.pending} focusError={editor.focusError}
        ticket={<Ticket avatar="ZP" code={T.code} items={[
          { k: T.ticket.number, v: record?.requisitionNumber || T.ticket.numberPending },
          { k: T.ticket.requester, v: record?.requesterName || loggedInName || T.ticket.requesterPending, big: true },
          { k: T.ticket.requestDate, v: form.requestDate ? enDate(form.requestDate).replace(/ /g, '-') : COMMON_TEXT.dash },
          { k: T.ticket.status, v: statusLabel },
          { k: T.ticket.ticketStatus, v: <Pill tone={locked ? 'warn' : 'ok'}>{ticketStatus}</Pill> },
        ]} />}
        steps={T.steps} step={step} onStep={setStep} doneSteps={progress.doneSteps} finalLabel={T.final} onFinal={saveFromReview}
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
              <div><small>{T.card.education}</small><b>{selectedEducation.join(', ') || COMMON_TEXT.dash}</b></div>
              {[[T.labels.gccExperience, form.gccExp], [T.labels.workExperience, form.workExp]].map(([label, code]) => <div key={label}><small>{label}</small><b>{code || COMMON_TEXT.dash}</b></div>)}
            </div>
            <div className="zrv-hr-dark__chips">{skillList.slice(0, 6).map((skill) => <span key={skill}>{skill}</span>)}{skillList.length > 6 && <span>+{skillList.length - 6}</span>}</div>
          </Tilt>
          <Orbit done={progress.done} total={progress.total} hint={progress.missing.length ? COMMON_TEXT.next(progress.missing.slice(0, 2).map((check) => check.label)) : T.orbitReady} />
        </>}
      >
        {step === 0 && <>
          <PanelHead n={1} {...T.heads[0]} />
          <div className="zrv-hr-grid">
            <HrField id="rq-requester" label={T.labels.requester}>
              <input id="rq-requester" className="ux-input zrv-hr-input" value={record?.requesterName || loggedInName} readOnly aria-readonly="true" />
            </HrField>
            <HrField id="rq-request-date" label={T.labels.requestDate}>
              <input id="rq-request-date" className="ux-input zrv-hr-input" value={form.requestDate ? enDate(form.requestDate) : ''} readOnly aria-readonly="true" />
            </HrField>
            <HrField id="rq-title" label={T.labels.jobTitle} required error={errors.jobTitle}>
              <input {...fieldProps('rq-title', { error: errors.jobTitle })} className="ux-input zrv-hr-input" value={form.jobTitle}
                onChange={(event) => {
                  const jobTitle = event.target.value
                  const job = lookups.jobs.find((item) => item.name.toLowerCase() === jobTitle.trim().toLowerCase())
                  editor.patch({ jobTitle, jobId: job?.id ?? '' })
                }} list="rq-job-title-options" placeholder={T.placeholders.jobTitle} autoComplete="off" aria-required="true" maxLength={200} />
              <datalist id="rq-job-title-options">{lookups.jobs.map((item) => <option key={item.id} value={item.name} />)}</datalist>
            </HrField>
            <HrField id="rq-dept" label={T.labels.department} required error={errors.departmentId}>
              <LookupSelect id="rq-dept" value={form.departmentId} onChange={(event) => {
                const dept = lookups.departments.find((item) => item.id === event.target.value)
                editor.patch({ departmentId: dept?.id ?? '', departmentName: dept?.name ?? '' })
              }} options={lookups.departments.map((item) => ({ code: item.id, name: item.name }))} placeholder={T.placeholders.department} required error={errors.departmentId} />
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
          <ChoiceCards label={T.labels.reason} value={form.reason} onChange={(reason) => editor.patch({ reason,
            replacementFor: reason === 'REPLACEMENT' ? form.replacementFor : '',
            totalPackage: reason === form.reason ? form.totalPackage : '',
          })} error={errors.reason} options={[
            { value: 'REPLACEMENT', icon: 'users', ...T.reasons.REPLACEMENT },
            { value: 'ADDITION', icon: 'plus', ...T.reasons.ADDITION },
          ]} />
          {form.reason === 'REPLACEMENT' && (
            <div className="zrv-hr-reveal zrv-hr-mt">
              <HrField id="rq-rep" label={T.labels.replacementFor} required error={errors.replacementFor}>
              <input {...fieldProps('rq-rep', { error: errors.replacementFor })} className="ux-input zrv-hr-input" value={form.replacementFor} onChange={(event) => editor.patch({ replacementFor: event.target.value, totalPackage: '' })} list="rq-replacement-options" placeholder={T.placeholders.replacementFor} aria-required="true" maxLength={200} />
              <datalist id="rq-replacement-options">{lookups.replacements.map((name) => <option key={name} value={name} />)}</datalist>
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
                <input id="rq-basic" className="ux-input zrv-hr-input" readOnly value={packageValue} placeholder={T.placeholders.basicSalary} />
                <OrvexaIcon name="lock" size={17} />
              </div>
            </HrField>
          </div>
        </>}

        {step === 2 && <>
          <PanelHead n={3} {...T.heads[2]} />
          <MultiTiles label={T.labels.education} options={educationOptions} value={selectedEducationCodes}
            onChange={(codes) => editor.patch(Object.fromEntries(EDUCATION_FIELDS.map(([key]) => [key, codes.includes(key) ? 'yes' : 'no'])))} error={errors.educationCodes} />
          <div className="zrv-hr-sep" />
          <div className="zrv-hr-grid">
            <ExpTrack label={T.labels.gccExperience} options={experienceOptions} value={form.gccExp} onChange={set('gccExp')} error={errors.gccExp} />
            <ExpTrack label={T.labels.workExperience} options={experienceOptions} value={form.workExp} onChange={set('workExp')} error={errors.workExp} />
          </div>
          <div className="zrv-hr-sep" />
          <div className="zrv-hr-grid">
            <HrField id="rq-skills" label={T.labels.skills} required wide hint={T.hints.skills} error={errors.skills}>
              <TagInput id="rq-skills" value={skillList} onChange={(skills) => set('skills')(skills.join(', '))} placeholder={T.placeholders.skills}
                invalid={Boolean(errors.skills)} describedBy={errors.skills ? 'rq-skills-error' : 'rq-skills-hint'} />
            </HrField>
            <HrField id="rq-other" label={T.labels.otherRequirements} wide>
              <textarea id="rq-other" className="ux-textarea zrv-hr-input" value={form.otherRequirements} onChange={set('otherRequirements')} placeholder={T.placeholders.otherRequirements} />
            </HrField>
          </div>
        </>}

        {step === 3 && <>
          <PanelHead n={4} {...T.heads[3]} />
          {canSave && <HrField id="rq-ticket-status" label={T.labels.ticketStatus} hint={T.hints.ticketStatus}>
            <LookupSelect id="rq-ticket-status" value={form.ticketStatus} onChange={(event) => editor.patch({ ticketStatus: event.target.value, ticketStatusChanged: true })}
              options={['Open', 'Accepted', 'Close'].map((code) => ({ code, name: code }))} />
          </HrField>}
          {attachmentsSupported && (canSave || canRemoveAttachment || form.attachments.length > 0) && <><FileDrop files={form.attachments} onChange={set('attachments')} onRemove={removeAttachment} canRemoveSaved={canRemoveAttachment && Boolean(record)} disabled={!canSave || editor.pending} /><div className="zrv-hr-sep" /></>}
          <Review rows={[
            [T.review.jobTitle, form.jobTitle, !form.jobTitle.trim()],
            [T.review.department, department, !form.departmentName.trim()],
            [T.review.neededBy, enDate(form.neededDate), !form.neededDate],
            [T.review.reason, !form.reason ? COMMON_TEXT.notAnswered : form.reason === 'REPLACEMENT' ? T.review.replacement(form.replacementFor) : T.review.addition(form.additionReason), !form.reason],
            [T.review.budget, !form.budgeted ? COMMON_TEXT.notAnswered : form.budgeted === 'yes' ? T.review.budgeted(form.budgetedSalary) : T.review.notBudgeted, !form.budgeted],
            [T.labels.basicSalary, packageValue || COMMON_TEXT.dash, false],
            [T.review.education, selectedEducation.join(', ') || COMMON_TEXT.dash, false],
            [T.review.experience, `${form.gccExp || COMMON_TEXT.dash} / ${form.workExp || COMMON_TEXT.dash}`, false],
            [T.review.skills, form.skills || COMMON_TEXT.dash, false],
            [T.labels.otherRequirements, form.otherRequirements || COMMON_TEXT.dash, false],
            [T.labels.remark, form.remark || COMMON_TEXT.dash, false],
            ...(attachmentsSupported ? [[T.review.attachments, T.review.files(form.attachments.length), false]] : []),
          ]} />
        </>}
      </RecruitmentShell>

      {dialog === 'new' && <NewFormDialog onConfirm={() => { setDialog(null); startNew() }} onClose={() => setDialog(null)} />}
      {dialog === 'delete' && <ConfirmDialog title={T.deleteTitle} description={T.deleteBody} confirmLabel={T.deleteAction} pending={editor.pending}
        feedback={editor.feedback} onConfirm={deleteDraft} onClose={() => setDialog(null)} />}
      {dialog === 'report' && (
        <ReportDialog title={T.reportTitle} resourceKey="hr-requisition-report" load={service.list} onClose={() => setDialog(null)}
          numberOf={(item) => item.requisitionNumber} statusOf={(item) => T.status[item.status]} pathOf={(item) => `${BASE}/${item.requisitionId}`}
          columns={[[T.reportColumns.title, (item) => item.jobTitle], [T.reportColumns.department, (item) => item.departmentName]]} />
      )}
    </>
  )
}
