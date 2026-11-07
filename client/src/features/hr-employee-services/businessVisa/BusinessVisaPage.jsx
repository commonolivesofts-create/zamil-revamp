import { useState } from 'react'
import { useNavigate } from 'react-router'
import usePermissions from '@/features/access/usePermissions.js'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { businessToday } from '@/features/hr-recruitment/shared/hrFormat.js'
import { useRecruitmentForm } from '@/features/hr-recruitment/shared/useRecruitmentForm.js'
import { NewFormDialog } from '@/features/hr-recruitment/shared/components/RecruitmentDialogs.jsx'
import { RecruitmentLoader } from '@/features/hr-recruitment/shared/components/RecruitmentLoader.jsx'
import { FileDrop, HrField, SearchableLookup } from '@/features/hr-recruitment/shared/components/RecruitmentInputs.jsx'
import { RecruitmentShell } from '@/features/hr-recruitment/shared/components/RecruitmentShell.jsx'
import { ES_COMMON_TEXT as C } from '../hrEmployeeServicesText.js'
import { BUSINESS_VISA_PATHS as PATHS, LETTERS_BREADCRUMB } from '../employeeServicesPaths.js'
import { isEditable } from '../shared/formRecords.js'
import { REQUEST_STATUS_TEXT as STATUS_TEXT } from './businessVisaStatus.js'
import '@/styles/hr-employee-services.css'
import '@/styles/hr-employee-services-forms.css'
import { NO_IDENTIFY } from '../shared/useEmployeeServicesUser.js'
import '@/styles/hr-business-visa.css'
import { NATIONALITIES } from './nationalities.js'
import {
  FILE_EXTENSIONS, FILE_MAX_MB, RESOURCE, TEXT_MAX, blankRequest, businessVisaService as service, fileProblem, validateRequest,
} from './businessVisaService.js'
import PreviewLanguageSwitch from '../shared/PreviewLanguageSwitch.jsx'
import BusinessVisaRequestPreview from './BusinessVisaRequestPreview.jsx'

// The legacy Business Visa Request form (visa_request/visa.php): a visa for a
// business visitor coming to the company, with the passport copy attached.
// A short form, so one compact page with anchored sections (as Sick Leave) and a
// live preview of the request beside it.
const TITLE = 'Business Visa Request'
const SECTIONS = ['Requester', 'Visitor', 'Travel & visa', 'Documents']
const SAVE = 'Save request'
const SECTION_OF = {
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
    <RecruitmentLoader current="business-visa" flow={false} breadcrumb={LETTERS_BREADCRUMB} identify={NO_IDENTIFY}
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
    basePath: PATHS.form, idKey: 'requestId', stepCount: SECTIONS.length, record: initial,
    initialForm: initial ? formOf(initial) : blankRequest(businessToday()),
  })
  const { form, patch, step, setStep, record } = editor
  const [errors, setErrors] = useState({})
  const [files, setFiles] = useState([])
  const [dialog, setDialog] = useState(null)
  const [language, setLanguage] = useState('en')
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

  const validateAll = () => {
    const next = validateRequest(form)
    if (!record && !files.length) next.files = 'Attach a clear copy of the passport.'
    return next
  }

  // One page: a tab scrolls to the section it names (as Sick Leave).
  const goToSection = (index) => {
    const next = Math.max(0, Math.min(SECTIONS.length - 1, index))
    setStep(next)
    document.getElementById(`bv-section-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const scrollToSection = (index) => requestAnimationFrame(() => document.getElementById(`bv-section-${index}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))

  const save = () => {
    if (locked) return
    const next = validateAll()
    setErrors(next)
    const keys = Object.keys(next)
    if (keys.length) {
      const first = Math.min(...keys.map((key) => SECTION_OF[key] ?? 0))
      editor.reject(first, keys.length === 1 ? next[keys[0]] : C.reviewProblems(keys.length))
      scrollToSection(first)
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
  const visaType = visaTypeOf(form)
  const divisionName = lookups.divisions.find((item) => item.code === form.division)?.name

  const field = (key, label, { type = 'text', required = true, wide = false, placeholder, max = TEXT_MAX } = {}) => (
    <HrField key={key} id={`bv-${key}`} label={label} required={required} wide={wide} error={errors[key]}>
      {type === 'textarea'
        ? <textarea {...fieldProps(`bv-${key}`, { error: errors[key] })} className="ux-input zrv-hr-input" rows={2} maxLength={max} value={form[key]} onChange={set(key)} readOnly={locked} placeholder={placeholder} />
        : <input {...fieldProps(`bv-${key}`, { error: errors[key] })} type={type} max={type === 'date' ? '9999-12-31' : undefined} className="ux-input zrv-hr-input" aria-required={required || undefined}
          maxLength={type === 'text' || type === 'tel' ? max : undefined} value={form[key]} onChange={set(key)} readOnly={locked} placeholder={placeholder} />}
    </HrField>
  )
  // Long lists (divisions, departments and nationalities) are searchable; a saved
  // value outside the list (older records) still shows and can be replaced.
  const select = (key, label, options, placeholder = 'Search or select') => (
    <HrField id={`bv-${key}`} label={label} required error={errors[key]}>
      <SearchableLookup id={`bv-${key}`} value={form[key]} customValue={form[key]} required error={errors[key]} disabled={locked}
        options={options.map((item) => ({ code: item.value, name: item.label }))}
        onChange={(option) => set(key)(option.code)} onClear={() => set(key)('')}
        placeholder={placeholder} maxLength={200} />
    </HrField>
  )
  const check = (key, label, group) => (
    <label key={key} className={`zrv-hr-bv-check${form[key] ? ' zrv-hr-is-on' : ''}`}>
      <input type="checkbox" checked={form[key]} onChange={toggle(key, group)} disabled={locked} />
      <span>{label}</span>
    </label>
  )
  const attachments = [...documents.map((item) => item.fileName), ...files.map((item) => item.fileName)]

  return <>
    <RecruitmentShell current="business-visa" flow={false} compact singlePage breadcrumb={LETTERS_BREADCRUMB} title={TITLE}
      tools={tools} primary={{ label: SAVE, icon: 'save', onClick: save }} locked={locked} pending={editor.pending} focusError={editor.focusError}
      feedback={editor.feedback} onDismissFeedback={editor.dismiss}
      steps={[
        [SECTIONS[0], `${counts[0]}/3 required`], [SECTIONS[1], `${counts[1]}/${STEP_FIELDS[1].length} required`],
        [SECTIONS[2], visaType || `${counts[2]}/4 required`], [SECTIONS[3], fileCount ? `${fileCount} file${fileCount === 1 ? '' : 's'}` : 'Passport copy'],
      ]}
      step={step} onStep={goToSection} doneSteps={doneSteps}
      side={<>
        <div className="zrv-hr-side__h">
          <span className="zrv-hr-side__t"><span className="zrv-hr-eyebrow">Preview</span></span>
          <PreviewLanguageSwitch value={language} onChange={setLanguage} />
        </div>
        <BusinessVisaRequestPreview form={form} record={record} divisionName={divisionName} nationality={nationalityLabel(form.nationality)}
          attachments={attachments} files={[...documents, ...files]} language={language} />
      </>}>

      <section id="bv-section-0" className="zrv-hr-esf-section">
        <div className="zrv-hr-esf-sectionhead">
          <h2>Requester</h2>
          <span className="zrv-hr-esf-count" role="status">{counts[0]} / 3 required</span>
        </div>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {select('division', 'Division', lookups.divisions.map((item) => ({ value: item.code, label: item.name })))}
          {select('dept', 'Department', lookups.departments.map((name) => ({ value: name, label: name })))}
          {field('requestDate', 'Date', { type: 'date' })}
          <HrField id="bv-no" label="Request no."><input id="bv-no" className="ux-input zrv-hr-input" readOnly value={record?.requestNo ?? ''} placeholder={C.generated} /></HrField>
        </div>
        {record && <div className="zrv-hr-grid zrv-hr-is-4 zrv-hr-mt">
          {[['bv-req', 'Requested by', record.requestedBy], ['bv-noted', 'Noted by', record.notedBy], ['bv-appr', 'Approved by', record.approvedBy], ['bv-status', 'Status', STATUS_TEXT[record.status]]].map(([id, label, value]) => (
            <HrField key={id} id={id} label={label}><input id={id} className="ux-input zrv-hr-input" readOnly value={value || ''} placeholder="—" /></HrField>
          ))}
        </div>}
      </section>

      <section id="bv-section-1" className={`zrv-hr-esf-card zrv-hr-mt${step === 1 ? ' zrv-hr-is-focus' : ''}`}>
        <div className="zrv-hr-esf-sectionhead">
          <h2>Visitor</h2>
          <span className="zrv-hr-esf-count" role="status">{counts[1]} / {STEP_FIELDS[1].length} required</span>
        </div>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {field('visitorName', 'Visitor name')}
          {select('nationality', 'Nationality', NATIONALITIES)}
          {field('profession', 'Profession')}
          {field('visitorPhone', 'Visitor phone', { type: 'tel' })}
          {field('passportNo', 'Passport no.')}
          {field('issueDate', 'Issue date', { type: 'date' })}
          {field('expiryDate', 'Expiry date', { type: 'date' })}
          {field('arrivalDate', 'Approx. arrival', { type: 'date' })}
        </div>
        <div className="zrv-hr-grid zrv-hr-is-4 zrv-hr-mt">
          {field('companyName', 'Company name & business', { wide: true })}
          {field('tel', 'Tel', { type: 'tel' })}
          {field('fax', 'Fax', { type: 'tel' })}
          {field('address', 'Address', { type: 'textarea', required: false, wide: true })}
        </div>
      </section>

      <section id="bv-section-2" className={`zrv-hr-esf-card zrv-hr-mt${step === 2 ? ' zrv-hr-is-focus' : ''}`}>
        <div className="zrv-hr-esf-sectionhead">
          <h2>Travel &amp; visa</h2>
          <span className="zrv-hr-esf-daypill" role="status">{visaType || `${counts[2]} / 4 required`}</span>
        </div>
        <div className="zrv-hr-grid zrv-hr-is-4">
          {field('comingFrom', 'Coming from')}
          {field('travelRoute', 'Travelling route (sector)')}
          {field('visitPurpose', 'Purpose of visit')}
          {field('saudiEmbassy', 'Saudi embassy', { placeholder: 'City the visa is sent to' })}
        </div>
        <div className="zrv-hr-bv-rows zrv-hr-mt">
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
      </section>

      <section id="bv-section-3" className={`zrv-hr-esf-card zrv-hr-mt${step === 3 ? ' zrv-hr-is-focus' : ''}`}>
        <div className="zrv-hr-esf-sectionhead">
          <h2>Documents</h2>
          <span className="zrv-hr-esf-count" role="status">{fileCount} file{fileCount === 1 ? '' : 's'}</span>
        </div>
        <p className="zrv-hr-esf-note" role="note">Accepted: <b>{FILE_EXTENSIONS.join(', ').toUpperCase()}</b> · up to <b>{FILE_MAX_MB} MB</b> each.</p>
        <div className={errors.files ? 'zrv-hr-is-bad zrv-hr-mt' : 'zrv-hr-mt'}>
          <FileDrop text={FILE_TEXT} files={[...documents, ...files]} disabled={locked || !canAttach}
            canRemoveSaved={!locked && canAttach} onRemove={removeSaved} onChange={addFiles} />
        </div>
        {errors.files && <p className="zrv-auth-field-error" role="alert">{errors.files}</p>}
      </section>
    </RecruitmentShell>
    {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
  </>
}
