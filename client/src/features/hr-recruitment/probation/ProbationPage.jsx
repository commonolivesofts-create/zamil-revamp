import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { initials } from '../shared/hrFormat.js'
import { useRecruitmentForm } from '../shared/useRecruitmentForm.js'
import { RecruitmentLoader } from '../shared/components/RecruitmentLoader.jsx'
import { NewFormDialog } from '../shared/components/RecruitmentDialogs.jsx'
import { Pill, RecruitmentShell, StepHead, Ticket, Tilt } from '../shared/components/RecruitmentShell.jsx'
import { HrField } from '../shared/components/RecruitmentInputs.jsx'
import { EmployeePicker } from '../shared/components/EmployeePicker.jsx'
import {
  ALLOCATED_POINTS, RESULT_TEXT, RESULT_TONE, approvedBy, formResult, formTypeLabel, isEditable, totalRating,
  validateForCreate, validateForSubmit,
} from './probationRules.js'

// The legacy form: views/probation/probation.php creates an evaluation, prf_uplines.php edits it.
const BASE = '/hr/recruitment/probation-evaluation'
const TITLE = 'Probation Evaluation'
const SUBTITLE = 'Performance Appraisal Form (PAF) for Probation Period'
const service = hrRecruitmentServices.probations
// formDate is FORM_DATE: the joining date (legacy prf_date), filled from the employee and editable.
const blank = () => ({ formType: '', formDate: '', fromDate: '', toDate: '', comment: '', comments: '', lines: [] })
const STEP_NAMES = ['Employee & period', 'Evaluation criteria', 'Comments']
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

function ProbationEditor({ lookups, record }) {
  const navigate = useNavigate()
  const editor = useRecruitmentForm({ basePath: BASE, idKey: 'evaluationId', record, initialForm: record ? {
    formType: record.formType, formDate: record.formDate, fromDate: record.fromDate, toDate: record.toDate,
    comment: record.comment, comments: record.comments, lines: record.lines.map((line) => ({ ...line })),
  } : blank() })
  const { form, set, patch, step, setStep } = editor
  const [employee, setEmployee] = useState(record?.employee ?? null)
  const [criteria, setCriteria] = useState({ status: record ? 'ready' : 'idle', items: [] })
  const employeeRequest = useRef(0)
  const criteriaRequest = useRef(0)
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  // A saved evaluation keeps its employee, form type, dates and criteria (the legacy edit form
  // saves only Comments, Suggestion and the points); Inprocess and Approved ones are read only.
  const saved = Boolean(record)
  const locked = saved && !isEditable(record.status)
  const total = totalRating(form.lines)
  const result = formResult(form.lines)
  const rated = form.lines.filter((line) => line.rating !== '').length
  const doneSteps = [Boolean(employee && form.formType && form.fromDate && form.toDate), form.lines.length > 0 && rated === form.lines.length, Boolean(form.comment && form.comments)]
  const resultPill = result ? <Pill tone={RESULT_TONE[result]}>{RESULT_TEXT[result]}</Pill> : 'Not rated yet'
  const clear = (key) => setErrors((value) => ({ ...value, [key]: '' }))
  const setValue = (key) => (event) => { set(key)(event); clear(key) }
  const setRating = (index, rating) => { patch((current) => ({ lines: current.lines.map((line, row) => row === index ? { ...line, rating } : line) })); clear(`rating:${index}`) }
  // Searches the API as the user types (the signed-in user's reporting hierarchy, as legacy).
  const searchEmployees = (query, options) => service.searchEmployees(query, options)
  // Legacy getEmpDetails: number, job title, department and the joining date (prf_date).
  const selectEmployee = async (item) => {
    const request = ++employeeRequest.current
    setEmployee(item)
    clear('employee')
    patch({ formDate: '' })
    try {
      const details = await service.employeeDetails(item.name)
      if (request !== employeeRequest.current) return
      setEmployee(details)
      patch({ formDate: details.startDate || '' })
    } catch {
      if (request !== employeeRequest.current) return
      setErrors((value) => ({ ...value, employee: 'Could not load the selected employee details. Please try again.' }))
    }
  }
  // Legacy showDropInfo: the form type's criteria replace the rows.
  const selectFormType = async (event) => {
    const formType = event.target.value
    const request = ++criteriaRequest.current
    patch({ formType, lines: [] })
    clear('formType')
    if (!formType) { setCriteria({ status: 'idle', items: [] }); return }
    setCriteria({ status: 'loading', items: [] })
    try {
      const items = await service.criteria(formType)
      if (request !== criteriaRequest.current) return
      setCriteria({ status: 'ready', items })
      patch({ lines: criteriaLines(items) })
    } catch {
      if (request !== criteriaRequest.current) return
      setCriteria({ status: 'error', items: [] })
    }
  }
  const validate = () => {
    const { errors: next } = saved ? validateForSubmit(form) : validateForCreate(form, { employee, criteria: form.lines })
    if (!saved && criteria.status === 'loading') next.formType = 'The criteria are still loading.'
    setErrors(next)
    const keys = Object.keys(next)
    if (keys.length) {
      const first = Math.min(...keys.map(STEP_OF))
      setStep(first)
      editor.reject(first, 'Review the highlighted fields.')
      return false
    }
    return true
  }
  const save = () => {
    if (locked || !validate()) return
    editor.perform(async ({ saved: done }) => {
      const result = await service.save(editor.recordId, { ...form, employee })
      done(result)
      return result
    }, { success: (result) => `Probation evaluation ${result.evaluationNumber} saved.` })
  }
  // Leaving with unsaved answers asks first (New form and Report).
  const leave = (path) => (editor.dirty ? setDialog({ path }) : navigate(path))
  const tools = [
    { icon: 'save', label: 'Save', onClick: save, disabled: editor.pending || locked },
    { icon: 'printer', label: 'Print', onClick: () => window.print() },
    { icon: 'chart-column', label: 'Report', onClick: () => leave(`${BASE}/report`) },
    { icon: 'file-plus', label: 'Request Form', onClick: () => leave(BASE) },
  ]
  const readOnly = (id, label, value) => <HrField id={id} label={label}><input id={id} className="ux-input zrv-hr-input" readOnly value={value ?? ''} /></HrField>
  const criteriaHint = !form.formType ? 'Select Form name'
    : criteria.status === 'loading' ? 'Loading the criteria…'
      : criteria.status === 'error' ? 'Could not load the criteria of this form type. Select it again to retry.'
        : 'The criteria of this form type are not available.'

  return <>
    <RecruitmentShell current="probation" title={TITLE} subtitle={SUBTITLE}
      flowStatus={record ? `${record.evaluationNumber} · ${record.status}` : null} tools={tools}
      primary={{ label: 'Save', icon: 'save', onClick: save }} feedback={editor.feedback} onDismissFeedback={editor.dismiss}
      locked={locked} pending={editor.pending} focusError={editor.focusError}
      ticket={<Ticket avatar={initials(employee?.name)} code="PAF · 1064" items={[
        { k: 'Evaluation no.', v: record?.evaluationNumber || 'Assigned on save' },
        { k: 'Created', v: record?.createdAt || 'Set on save' },
        { k: 'Employee', v: employee?.name || 'Not selected', big: true },
        { k: 'Form type', v: formTypeLabel(form.formType) || '—' }, { k: 'Total', v: `${total}/100` },
        { k: 'Evaluation Result', v: resultPill },
        { k: 'Status', v: <Pill tone="warn">{record?.status || 'Not saved'}</Pill> },
      ]} />}
      steps={STEP_NAMES.map((name, index) => [name, index === 1 && form.lines.length ? `${rated}/${form.lines.length} rated` : doneSteps[index] ? 'Done' : 'To do'])}
      step={step} onStep={setStep} doneSteps={doneSteps}
      finalLabel="Save" onFinal={save} side={<>
        <Tilt aria-label="Evaluation overview"><div className="zrv-hr-dark__top"><span className="zrv-hr-mono">{employee?.employeeNumber || 'Draft'}</span></div>
          <div className="zrv-hr-dark__who"><span className="zrv-hr-dark__av">{initials(employee?.name)}</span><div><h3 className="zrv-hr-dark__title">{employee?.name || 'Select Employee'}</h3><div className="zrv-hr-dark__sub">{employee ? employee.position || '—' : 'Employee details appear here'}</div></div></div>
          <div className="zrv-hr-dark__badges"><span>{formTypeLabel(form.formType) || 'Select Form Type'}</span><span>{employee?.departmentName || 'Department'}</span></div>
        </Tilt>
        <section className="zrv-hr-scorecard zrv-hr-card"><b>{total}</b><span> Total / 100 · {form.lines.length} criteria</span><p>Evaluation Result: {resultPill}</p></section>
      </>}>
      {step === 0 && <><StepHead title="Employee & period" />
        <div className="zrv-hr-grid zrv-hr-is-4">
          <HrField id="pa-type" label="Form Type" required error={errors.formType}><select id="pa-type" className="ux-input zrv-hr-input" value={form.formType} onChange={selectFormType} disabled={saved} aria-invalid={Boolean(errors.formType)}><option value="">Select Form Type</option>{lookups.probation.formTypes.map((item) => <option key={item.code} value={item.code}>{formTypeLabel(item.code)}</option>)}</select></HrField>
          {saved ? <div className="zrv-hr-mt">{readOnly('pa-emp', 'Employee Name', employee?.name)}</div>
            : <div className="zrv-hr-field zrv-hr-pa-emp"><EmployeePicker id="pa-emp" label="Employee Name" required value={employee} onPick={selectEmployee} error={errors.employee} searchService={searchEmployees} /></div>}
          {readOnly('pa-no', 'Employee Number', employee?.employeeNumber)}
          {saved ? readOnly('pa-joining', 'Joining Date', form.formDate)
            : <HrField id="pa-joining" label="Joining Date"><input id="pa-joining" className="ux-input zrv-hr-input" type="date" value={form.formDate} onChange={setValue('formDate')} /></HrField>}
          {readOnly('pa-title', 'Job Title', employee?.position)}{readOnly('pa-grade', 'Job Grade', employee?.grade)}{readOnly('pa-dept', 'Department', employee?.departmentName)}
          {saved ? <>{readOnly('pa-from', 'Evaluation Period From', form.fromDate)}{readOnly('pa-to', 'Evaluation Period To', form.toDate)}</>
            : <><HrField id="pa-from" label="Evaluation Period From" required error={errors.fromDate}><input id="pa-from" className="ux-input zrv-hr-input" type="date" value={form.fromDate} onChange={setValue('fromDate')} aria-invalid={Boolean(errors.fromDate)} /></HrField>
              <HrField id="pa-to" label="Evaluation Period To" required error={errors.toDate}><input id="pa-to" className="ux-input zrv-hr-input" type="date" value={form.toDate} onChange={setValue('toDate')} aria-invalid={Boolean(errors.toDate)} /></HrField></>}
        </div>
      </>}
      {step === 1 && <><StepHead title="Evaluation criteria" desc={`Each criterion is allocated ${ALLOCATED_POINTS} points; ${saved ? 'every criterion needs points from 1 to 5.' : 'points are optional until the first save.'}`} />
        {form.lines.length === 0 ? <p className={errors.formType ? 'zrv-auth-field-error' : undefined}>{saved ? 'This evaluation has no criteria.' : criteriaHint}</p>
          : <div className="zrv-hr-criteria" role="list" aria-label="Evaluation Criteria">
            <div className="zrv-hr-criteria__head" aria-hidden="true"><span>#</span><span>Evaluation Criteria · <span lang="ar" dir="rtl">معايير التقييم</span></span><span>Allocated</span><span>Points</span></div>
            {form.lines.map((line, index) => <div className="zrv-hr-criterion" role="listitem" style={{ '--i': index }} key={line.lineId ?? index}>
              <span className="zrv-hr-row__n">{index + 1}</span>
              <div className="zrv-hr-criterion__name"><b>{line.param}</b>{line.paramAr && <small lang="ar" dir="rtl">{line.paramAr}</small>}</div>
              <span className="zrv-hr-criterion__alloc">{ALLOCATED_POINTS}</span>
              <div className="zrv-hr-criterion__score"><label className="zrv-hr-sr" htmlFor={`pa-rating-${index}`}>Points for criterion {index + 1}</label>
                <select id={`pa-rating-${index}`} className="ux-input zrv-hr-input" value={line.rating} onChange={(event) => setRating(index, event.target.value)} required={saved} aria-invalid={Boolean(errors[`rating:${index}`])} aria-describedby={errors[`rating:${index}`] ? `pa-rating-${index}-error` : undefined}><option value="" />{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}</option>)}</select></div>
              {errors[`rating:${index}`] && <p id={`pa-rating-${index}-error`} className="zrv-hr-criterion__err zrv-auth-field-error">{errors[`rating:${index}`]}</p>}
            </div>)}
          </div>}
        <p className="zrv-hr-mt">Total: <b>{total}</b> / 100 · Evaluation Result: {resultPill} · Not Acceptable from 0% to 70%, Acceptable from 71% to 100%.</p>
      </>}
      {step === 2 && <><StepHead title="Comments" desc={saved ? 'Comments and Suggestion are required to save.' : 'Comments and Suggestion can be entered after the first save, as in the legacy form.'} />
        <div className="zrv-hr-grid zrv-hr-is-2">
          {readOnly('pa-prepared', 'Prepared & Agreed by', saved ? record.preparedBy : lookups.requestor?.fullName)}
          {readOnly('pa-approved', 'Approved by', approvedBy(record?.status))}
          <HrField id="pa-comment" label="Comments" required={saved} error={errors.comment}><textarea id="pa-comment" className="ux-textarea zrv-hr-input" value={form.comment} onChange={setValue('comment')} readOnly={!saved} maxLength={500} aria-invalid={Boolean(errors.comment)} /></HrField>
          <HrField id="pa-comments" label="Suggestion" required={saved} error={errors.comments}><textarea id="pa-comments" className="ux-textarea zrv-hr-input" value={form.comments} onChange={setValue('comments')} readOnly={!saved} maxLength={500} aria-invalid={Boolean(errors.comments)} /></HrField>
        </div>
      </>}
      </RecruitmentShell>
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}
