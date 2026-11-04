import { useState } from 'react'
import { useNavigate } from 'react-router'
import usePermissions from '@/features/access/usePermissions.js'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { businessToday, enDate, initials } from '@/features/hr-recruitment/shared/hrFormat.js'
import { useRecruitmentForm } from '@/features/hr-recruitment/shared/useRecruitmentForm.js'
import { NewFormDialog } from '@/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx'
import { RecruitmentLoader } from '@/features/hr-recruitment/shared/components/RecruitmentLoader.jsx'
import { FileDrop, HrField } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
import { Orbit, RecruitmentShell, StepHead, Tilt } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { BUSINESS_VISA_PATHS as PATHS, LETTERS_BREADCRUMB } from '../employeeServicesPaths.js'
import { STATUS_TEXT, isEditable } from '../shared/formRecords.js'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'
import '@/styles/hr-business-visa.css'
import { NATIONALITIES } from './nationalities.js'
import {
  FILE_EXTENSIONS, FILE_MAX_MB, RESOURCE, TEXT_MAX, blankRequest, businessVisaService as service, fileProblem, validateRequest,
} from './businessVisaService.js'

// The legacy Business Visa Request form (visa_request/visa.php): a visa for a
// business visitor coming to the company, with the passport copy attached.
const TITLE = 'Business Visa Request'
const STEPS = ['Request', 'Visitor', 'Travel & visa', 'Documents']
const SAVE = 'Save request'
const STEP_OF = {
  division: 0, dept: 0, requestDate: 0,
  visitorName: 1, visitorPhone: 1, nationality: 1, profession: 1, passportNo: 1, issueDate: 1, expiryDate: 1, companyName: 1, address: 1, tel: 1, fax: 1, arrivalDate: 1,
  comingFrom: 2, travelRoute: 2, visitPurpose: 2, saudiEmbassy: 2, visaType: 2, otherDetails: 2,
  files: 3,
}
const STEP_FIELDS = [
  ['division', 'dept', 'requestDate'],
  ['visitorName', 'visitorPhone', 'nationality', 'profession', 'passportNo', 'issueDate', 'expiryDate', 'companyName', 'tel', 'fax', 'arrivalDate'],
  ['comingFrom', 'travelRoute', 'visitPurpose', 'saudiEmbassy'],
]
const FILE_TEXT = Object.freeze({
  title: 'Attach a clear copy of the passport',
  hint: `Drop files here or click to browse · up to ${FILE_MAX_MB} MB each`,
  uploadNote: 'New files are uploaded when you save; each is named after its file.',
  remove: (name) => `Remove ${name}`,
  size: (kb) => `${kb} KB`,
})
const EXPENSES = [['Company', 'Company'], ['Personal', 'Personal'], ['Other', 'Others']]
const nationalityLabel = (value) => NATIONALITIES.find((item) => item.value === value)?.label ?? value
const visaTypeOf = (form) => [form.visaSingle && 'Single', form.visaMultiple && 'Multiple for 1 year'].filter(Boolean).join(' · ')

export default function BusinessVisaPage() {
  return (
    <RecruitmentLoader current="business-visa" flow={false} breadcrumb={LETTERS_BREADCRUMB} identify={() => {}}
      title={TITLE} param="requestId" load={service.getById} loadLookups={(signal) => service.options({ signal })}>
      {({ lookups, record, editorKey }) => <VisaEditor key={editorKey} lookups={lookups} initial={record} />}
    </RecruitmentLoader>
  )
}

const formOf = (record) => Object.fromEntries(Object.keys(blankRequest('')).map((key) => [key, record[key]]))

function VisaEditor({ lookups, initial }) {
  const navigate = useNavigate()
  const permissions = usePermissions()
  const editor = useRecruitmentForm({
    basePath: PATHS.form, idKey: 'requestId', record: initial,
    initialForm: initial ? formOf(initial) : blankRequest(businessToday()),
  })
  const { form, patch, step, setStep, record } = editor
  const [errors, setErrors] = useState({})
  const [files, setFiles] = useState([])
  const [dialog, setDialog] = useState(null)
  const canWrite = permissions.can(`${RESOURCE}:${record ? 'UPDATE' : 'CREATE'}`)
  const canAttach = permissions.can(`${RESOURCE}:UPDATE`) || !record
  const locked = Boolean(record && !isEditable(record.status)) || !canWrite
  const documents = record?.documents ?? []

  const clear = (...keys) => setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key))))
  const set = (key) => (event) => { editor.set(key)(event); clear(key) }
  const toggle = (key, group) => (event) => { patch({ [key]: event.target.checked }); clear(group ?? key, 'otherDetails') }

  const addFiles = (list) => {
    const added = list.filter((item) => item.file)
    const problems = added.map((item) => fileProblem(item.file)).filter(Boolean)
    setFiles(added.filter((item) => !fileProblem(item.file)))
    setErrors((current) => ({ ...current, files: problems.join(' ') || undefined }))
  }
  const removeSaved = (file) => {
    if (editor.dirty || files.length) { editor.showProblem('Save or discard your changes before removing a saved document.'); return }
    editor.perform(async ({ saved }) => {
      const result = await service.removeDocument(editor.recordId, file.attachmentId)
      saved(result)
      return result
    }, { success: `${file.fileName} removed.` })
  }

  const save = () => {
    if (locked) return
    const next = validateRequest(form)
    if (!record && !files.length) next.files = 'Attach a clear copy of the passport.'
    setErrors(next)
    const keys = Object.keys(next)
    if (keys.length) {
      editor.reject(Math.min(...keys.map((key) => STEP_OF[key] ?? 0)), keys.length === 1 ? next[keys[0]] : C.reviewProblems(keys.length))
      return
    }
    editor.perform(async ({ saved: keep }) => {
      let result = await service.save(editor.recordId, form)
      keep(result)
      // Each upload is kept as it lands, so a failed one leaves the request and earlier files saved.
      for (const item of files) {
        result = await service.addDocument(result.requestId, item)
        keep(result)
        setFiles((current) => current.filter((file) => file !== item))
      }
      return result
    }, { success: (result) => `Business visa request ${result.requestNo || result.requestId} saved.` })
  }
  const leave = (path) => ((editor.dirty || files.length) && !locked ? setDialog({ path }) : navigate(path))
  const tools = [
    { icon: 'printer', label: C.print, onClick: () => window.print() },
    { icon: 'chart-column', label: 'Report', onClick: () => leave(PATHS.report) },
    { icon: 'file-plus', label: 'New request', onClick: () => leave(PATHS.form) },
    { icon: 'house', label: C.home, onClick: () => leave('/dashboard') },
  ]

  const has = (key) => Boolean(String(form[key] ?? '').trim())
  const counts = STEP_FIELDS.map((keys) => keys.filter(has).length)
  const visaDone = (form.visaSingle || form.visaMultiple) && (!(form.travelOther || form.hotelOther) || has('otherDetails'))
  const fileCount = documents.length + files.length
  const doneSteps = [counts[0] === 3, counts[1] === STEP_FIELDS[1].length, counts[2] === 4 && visaDone, fileCount > 0]
  const requiredTotal = 3 + STEP_FIELDS[1].length + 4 + 2
  const filled = counts[0] + counts[1] + counts[2] + (visaDone ? 1 : 0) + (fileCount ? 1 : 0)
  const open = STEPS.filter((_, index) => !doneSteps[index])
  const visaType = visaTypeOf(form)

  const field = (key, label, { type = 'text', required = true, wide = false, placeholder, max = TEXT_MAX } = {}) => (
    <HrField key={key} id={`bv-${key}`} label={label} required={required} wide={wide} error={errors[key]}>
      {type === 'textarea'
        ? <textarea {...fieldProps(`bv-${key}`, { error: errors[key] })} className="ux-input zrv-hr-input" rows={2} maxLength={max} value={form[key]} onChange={set(key)} readOnly={locked} placeholder={placeholder} />
        : <input {...fieldProps(`bv-${key}`, { error: errors[key] })} type={type} className="ux-input zrv-hr-input" aria-required={required || undefined}
          maxLength={type === 'text' || type === 'tel' ? max : undefined} value={form[key]} onChange={set(key)} readOnly={locked} placeholder={placeholder} />}
    </HrField>
  )
  const select = (key, label, options, placeholder = 'Select') => (
    <HrField id={`bv-${key}`} label={label} required error={errors[key]}>
      <select {...fieldProps(`bv-${key}`, { error: errors[key] })} className="ux-select zrv-hr-input" aria-required="true" value={form[key]} onChange={set(key)} disabled={locked}>
        <option value="">{placeholder}</option>
        {/* A saved value outside the list (older records) stays visible. */}
        {form[key] && !options.some((item) => item.value === form[key]) && <option value={form[key]}>{form[key]}</option>}
        {options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </HrField>
  )
  const check = (key, label, group) => (
    <label key={key} className={`zrv-hr-bv-check${form[key] ? ' zrv-hr-is-on' : ''}`}>
      <input type="checkbox" checked={form[key]} onChange={toggle(key, group)} disabled={locked} />
      <span>{label}</span>
    </label>
  )

  return <>
    <RecruitmentShell current="business-visa" flow={false} compact breadcrumb={LETTERS_BREADCRUMB} title={TITLE}
      tools={tools} primary={{ label: SAVE, icon: 'save', onClick: save }} locked={locked} pending={editor.pending} focusError={editor.focusError}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss}
      steps={[
        [STEPS[0], `${counts[0]}/3 required`], [STEPS[1], `${counts[1]}/${STEP_FIELDS[1].length} required`],
        [STEPS[2], visaType || `${counts[2]}/4 required`], [STEPS[3], fileCount ? `${fileCount} file${fileCount === 1 ? '' : 's'}` : 'Passport copy'],
      ]}
      step={step} onStep={setStep} doneSteps={doneSteps} finalLabel={SAVE} onFinal={save}
      side={<>
        <Tilt aria-label="Request card">
          <div className="zrv-hr-dark__top"><span className="zrv-hr-mono">{record?.requestNo || 'Draft'}</span><span className="zrv-hr-dark__status">{record ? STATUS_TEXT[record.status] : 'Not saved'}</span></div>
          <div className="zrv-hr-dark__who"><span className="zrv-hr-dark__av" aria-hidden="true">{initials(form.visitorName)}</span><div>
            <h3 className={`zrv-hr-dark__title${has('visitorName') ? '' : ' zrv-hr-is-empty'}`}>{form.visitorName.trim() || 'Visitor'}</h3>
            <div className={`zrv-hr-dark__sub${has('companyName') ? '' : ' zrv-hr-is-empty'}`}>{form.companyName.trim() || 'Company'}</div></div></div>
          <div className="zrv-hr-dark__badges">
            {visaType && <span className="zrv-hr-is-solid">{visaType}</span>}
            {form.nationality && <span>{nationalityLabel(form.nationality)}</span>}
          </div>
          <div className="zrv-hr-dark__grid">
            <div><small>Arrival</small><b>{form.arrivalDate ? enDate(form.arrivalDate) : '—'}</b></div>
            <div><small>Passport expiry</small><b>{form.expiryDate ? enDate(form.expiryDate) : '—'}</b></div>
            <div><small>Requested by</small><b>{record?.requestedBy || 'You'}</b></div>
            <div><small>Documents</small><b>{fileCount}</b></div>
          </div>
        </Tilt>
        <Orbit done={filled} total={requiredTotal} hint={open.length ? `Still open: ${open.join(', ')}` : 'Ready to save.'} />
      </>}>

      {step === 0 && <>
        <StepHead title="Who is requesting the visa?" desc="The request date and the requester's signature." />
        <div className="zrv-hr-grid zrv-hr-is-4">
          {select('division', 'Division', lookups.divisions.map((item) => ({ value: item.code, label: item.name })))}
          {select('dept', 'Department', lookups.departments.map((name) => ({ value: name, label: name })))}
          {field('requestDate', 'Date', { type: 'date' })}
          <HrField id="bv-no" label="Request no."><input id="bv-no" className="ux-input zrv-hr-input" readOnly value={record?.requestNo ?? ''} placeholder={C.generated} /></HrField>
        </div>
        {record && <>
          <h3 className="zrv-hr-subh">Signature</h3>
          <div className="zrv-hr-grid zrv-hr-is-4">
            {[['bv-req', 'Requested by', record.requestedBy], ['bv-noted', 'Noted by', record.notedBy], ['bv-appr', 'Approved by', record.approvedBy], ['bv-status', 'Status', STATUS_TEXT[record.status]]].map(([id, label, value]) => (
              <HrField key={id} id={id} label={label}><input id={id} className="ux-input zrv-hr-input" readOnly value={value || ''} placeholder="—" /></HrField>
            ))}
          </div>
        </>}
      </>}

      {step === 1 && <>
        <StepHead title="Who is visiting?" desc="The visitor as written in their passport." />
        <h3 className="zrv-hr-subh">Identity</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {field('visitorName', 'Visitor name')}
          {select('nationality', 'Nationality', NATIONALITIES)}
          {field('profession', 'Profession')}
          {field('visitorPhone', 'Visitor phone', { type: 'tel' })}
        </div>
        <h3 className="zrv-hr-subh">Passport</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {field('passportNo', 'Passport no.')}
          {field('issueDate', 'Issue date', { type: 'date' })}
          {field('expiryDate', 'Expiry date', { type: 'date' })}
          {field('arrivalDate', 'Approx. arrival', { type: 'date' })}
        </div>
        <h3 className="zrv-hr-subh">Company</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {field('companyName', 'Company name & business', { wide: true })}
          {field('tel', 'Tel', { type: 'tel' })}
          {field('fax', 'Fax', { type: 'tel' })}
          {field('address', 'Address', { type: 'textarea', required: false, wide: true })}
        </div>
      </>}

      {step === 2 && <>
        <StepHead title="How will they travel, and who pays?" desc="Route, purpose, visa type and expenses." />
        <h3 className="zrv-hr-subh">Travel</h3>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {field('comingFrom', 'Coming from')}
          {field('travelRoute', 'Travelling route (sector)')}
          {field('visitPurpose', 'Purpose of visit')}
          {field('saudiEmbassy', 'Saudi embassy', { placeholder: 'City the visa is sent to' })}
        </div>
        <h3 className="zrv-hr-subh">Visa and expenses</h3>
        <div className="zrv-hr-bv-rows">
          <div className={`zrv-hr-bv-row${errors.visaType ? ' zrv-hr-is-bad' : ''}`} role="group" aria-labelledby="bv-visa">
            <span id="bv-visa" className="zrv-hr-label">Visa type<i className="zrv-hr-req" aria-hidden="true">*</i></span>
            <div className="zrv-hr-bv-checks">{check('visaSingle', 'Single', 'visaType')}{check('visaMultiple', 'Multiple for 1 year', 'visaType')}</div>
            {errors.visaType && <small className="zrv-auth-field-error" role="alert">{errors.visaType}</small>}
          </div>
          {[['travel', 'Travel expenses on'], ['hotel', 'Hotel expenses on']].map(([prefix, label]) => (
            <div key={prefix} className="zrv-hr-bv-row" role="group" aria-labelledby={`bv-${prefix}`}>
              <span id={`bv-${prefix}`} className="zrv-hr-label">{label}</span>
              <div className="zrv-hr-bv-checks">{EXPENSES.map(([suffix, text]) => check(`${prefix}${suffix}`, text))}</div>
            </div>
          ))}
        </div>
        {(form.travelOther || form.hotelOther || has('otherDetails')) && <div className="zrv-hr-grid zrv-hr-mt">
          {field('otherDetails', 'If other, please specify', { type: 'textarea', required: form.travelOther || form.hotelOther, wide: true })}
        </div>}
      </>}

      {step === 3 && <>
        <StepHead title="Which documents are attached?" desc={record ? 'Saved documents can be removed while the request is a draft or rejected.' : 'A clear copy of the passport is required.'} />
        <p className="zrv-hr-esf-note" role="note">Accepted: <b>{FILE_EXTENSIONS.join(', ').toUpperCase()}</b> · up to <b>{FILE_MAX_MB} MB</b> each.</p>
        <div className={errors.files ? 'zrv-hr-is-bad' : undefined}>
          <FileDrop text={FILE_TEXT} files={[...documents, ...files]} disabled={locked || !canAttach}
            canRemoveSaved={!locked && canAttach} onRemove={removeSaved} onChange={addFiles} />
        </div>
        {errors.files && <p className="zrv-auth-field-error" role="alert">{errors.files}</p>}
      </>}
    </RecruitmentShell>
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}
