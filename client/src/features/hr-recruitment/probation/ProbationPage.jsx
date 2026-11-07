import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { enDate, initials } from '../shared/hrFormat.js'
import { useRecruitmentForm } from '../shared/useRecruitmentForm.js'
import { useRecruitmentSteps } from '../shared/useRecruitmentSteps.js'
import { reviewCompletion } from '../shared/recruitmentSteps.js'
import { RecruitmentLoader } from '../shared/components/RecruitmentLoader.jsx'
import { NewFormDialog } from '../shared/components/RecruitmentDialogs.jsx'
import { Orbit, Pill, RecruitmentShell, StepHead, Ticket, Tilt } from '../shared/components/RecruitmentShell.jsx'
import { HrField, Review, SearchableLookup } from '../shared/components/RecruitmentInputs.jsx'
import { EmployeeLookup } from '../shared/components/EmployeeLookup.jsx'
import {
  ALLOCATED_POINTS, RESULT_TEXT, RESULT_TONE, approvedBy, formResult, formTypeLabel, isEditable, totalRating,
} from './probationRules.js'
import { blankProbation, probationFormFromRecord, probationReviewSections, probationStepErrors, probationValidationFields } from './probationForm.js'

// Legacy probation.php creates a draft; prf_uplines.php edits only comments and points.
const BASE = '/hr/recruitment/probation-evaluation'
const TITLE = 'Probation Evaluation'
const SUBTITLE = 'Performance Appraisal Form (PAF) for Probation Period'
const service = hrRecruitmentServices.probations
const STEP_NAMES = ['Employee & period', 'Evaluation criteria', 'Comments', 'Review']
const STATUS_TEXT = { DRAFT: 'Draft', INPROCESS: 'In process', APPROVED: 'Approved', REJECTED: 'Rejected' }
const criteriaLines = (criteria) => criteria.map((item) => ({ lineId: null, param: item.param, paramAr: item.paramAr, rating: '' }))
const STEP_OF = (key) => (key.startsWith('rating:') || key === 'lines' ? 1 : key === 'comment' || key === 'comments' ? 2 : 0)

export default function ProbationPage() {
  return (
    <RecruitmentLoader current="probation" demo={false} title={TITLE} subtitle={SUBTITLE}
      param="evaluationId" load={service.getById} loadLookups={(signal) => service.getLookups({ signal })}>
      {({ lookups, record, editorKey }) => <ProbationEditor key={editorKey} lookups={lookups} record={record} />}
    </RecruitmentLoader>
  )
}

function ProbationEditor({ lookups, record: savedRecord }) {
  const navigate = useNavigate()
  const permissions = usePermissions()
  const editor = useRecruitmentForm({ basePath: BASE, idKey: 'evaluationId', record: savedRecord,
    initialForm: savedRecord ? probationFormFromRecord(savedRecord) : blankProbation(),
    validationFields: ({ lines }) => probationValidationFields(lines) })
  const { form, record, set, patch, step, setStep } = editor
  const employee = form.employee
  const [employeeStatus, setEmployeeStatus] = useState(savedRecord ? 'ready' : 'idle')
  const [criteria, setCriteria] = useState({ status: savedRecord ? 'ready' : 'idle', items: [] })
  const employeeRequest = useRef(0)
  const criteriaRequest = useRef(0)
  const [saving, setSaving] = useState(false)
  const [dialog, setDialog] = useState(null)
  const saved = Boolean(record)
  const canSave = permissions.can(`HR.PROBATION_EVALUATIONS:${saved ? 'UPDATE' : 'CREATE'}`)
  const locked = !canSave || (saved && !isEditable(record.status))
  const total = totalRating(form.lines)
  const result = formResult(form.lines)
  const rated = form.lines.filter((line) => line.rating !== '').length
  const stepErrors = probationStepErrors(form, { saved, employeeStatus, criteriaStatus: criteria.status })
  Object.entries(editor.fieldErrors).forEach(([key, message]) => { stepErrors[STEP_OF(key)][key] = message })
  const navigation = useRecruitmentSteps({ step, setStep, errorsByStep: stepErrors, reject: editor.reject, readOnly: locked })
  const doneSteps = navigation.doneSteps
  const errors = { ...navigation.errors, ...editor.fieldErrors }
  const allErrors = { ...Object.assign({}, ...stepErrors), ...editor.fieldErrors }
  const reviewSections = probationReviewSections(form, record, lookups.requestor, allErrors)
  const reviewProgress = reviewCompletion(reviewSections)
  const saveLabel = saving ? 'Saving...' : saved ? 'Save changes' : 'Save draft'
  const resultPill = result ? <Pill tone={RESULT_TONE[result]}>{RESULT_TEXT[result]}</Pill> : 'Not rated yet'
  useEffect(() => () => { employeeRequest.current += 1; criteriaRequest.current += 1 }, [])
  const setRating = (index, rating) => patch((current) => ({ lines: current.lines.map((line, row) => row === index ? { ...line, rating } : line) }))
  const searchEmployees = (query, options) => service.searchEmployees(query, options)
  // Joining date comes from the actual employee; it stays editable only before the first save.
  const selectEmployee = async (item) => {
    if (employee?.employeeNumber === item.employeeNumber && employeeStatus === 'ready') return
    const request = ++employeeRequest.current
    setEmployeeStatus('loading')
    patch({ employee: item, formDate: '' })
    try {
      const details = await service.employeeDetails(item.name)
      if (request !== employeeRequest.current) return
      patch({ employee: details, formDate: details.startDate || '' })
      setEmployeeStatus('ready')
    } catch (error) {
      if (request !== employeeRequest.current) return
      setEmployeeStatus('error')
      editor.showProblem(error?.message || 'Could not load the selected employee details. Select the employee again to retry.')
    }
  }
  // Legacy showDropInfo replaces criteria when the form type changes, never on a same-type reselect.
  const selectFormType = async (option) => {
    const formType = option.code
    if (form.formType === formType && criteria.status === 'ready' && form.lines.length) return
    const request = ++criteriaRequest.current
    patch({ formType, lines: [] })
    setCriteria({ status: 'loading', items: [] })
    try {
      const items = await service.criteria(formType)
      if (request !== criteriaRequest.current) return
      setCriteria({ status: 'ready', items })
      patch({ lines: criteriaLines(items) })
    } catch (error) {
      if (request !== criteriaRequest.current) return
      setCriteria({ status: 'error', items: [] })
      editor.showProblem(error?.message || 'Could not load the criteria. Select the form type again to retry.')
    }
  }
  const save = async () => {
    if (locked || saving || editor.pending || !navigation.validateAll()) return
    setSaving(true)
    try {
      const outcome = await editor.perform(async ({ saved: done }) => {
        const result = await service.save(editor.recordId, { ...form, employee })
        done(result)
        return result
      }, { success: (result) => `Probation evaluation ${result.evaluationNumber} saved. Status: ${STATUS_TEXT[result.status] || result.status}.` })
      if (outcome.status === 'success') editor.resetToSaved(outcome.value, probationFormFromRecord(outcome.value))
    } finally { setSaving(false) }
  }
  const leave = (path) => (editor.dirty && !locked ? setDialog({ path }) : navigate(path))
  const tools = [
    { icon: 'printer', label: 'Print', onClick: () => window.print() },
    { icon: 'chart-column', label: 'Report', onClick: () => leave(`${BASE}/report`) },
    { icon: 'file-plus', label: 'New evaluation', onClick: () => leave(BASE) },
    { icon: 'house', label: 'Home', onClick: () => navigate('/dashboard') },
  ]
  const readOnly = (id, label, value) => <HrField id={id} label={label}><input id={id} className="ux-input zrv-hr-input" readOnly value={value ?? ''} /></HrField>
  const criteriaHint = !form.formType ? 'Select Form name'
    : criteria.status === 'loading' ? 'Loading the criteria...'
      : criteria.status === 'error' ? 'Could not load the criteria of this form type. Select it again to retry.'
        : 'The criteria of this form type are not available.'
  const field = (id, key, label, required = false) => <HrField id={id} label={label} required={required} error={errors[key]}>
    <input {...fieldProps(id, { error: errors[key] })} className="ux-input zrv-hr-input" type="date" value={form[key]} onChange={set(key)}
      aria-required={required || undefined} min={key === 'toDate' ? form.fromDate || undefined : undefined} />
  </HrField>

  return <>
    <RecruitmentShell current="probation" title={TITLE} subtitle={SUBTITLE}
      flowStatus={record ? `${record.evaluationNumber} · ${STATUS_TEXT[record.status] || record.status}` : null} tools={tools}
      primary={{ label: saveLabel, icon: 'save', onClick: save }} feedback={editor.feedback} feedbackMode="toast" onDismissFeedback={editor.dismiss}
      pendingMessage={saving || editor.pending ? 'Saving probation evaluation' : null}
      secondaryAction={saved && !locked ? { label: 'Submit for Approval', icon: 'send', onClick: () => editor.showNotice('The approval workflow is pending setup. This probation evaluation has not been submitted.') } : null}
      locked={locked} pending={editor.pending} focusError={editor.focusError}
      banner={!locked ? <p className="zrv-hr-draft-note"><OrvexaIcon name="info" size={17} /><span>{saved
        ? <><strong>Save changes</strong> updates the ratings, Comments and Suggestion. Every criterion and both comments are required. Approval submission is a separate action.</>
        : <><strong>Save draft</strong> creates the evaluation. Ratings are optional on the first save. Comments and Suggestion become editable after saving.</>}</span></p> : null}
      ticket={<Ticket avatar={initials(employee?.name)} code="PAF · 1064" items={[
        { k: 'Evaluation no.', v: record?.evaluationNumber || 'Assigned on save' },
        { k: 'Created', v: record?.createdAt ? enDate(record.createdAt) : 'Set on save' },
        { k: 'Employee', v: employee?.name || 'Not selected', big: true },
        { k: 'Form type', v: formTypeLabel(form.formType) || '—' }, { k: 'Total', v: `${total}/100` },
        { k: 'Evaluation Result', v: resultPill },
        { k: 'Approval status', v: <Pill tone={record?.status === 'REJECTED' ? 'bad' : record?.status === 'APPROVED' ? 'ok' : 'warn'}>{STATUS_TEXT[record?.status] || 'Draft'}</Pill> },
      ]} />}
      steps={STEP_NAMES.map((name, index) => [name, index === 1 && form.lines.length ? `${rated}/${form.lines.length} rated` : doneSteps[index] ? 'Done' : 'To do'])}
      step={step} onStep={setStep} doneSteps={doneSteps} lockedSteps={navigation.lockedSteps} onContinue={navigation.validateStep}
      finalLabel={saveLabel} onFinal={save} side={<>
        <Tilt aria-label="Evaluation overview"><div className="zrv-hr-dark__top"><span className="zrv-hr-mono">{employee?.employeeNumber || 'Draft'}</span></div>
          <div className="zrv-hr-dark__who"><span className="zrv-hr-dark__av">{initials(employee?.name)}</span><div><h3 className="zrv-hr-dark__title">{employee?.name || 'Select Employee'}</h3><div className="zrv-hr-dark__sub">{employee ? employee.position || '—' : 'Employee details appear here'}</div></div></div>
          <div className="zrv-hr-dark__badges"><span>{formTypeLabel(form.formType) || 'Select Form Type'}</span><span>{employee?.departmentName || 'Department'}</span></div>
        </Tilt>
        <Orbit done={reviewProgress.complete} total={reviewProgress.total} hint={saved ? 'Complete all ratings, Comments and Suggestion.' : 'Complete employee details and the evaluation period to save a draft.'} />
        <section className="zrv-hr-scorecard zrv-hr-card"><b>{total}</b><span> Total / 100 · {form.lines.length} criteria</span><p>Evaluation Result: {resultPill}</p></section>
      </>}>
      {step === 0 && <><StepHead title="Employee & period" />
        <div className="zrv-hr-grid zrv-hr-is-4">
          <HrField id="pa-type" label="Form Type" required={!saved} error={errors.formType}>
            <SearchableLookup id="pa-type" value={form.formType} customValue={formTypeLabel(form.formType)} onChange={selectFormType} disabled={saved}
              error={errors.formType} required={!saved} placeholder="Select Form Type"
              options={lookups.probation.formTypes.map((item) => ({ code: item.code, name: formTypeLabel(item.code) }))} />
          </HrField>
          {saved ? readOnly('pa-emp', 'Employee Name', employee?.name)
            : <EmployeeLookup id="pa-emp" label="Employee Name" required value={employee} onPick={selectEmployee}
              error={employeeStatus === 'error' ? 'Could not load employee details. Select the employee again to retry.' : errors.employee}
              searchService={searchEmployees} cacheKey="probation-evaluation-employees" />}
          {readOnly('pa-no', 'Employee Number', employee?.employeeNumber)}
          {saved ? readOnly('pa-joining', 'Joining Date', form.formDate) : field('pa-joining', 'formDate', 'Joining Date')}
          {readOnly('pa-title', 'Job Title', employee?.position)}{readOnly('pa-grade', 'Job Grade', employee?.grade)}{readOnly('pa-dept', 'Department', employee?.departmentName)}
          {saved ? <>{readOnly('pa-from', 'Evaluation Period From', form.fromDate)}{readOnly('pa-to', 'Evaluation Period To', form.toDate)}</>
            : <>{field('pa-from', 'fromDate', 'Evaluation Period From', true)}{field('pa-to', 'toDate', 'Evaluation Period To', true)}</>}
        </div>
        {employeeStatus === 'loading' && <p className="zrv-admin-hint" role="status">Loading employee details...</p>}
        {criteria.status === 'loading' && <p className="zrv-admin-hint" role="status">Loading evaluation criteria...</p>}
        {criteria.status === 'error' && <p className="zrv-admin-hint">Select the form type again to retry loading its criteria.</p>}
      </>}
      {step === 1 && <><StepHead title="Evaluation criteria" desc={`Each criterion is allocated ${ALLOCATED_POINTS} points; ${saved ? 'every criterion needs points from 1 to 5.' : 'points are optional until the first save.'}`} />
        {form.lines.length === 0 ? <p className={errors.lines ? 'zrv-auth-field-error' : undefined}>{errors.lines || (saved ? 'This evaluation has no criteria.' : criteriaHint)}</p>
          : <div className="zrv-hr-criteria" role="list" aria-label="Evaluation Criteria">
            <div className="zrv-hr-criteria__head" aria-hidden="true"><span>#</span><span>Evaluation Criteria · <span lang="ar" dir="rtl">معايير التقييم</span></span><span>Allocated</span><span>Points</span></div>
            {form.lines.map((line, index) => <div className={`zrv-hr-criterion${errors[`rating:${index}`] ? ' zrv-hr-is-bad' : ''}`} role="listitem" style={{ '--i': index }} key={line.lineId ?? index}>
              <span className="zrv-hr-row__n">{index + 1}</span>
              <div className="zrv-hr-criterion__name"><b>{line.param}</b>{line.paramAr && <small lang="ar" dir="rtl">{line.paramAr}</small>}</div>
              <span className="zrv-hr-criterion__alloc">{ALLOCATED_POINTS}</span>
              <div className="zrv-hr-criterion__score">
                <div className="zrv-hr-point-options" role="radiogroup" aria-label={`Points for criterion ${index + 1}`} aria-required={saved}
                  aria-invalid={Boolean(errors[`rating:${index}`])} aria-describedby={errors[`rating:${index}`] ? `pa-rating-${index}-error` : undefined}>
                  {[1, 2, 3, 4, 5].map((rating) => <label key={rating}>
                    <input type="radio" name={`pa-rating-${index}`} value={rating} checked={Number(line.rating) === rating}
                      onChange={() => setRating(index, String(rating))} required={saved} />
                    <span>{rating}</span>
                  </label>)}
                </div>
                {!saved && line.rating !== '' && <button className="zrv-hr-point-clear" type="button" onClick={() => setRating(index, '')} aria-label={`Clear points for criterion ${index + 1}`}>Clear</button>}
              </div>
              {errors[`rating:${index}`] && <p id={`pa-rating-${index}-error`} className="zrv-hr-criterion__err zrv-auth-field-error" role="alert">{errors[`rating:${index}`]}</p>}
            </div>)}
          </div>}
        {errors.lines && form.lines.length > 0 && <p className="zrv-auth-field-error" role="alert">{errors.lines}</p>}
        <p className="zrv-hr-mt">Total: <b>{total}</b> / 100 · Evaluation Result: {resultPill} · Not Acceptable from 0% to 70%, Acceptable from 71% to 100%.</p>
      </>}
      {step === 2 && <><StepHead title="Comments" desc={saved ? 'Comments and Suggestion are required to save.' : 'Comments and Suggestion become editable after the first save.'} />
        <div className="zrv-hr-grid zrv-hr-is-2">
          {readOnly('pa-prepared', 'Prepared & Agreed by', saved ? record.preparedBy : lookups.requestor?.fullName)}
          {readOnly('pa-approved', 'Approved by', approvedBy(record?.status))}
          <HrField id="pa-comment" label="Comments" required={saved} error={errors.comment}><textarea {...fieldProps('pa-comment', { error: errors.comment })} className="ux-textarea zrv-hr-input" value={form.comment} onChange={set('comment')} readOnly={!saved} maxLength={500} aria-required={saved} placeholder={!saved ? 'Available after the first save' : 'Enter your comments'} /></HrField>
          <HrField id="pa-comments" label="Suggestion" required={saved} error={errors.comments}><textarea {...fieldProps('pa-comments', { error: errors.comments })} className="ux-textarea zrv-hr-input" value={form.comments} onChange={set('comments')} readOnly={!saved} maxLength={500} aria-required={saved} placeholder={!saved ? 'Available after the first save' : 'Enter your suggestion'} /></HrField>
        </div>
      </>}
      {step === 3 && <><StepHead title="Review probation evaluation" />
        <Review sections={reviewSections} {...reviewProgress} formTitle="Probation Evaluation" reference={record?.evaluationNumber}
          approvalStatus={STATUS_TEXT[record?.status] || 'Draft'} />
      </>}
    </RecruitmentShell>
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}
