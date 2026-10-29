import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { businessToday, initials } from '../shared/hrFormat.js'
import { useRecruitmentForm } from '../shared/useRecruitmentForm.js'
import { RecruitmentLoader } from '../shared/components/RecruitmentLoader.jsx'
import { NewFormDialog, ReportDialog } from '../shared/components/RecruitmentDialogs.jsx'
import { PanelHead, Pill, RecruitmentShell, Ticket, Tilt } from '../shared/components/RecruitmentShell.jsx'
import { HrField } from '../shared/components/RecruitmentInputs.jsx'
import { EmployeePicker } from '../shared/components/EmployeePicker.jsx'

const BASE = '/hr/recruitment/probation-evaluation'
const service = hrRecruitmentServices.probations
const today = businessToday
const emptyLine = () => ({ lineId: null, param: '', paramAr: '', rating: '' })
const blank = () => ({ formDate: today(), evaluationPeriod: '', formType: '', fromDate: '', toDate: '', comment: '', comments: '', lines: [emptyLine()] })
const steps = [['Employee & period', 'Evaluation details'], ['Ratings', 'Add and rate criteria'], ['Comments', 'Review and save']]

export default function ProbationPage() {
  return (
    <RecruitmentLoader current="probation" demo={false} title="Probation Evaluation" subtitle="Create and maintain a probation evaluation."
      param="evaluationId" load={service.getById} loadLookups={(signal) => service.getLookups({ signal })}>
      {({ lookups, record, editorKey }) => <ProbationEditor key={editorKey} lookups={lookups} record={record} />}
    </RecruitmentLoader>
  )
}

function ProbationEditor({ lookups, record }) {
  const navigate = useNavigate()
  const editor = useRecruitmentForm({ basePath: BASE, idKey: 'evaluationId', record, initialForm: record ? {
    formDate: record.formDate, evaluationPeriod: record.evaluationPeriod, formType: record.formType,
    fromDate: record.fromDate, toDate: record.toDate, comment: record.comment, comments: record.comments,
    lines: record.lines.map((line) => ({ ...line })),
  } : blank() })
  const { form, set, patch, step, setStep } = editor
  const [employee, setEmployee] = useState(record?.employee ?? null)
  const employeeRequest = useRef(0)
  const [errors, setErrors] = useState({})
  const [dialog, setDialog] = useState(null)
  const total = form.lines.reduce((sum, line) => sum + (Number(line.rating) || 0), 0)
  const searchEmployees = (query) => {
    const term = query.trim().toLocaleLowerCase()
    return Promise.resolve({ items: lookups.employees.filter((item) => item.name.toLocaleLowerCase().includes(term)) })
  }
  const setValue = (key) => (event) => { set(key)(event); setErrors((value) => ({ ...value, [key]: '' })) }
  const updateLine = (index, key, value) => patch((current) => ({ lines: current.lines.map((line, row) => row === index ? { ...line, [key]: value } : line) }))
  const selectEmployee = async (item) => {
    const request = ++employeeRequest.current
    setEmployee(item)
    patch({ employee: item })
    try {
      const details = await service.employeeDetails(item.name)
      if (request !== employeeRequest.current) return
      setEmployee(details)
      patch({ employee: details })
    } catch {
      if (request !== employeeRequest.current) return
      setErrors((value) => ({ ...value, employee: 'Could not load the selected employee details. Please try again.' }))
    }
  }
  const validate = () => {
    const next = {}
    if (!employee?.name || !employee?.employeeNumber || !employee?.employeeId) next.employee = 'Select an employee with complete employee details.'
    if (!form.formType) next.formType = 'Select a form type.'
    if (!form.formDate) next.formDate = 'Form date is required.'
    if (!form.fromDate) next.fromDate = 'Evaluation start date is required.'
    if (!form.toDate) next.toDate = 'Evaluation end date is required.'
    if (form.fromDate && form.toDate && form.toDate < form.fromDate) next.toDate = 'End date must be on or after the start date.'
    if (employee?.grade !== '' && employee?.grade != null && (!Number.isInteger(Number(employee.grade)) || Number(employee.grade) < 0)) next.grade = 'Grade must be a whole number of zero or more.'
    if (!form.lines.length || form.lines.length > 20) next.lines = 'Add between 1 and 20 evaluation criteria.'
    form.lines.forEach((line, index) => {
      if (!line.param.trim()) next[`line:${index}`] = 'Enter a criterion.'
      if (line.rating !== '' && (!Number.isInteger(Number(line.rating)) || Number(line.rating) < 1 || Number(line.rating) > 5)) next[`rating:${index}`] = 'Rating must be from 1 to 5, or blank.'
    })
    setErrors(next)
    if (Object.keys(next).length) {
      setStep(Object.keys(next).some((key) => key.startsWith('line:') || key.startsWith('rating:') || key === 'lines') ? 1 : 0)
      editor.reject(Object.keys(next).some((key) => key.startsWith('line:') || key.startsWith('rating:') || key === 'lines') ? 1 : 0, 'Review the highlighted fields.')
      return false
    }
    return true
  }
  const save = () => {
    if (!validate()) return
    const payload = { ...form, employee, lines: form.lines.map((line) => ({ ...line, rating: line.rating === '' ? 0 : Number(line.rating) })) }
    editor.perform(async ({ saved }) => {
      const result = await service.save(editor.recordId, payload)
      saved(result)
      return result
    }, { success: (result) => `Probation evaluation ${result.evaluationNumber} saved.` })
  }
  const startNew = () => navigate(BASE)
  const tools = [
    { icon: 'save', label: 'Save draft', onClick: save, disabled: editor.pending },
    { icon: 'printer', label: 'Print', onClick: () => window.print() },
    { icon: 'chart-column', label: 'Records', onClick: () => setDialog('report') },
    { icon: 'file-plus', label: 'New form', onClick: () => (editor.dirty ? setDialog('new') : startNew()) },
  ]
  const readOnly = (id, label, value) => <HrField id={id} label={label}><input id={id} className="ux-input zrv-hr-input" readOnly value={value ?? ''} /></HrField>

  return <>
    <RecruitmentShell current="probation" title="Probation Evaluation" subtitle="Create and maintain a probation evaluation."
      flowStatus={record ? `${record.evaluationNumber} · ${record.status}` : null} tools={tools}
      primary={{ label: 'Save draft', icon: 'save', onClick: save }} feedback={editor.feedback} onDismissFeedback={editor.dismiss}
      locked={false} pending={editor.pending} focusError={editor.focusError}
      ticket={<Ticket avatar={initials(employee?.name)} code="PAF · 1064" items={[
        { k: 'Evaluation no.', v: record?.evaluationNumber || 'Assigned on save' },
        { k: 'Employee', v: employee?.name || 'Not selected', big: true },
        { k: 'Form type', v: form.formType || '—' }, { k: 'Total rating', v: `${total}/100` },
        { k: 'Status', v: <Pill tone="warn">{record?.status || 'Not saved'}</Pill> },
      ]} />}
      steps={steps} step={step} onStep={setStep} doneSteps={[Boolean(employee && form.formType && form.fromDate && form.toDate), form.lines.every((line) => line.param && line.rating !== ''), Boolean(form.comment || form.comments)]}
      finalLabel="Save draft" onFinal={save} side={<>
        <Tilt aria-label="Evaluation overview"><div className="zrv-hr-dark__top"><span className="zrv-hr-eyebrow">Evaluation overview</span><span className="zrv-hr-mono">{employee?.employeeNumber || 'PAF · DRAFT'}</span></div>
          <div className="zrv-hr-dark__who"><span className="zrv-hr-dark__av">{initials(employee?.name)}</span><div><h3 className="zrv-hr-dark__title">{employee?.name || 'Select an employee'}</h3><div className="zrv-hr-dark__sub">{employee ? `${employee.position || '—'} · ${employee.grade || '—'}` : 'Employee details appear here'}</div></div></div>
          <div className="zrv-hr-dark__badges"><span>{form.formType || 'Choose form type'}</span><span>{employee?.departmentName || 'Department'}</span></div>
        </Tilt>
        <section className="zrv-hr-scorecard zrv-hr-card"><b>{total}</b><span> Total rating · {form.lines.length} criteria</span><p>Ratings use the backend scale from 1 to 5.</p></section>
      </>}>
      {step === 0 && <><PanelHead n={1} eyebrow="Employee and period" title="Choose the employee and evaluation period." desc="Employee information is loaded from HR records." />
        <EmployeePicker id="pa-emp" label="Employee" required value={employee} onPick={selectEmployee} error={errors.employee} searchService={searchEmployees} />
        <div className="zrv-hr-grid zrv-hr-is-3 zrv-hr-mt">{readOnly('pa-no', 'Employee number', employee?.employeeNumber)}{readOnly('pa-title', 'Job title', employee?.position)}
          <HrField id="pa-grade" label="Grade" error={errors.grade}><input id="pa-grade" className="ux-input zrv-hr-input" type="number" min="0" step="1" value={employee?.grade ?? ''} aria-invalid={Boolean(errors.grade)} onChange={(event) => { const grade = event.target.value; setEmployee((current) => ({ ...current, grade })); patch({ employee: { ...employee, grade } }); setErrors((value) => ({ ...value, grade: '' })) }} /></HrField>
          {readOnly('pa-dept', 'Department', employee?.departmentName)}{readOnly('pa-requestor', 'Prepared by', lookups.requestor?.fullName)}
          <HrField id="pa-form-date" label="Form date" required error={errors.formDate}><input id="pa-form-date" className="ux-input zrv-hr-input" type="date" value={form.formDate} onChange={setValue('formDate')} /></HrField>
          <HrField id="pa-type" label="Form type" required error={errors.formType}><select id="pa-type" className="ux-input zrv-hr-input" value={form.formType} onChange={setValue('formType')}><option value="">Select a form type</option>{lookups.probation.formTypes.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></HrField>
          <HrField id="pa-from" label="Evaluation from" required error={errors.fromDate}><input id="pa-from" className="ux-input zrv-hr-input" type="date" value={form.fromDate} onChange={setValue('fromDate')} /></HrField>
          <HrField id="pa-to" label="Evaluation to" required error={errors.toDate}><input id="pa-to" className="ux-input zrv-hr-input" type="date" value={form.toDate} onChange={setValue('toDate')} /></HrField>
          <HrField id="pa-period" label="Evaluation period"><input id="pa-period" className="ux-input zrv-hr-input" value={form.evaluationPeriod} onChange={setValue('evaluationPeriod')} maxLength={200} /></HrField>
        </div>
      </>}
      {step === 1 && <><PanelHead n={2} eyebrow="Ratings" title="Add evaluation criteria." desc="Enter the criteria for this form type and rate each from 1 to 5. The backend does not provide predefined criteria." />
        {form.lines.map((line, index) => <div className="zrv-hr-grid zrv-hr-is-3 zrv-hr-mt" key={line.lineId ?? index}>
          <HrField id={`pa-param-${index}`} label={`Criterion ${index + 1}`} required error={errors[`line:${index}`]}><input id={`pa-param-${index}`} className="ux-input zrv-hr-input" value={line.param} maxLength={500} onChange={(event) => updateLine(index, 'param', event.target.value)} /></HrField>
          <HrField id={`pa-param-ar-${index}`} label="Criterion (Arabic)"><input id={`pa-param-ar-${index}`} className="ux-input zrv-hr-input" dir="rtl" value={line.paramAr} maxLength={500} onChange={(event) => updateLine(index, 'paramAr', event.target.value)} /></HrField>
          <HrField id={`pa-rating-${index}`} label="Rating (1–5)" error={errors[`rating:${index}`]}><select id={`pa-rating-${index}`} className="ux-input zrv-hr-input" value={line.rating} onChange={(event) => updateLine(index, 'rating', event.target.value)}><option value="">Not rated</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating}</option>)}</select></HrField>
          {form.lines.length > 1 && !record && <button type="button" className="btn-secondary zrv-hr-btn" onClick={() => patch((current) => ({ lines: current.lines.filter((_, row) => row !== index) }))}><OrvexaIcon name="trash-2" size={15} /> Remove criterion</button>}
        </div>)}
        {errors.lines && <p className="zrv-auth-field-error">{errors.lines}</p>}
        {!record && form.lines.length < 20 && <button type="button" className="btn-secondary zrv-hr-btn zrv-hr-mt" onClick={() => patch((current) => ({ lines: [...current.lines, emptyLine()] }))}><OrvexaIcon name="plus" size={15} /> Add criterion</button>}
      </>}
      {step === 2 && <><PanelHead n={3} eyebrow="Comments" title="Add comments and review the draft." desc="The server stores these comments with the evaluation." />
        <div className="zrv-hr-grid zrv-hr-is-2"><HrField id="pa-comment" label="Comment"><textarea id="pa-comment" className="ux-textarea zrv-hr-input" value={form.comment} onChange={setValue('comment')} maxLength={4000} /></HrField>
          <HrField id="pa-comments" label="Additional comments"><textarea id="pa-comments" className="ux-textarea zrv-hr-input" value={form.comments} onChange={setValue('comments')} maxLength={4000} /></HrField></div>
        <div className="zrv-hr-sep" /><p><b>{employee?.name || 'No employee selected'}</b> · {form.formType || 'No form type'} · {form.fromDate || '—'} to {form.toDate || '—'}</p>
        <p>Total rating: <b>{total}</b> · Criteria: {form.lines.length}</p>
      </>}
      </RecruitmentShell>
    {dialog === 'new' && <NewFormDialog onConfirm={() => { setDialog(null); startNew() }} onClose={() => setDialog(null)} />}
    {dialog === 'report' && <ReportDialog title="Probation evaluation records" resourceKey="hr-probation-report" load={service.list} onClose={() => setDialog(null)}
      numberOf={(item) => item.evaluationNumber} statusOf={(item) => item.status} pathOf={(item) => `${BASE}/${item.evaluationId}`}
      columns={[["Employee", (item) => item.employeeName], ["Form type", (item) => item.formType], ["Total rating", (item) => item.totalRating]]} />}
  </>
}
