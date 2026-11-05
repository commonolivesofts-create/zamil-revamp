import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { ConfirmDialog } from '@/features/security-administration/components/AdminUi.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from '../hrRecruitmentActions.js'
import { COMMON_TEXT, OFFER_TEXT as T } from '../hrRecruitmentText.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { businessToday, enDate, formatAmount, isIsoDate } from '../shared/hrFormat.js'
import { useRecruitmentForm } from '../shared/useRecruitmentForm.js'
import { useRecruitmentSteps } from '../shared/useRecruitmentSteps.js'
import { reviewCompletion, reviewField } from '../shared/recruitmentSteps.js'
import { RecruitmentLoader } from '../shared/components/RecruitmentLoader.jsx'
import { NewFormDialog } from '../shared/components/RecruitmentDialogs.jsx'
import { Orbit, Pill, RecruitmentShell, StepHead } from '../shared/components/RecruitmentShell.jsx'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { HrField, Review, SearchableLookup } from '../shared/components/RecruitmentInputs.jsx'
import {
  OFFER_VALIDATION_FIELDS, PACKAGE_KEYS, TERMS_KEYS, benefitType, blankOffer, completeOfferTranslations, englishDisplay, isOfferLocked, monthlyPackage,
  offerCandidateFields, offerFormFromRecord, offerPayload, packageArcs, offerStepErrors,
} from './offerModel.js'

import { OfferLetter } from './OfferLetter.jsx'
import { printOfferLetter } from './printOfferLetter.js'

const BASE = '/hr/recruitment/offer'
const service = hrRecruitmentServices.offers
const BENEFIT_ICONS = Object.freeze({
  basic: 'wallet', housing: 'house', transport: 'layers', vacation: 'clock', ticket: 'plane', medical: 'heart-pulse',
  contract: 'file-text', start: 'calendar-days', probation: 'users',
})
const PACKAGE_TONES = Object.freeze(['zrv-hr-is-basic', 'zrv-hr-is-housing', 'zrv-hr-is-transport'])
const PACKAGE_CIRCUMFERENCE = 289.03 // 2π × 46
// Keep Oracle IDs in the saved value; show the legacy form's business-unit labels.
const BUSINESS_UNITS = Object.freeze([
  Object.freeze({ code: '300000002689294', name: 'FPP BU' }),
  Object.freeze({ code: '300000002689307', name: 'IPP BU' }),
])
const businessUnitName = (code) => BUSINESS_UNITS.find((unit) => unit.code === code)?.name ?? COMMON_TEXT.dash

export default function OfferPage() {
  return (
    <RecruitmentLoader current="offer" title={T.title} param="offerId" load={service.getById} loadLookups={(signal) => service.getLookups({ signal })}>
      {({ lookups, lookupStatus, reloadLookups, record, editorKey }) => <OfferEditor key={editorKey} lookups={lookups} lookupStatus={lookupStatus} reloadLookups={reloadLookups} record={record} />}
    </RecruitmentLoader>
  )
}

function OfferEditor({ lookups, lookupStatus, reloadLookups, record: savedRecord }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const permissions = usePermissions()
  const today = businessToday()
  const currency = 'SAR'
  const requestedAssessment = searchParams.get('assessmentNumber')?.trim().toLowerCase()
  const sourceCandidate = !savedRecord && requestedAssessment
    ? lookups.candidates.find((candidate) => candidate.intNo.toLowerCase() === requestedAssessment)
    : null
  const editor = useRecruitmentForm({
    basePath: BASE, idKey: 'offerId', record: savedRecord,
    stepCount: 3, validationFields: OFFER_VALIDATION_FIELDS,
    initialForm: savedRecord ? offerFormFromRecord(savedRecord) : { ...blankOffer(today), ...(sourceCandidate ? offerCandidateFields(sourceCandidate) : {}) },
  })
  const { form, record, step, setStep, patch } = editor
  const [saving, setSaving] = useState(false)
  const [acceptanceError, setAcceptanceError] = useState('')
  const [acceptanceReasonError, setAcceptanceReasonError] = useState('')
  const [focusRow, setFocusRow] = useState(null)
  const [language, setLanguage] = useState('bi')
  const [dialog, setDialog] = useState(null)
  const [acceptanceDate, setAcceptanceDate] = useState('')
  const [acceptanceReason, setAcceptanceReason] = useState('')
  const canSave = !isOfferLocked(record?.status) && (record ? permissions.can(ACTIONS.OFFER_UPDATE) : permissions.can(ACTIONS.OFFER_CREATE))
  const canDelete = Boolean(record && !isOfferLocked(record.status) && permissions.can(ACTIONS.OFFER_DELETE))
  const locked = isOfferLocked(record?.status) || !canSave
  const status = record?.status ?? 'INCOMPLETE'
  const { parts, monthly, yearly } = monthlyPackage(form.benefits)
  const stepErrors = offerStepErrors(form)
  Object.entries(editor.fieldErrors).forEach(([key, message]) => {
    const field = Object.values(OFFER_VALIDATION_FIELDS).find((definition) => definition.key === key)
    stepErrors[field?.step ?? 0][key] = message
  })
  const navigation = useRecruitmentSteps({ step, setStep, errorsByStep: stepErrors, reject: editor.reject, readOnly: locked })
  const doneSteps = navigation.doneSteps
  const errors = { ...navigation.errors, ...editor.fieldErrors }
  const allErrors = { ...Object.assign({}, ...stepErrors), ...editor.fieldErrors }
  const conversionTimers = useRef({})
  const conversionRevision = useRef(0)
  const printRequested = searchParams.get('print') === '1'
  useEffect(() => {
    if (!savedRecord?.offerId || !printRequested) return undefined
    let cancelled = false
    printOfferLetter(document.querySelector('.zrv-hr--offer .zrv-offer-letter'), () => cancelled).then((printed) => {
      if (!printed || cancelled) return
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        next.delete('print')
        return next
      }, { replace: true })
    })
    return () => { cancelled = true }
  }, [savedRecord?.offerId, printRequested, setSearchParams])
  const lookupNotice = lookupStatus === 'loading'
    ? <p className="zrv-admin-state" role="status">Loading offer options…</p>
    : lookupStatus === 'error' || lookups.lookupErrors?.length
      ? <div className="zrv-admin-state zrv-admin-state--error" role="alert">
          <p>Some offer options could not be loaded. You can still enter offer details; retry to reload the available lists.</p>
          <button type="button" className="btn-secondary" onClick={reloadLookups}>Retry</button>
        </div>
      : null

  const set = (key) => (eventOrValue) => {
    editor.set(key)(eventOrValue)
  }
  const setRow = (key, changes) => {
    patch((current) => ({ benefits: { ...current.benefits, [key]: { ...current.benefits[key], ...changes } } }))
  }
  const convertArabic = (key, value) => {
    clearTimeout(conversionTimers.current[key])
    if (!value) return
    const revision = conversionRevision.current
    conversionTimers.current[key] = setTimeout(async () => {
      try {
        const arabic = key === 'basic'
          ? await service.numberToArabic(Number(String(value).replaceAll(',', '')))
          : await service.hijriDate(value)
        if (revision !== conversionRevision.current) return
        patch((current) => current.benefits[key]?.linked && current.benefits[key]?.en === value
          ? { benefits: { ...current.benefits, [key]: { ...current.benefits[key], ar: arabic } } }
          : {})
      } catch {
        // The Arabic value remains editable if the conversion endpoint is unavailable.
      }
    }, 250)
  }
  useEffect(() => () => { conversionRevision.current += 1; Object.values(conversionTimers.current).forEach(clearTimeout) }, [])
  const changeBenefitEnglish = (key, value) => {
    const linked = form.benefits[key].linked
    setRow(key, linked ? { en: value, ar: '' } : { en: value })
    if (linked && ['basic', 'start'].includes(key)) convertArabic(key, value)
    if (linked && !['basic', 'start'].includes(key)) {
      const type = ({ housing: 'housing', transport: 'transport', vacation: 'vacation', ticket: 'ticket', medical: 'medical', contract: 'contract' })[key]
      const option = lookups.allowances[type]?.find((item) => item.meaning === value)
      if (option) setRow(key, { ar: option.description })
      else setRow(key, { linked: false })
    }
  }
  const chooseCandidate = (candidate) => {
    patch({ ...offerCandidateFields(candidate), ...(form.intNo === candidate.intNo ? {} : { candidateNameAr: '' }) })
  }
  const candidateChanged = (value) => {
    set('candidateNameEn')(value)
    const matches = lookups.candidates.filter((item) => item.candidateName.toLowerCase() === value.trim().toLowerCase())
    const candidate = matches.find((item) => item.intNo === form.intNo) || (matches.length === 1 ? matches[0] : null)
    if (candidate) chooseCandidate(candidate)
    else patch({ candidateNameAr: '', position: '', intNo: '', reqNo: '' })
  }
  const assessmentChanged = (value) => {
    const candidate = lookups.candidates.find((item) => item.intNo.toLowerCase() === value.trim().toLowerCase())
    if (candidate) chooseCandidate(candidate)
    else patch({ candidateNameEn: '', candidateNameAr: '', position: '', intNo: value, reqNo: '' })
  }
  const chooseTitle = (value) => {
    const title = lookups.titles.find((item) => item.meaning === value)
    patch({ salutation: value, salutationAr: title?.description ?? '' })
  }
  const setArabicLinked = (key, row) => {
    if (row.linked) {
      setRow(key, { linked: false })
      return
    }
    if (key === 'basic' || key === 'start') {
      setRow(key, { linked: true })
      convertArabic(key, row.en)
    } else {
      const type = ({ housing: 'housing', transport: 'transport', vacation: 'vacation', ticket: 'ticket', medical: 'medical', contract: 'contract' })[key]
      const option = lookups.allowances[type]?.find((item) => item.meaning === row.en)
      if (option) setRow(key, { linked: true, ar: option.description })
      else setRow(key, { linked: false })
    }
  }

  const saveRecord = async ({ saved }) => {
    conversionRevision.current += 1
    Object.values(conversionTimers.current).forEach(clearTimeout)
    const prepared = await completeOfferTranslations(form, service)
    const result = await service.save(editor.recordId, offerPayload(prepared))
    saved(result)
    return result
  }
  const save = async () => {
    if (saving || editor.pending) return
    if (!canSave) return editor.showProblem(COMMON_TEXT.readOnly)
    if (!navigation.validateAll()) return
    setSaving(true)
    try {
      const outcome = await editor.perform(saveRecord, { success: (result) => `${T.saved(result.offerNumber || result.offerId)} Status: ${T.status[result.status] || result.status}.` })
      if (outcome.status === 'success') editor.resetToSaved(outcome.value, offerFormFromRecord(outcome.value))
      return outcome
    } finally {
      setSaving(false)
    }
  }
  const recordAcceptance = () => {
    if (!record?.canRecordAcceptance || editor.dirty || editor.pending) return
    if (!isIsoDate(acceptanceDate) || acceptanceDate < record.offerDate || acceptanceDate > today) {
      setAcceptanceError('Enter the actual acceptance date between the offer date and today.')
      return
    }
    setAcceptanceError('')
    setAcceptanceReasonError('')
    editor.perform(() => service.accept(record.offerId, acceptanceDate, acceptanceReason), {
      success: 'Offer acceptance recorded. The linked requisition is now Offer Accepted.',
    }).then((outcome) => {
      if (outcome.status === 'success') editor.resetToSaved(outcome.value, offerFormFromRecord(outcome.value))
      else if (outcome.error?.code === 'VALIDATION_ERROR') {
        const issues = outcome.error.details ?? []
        const dateInvalid = issues.some((issue) => issue.field === 'acceptedDate')
        const reasonInvalid = issues.some((issue) => issue.field === 'reason')
        if (dateInvalid) setAcceptanceError('Enter a valid actual acceptance date.')
        if (reasonInvalid) setAcceptanceReasonError('Use a single line of text, up to 1000 characters.')
        if (dateInvalid || reasonInvalid) editor.dismiss()
      }
    })
  }
  const deleteRecord = () => editor.perform(async () => {
    await service.remove(record.offerId)
    return true
  }, { success: T.deleted }).then((outcome) => {
    if (outcome.status === 'success') navigate(BASE, { replace: true })
  })
  // Leaving with unsaved answers asks first (New form and Report).
  const leave = (path) => (editor.dirty ? setDialog({ path }) : navigate(path))

  const benefit = (key, index) => {
    const text = T.benefits[key]
    const type = benefitType(key)
    const row = form.benefits[key]
    const error = errors[key]
    const arabicError = errors[`${key}Ar`]
    const enId = `of-${key}-en`
    const lookupKey = ({ housing: 'housing', transport: 'transport', vacation: 'vacation', ticket: 'ticket', medical: 'medical', contract: 'contract' })[key]
    const picks = (lookups.allowances[lookupKey] ?? []).map((item) => [item.meaning, item.description])
    return (
      <article key={key} className={`zrv-hr-benefit${row.en ? ' zrv-hr-is-done' : ''}${error ? ' zrv-hr-is-bad' : ''}`} style={{ '--i': index }}
        onFocus={() => setFocusRow(key)} onBlur={() => setFocusRow(null)}>
        <div className="zrv-hr-benefit__h">
          <span className="zrv-hr-bubble"><OrvexaIcon name={BENEFIT_ICONS[key]} size={17} /></span>
          <b>{text.en}{key === 'start' && <i className="zrv-hr-req" aria-hidden="true"> *</i>}</b><span className="zrv-hr-benefit__ar" lang="ar" dir="rtl">{text.ar}</span>
          <span className="zrv-hr-benefit__ok" aria-hidden="true"><OrvexaIcon name="check" size={12} /></span>
        </div>
        <div className="zrv-hr-pair">
          <div className="zrv-hr-pair__in">
            <label className="zrv-hr-sr" htmlFor={enId}>{T.labels.english(text.en)}</label>
            {picks.length ? <SearchableLookup id={enId} value={row.en} customValue={row.en} error={error}
              options={Array.from(new Map(picks.map(([en, ar]) => [en, { code: en, name: en, description: ar }])).values())}
              onChange={(option) => setRow(key, { en: option.code, ar: option.description, linked: true })}
              onInputChange={(value) => changeBenefitEnglish(key, value)} placeholder={`Search ${text.en.toLowerCase()}`} maxLength={500} />
              : <input {...fieldProps(enId, { error })} className={`ux-input zrv-hr-input${type === 'money' ? ' has-suffix' : ''}`}
                  type={type === 'date' ? 'date' : 'text'} inputMode={type === 'money' ? 'decimal' : undefined} maxLength={type === 'date' ? undefined : 500}
                  aria-required={key === 'start' ? true : undefined}
                  placeholder={type === 'money' ? T.placeholders.money : type === 'date' ? undefined : T.placeholders.text} value={row.en}
                  onChange={(event) => changeBenefitEnglish(key, event.target.value)} />}
            {type === 'money' && !picks.length && <span className="zrv-hr-pair__suffix">{T.perMonth(currency)}</span>}
          </div>
          <div className="zrv-hr-pair__in" dir="rtl">
            <label className="zrv-hr-sr" htmlFor={`of-${key}-ar`}>{T.labels.arabic(text.en)}</label>
            <input {...fieldProps(`of-${key}-ar`, { error: arabicError })} className="ux-input zrv-hr-input" dir="rtl" lang="ar" placeholder={T.placeholders.arabic} value={row.ar} maxLength={key === 'basic' ? 1000 : key === 'start' ? 100 : 500}
              onChange={(event) => setRow(key, { ar: event.target.value, linked: false })} />
            <button type="button" className={`zrv-hr-auto${row.linked ? '' : ' zrv-hr-is-off'}`} aria-pressed={row.linked} title={T.auto.title} aria-label={`${T.auto.title}: ${text.en}`}
              onClick={() => setArabicLinked(key, row)}>{row.linked ? T.auto.on : T.auto.off}</button>
          </div>
        </div>
        {error && <small className="zrv-auth-field-error" id={`${enId}-error`}>{error}</small>}
        {arabicError && <small className="zrv-auth-field-error" id={`of-${key}-ar-error`}>{arabicError}</small>}

      </article>
    )
  }

  // The primary button saves, so the toolbar has no second Save.
  const tools = [
    ...(canDelete ? [{ icon: 'trash-2', label: T.deleteAction, onClick: () => setDialog('delete'), disabled: editor.pending }] : []),
    { icon: 'printer', label: COMMON_TEXT.print, onClick: () => printOfferLetter(document.querySelector('.zrv-hr--offer .zrv-offer-letter')) },
    { icon: 'chart-column', label: COMMON_TEXT.report, onClick: () => leave(`${BASE}/report`) },
    { icon: 'file-plus', label: T.report.newOffer, onClick: () => leave(BASE) },
    { icon: 'house', label: COMMON_TEXT.home, onClick: () => navigate('/dashboard') },
  ]
  const steps = T.tabNames.map((name, index) => [name, index === 2 ? navigation.firstInvalid < 0 ? 'Ready to save' : 'Check required details' : doneSteps[index] ? T.tabHints.done : T.tabHints.open])
  const saveLabel = saving ? 'Saving...' : record ? 'Save changes' : T.primary
  const candidateOptions = lookups.candidates.map((candidate) => ({
    code: candidate.intNo, name: candidate.candidateName,
    description: [candidate.positionName, candidate.intNo, candidate.requisitionNo].filter(Boolean).join(' / '),
    searchText: [candidate.positionName, candidate.intNo, candidate.requisitionNo].filter(Boolean).join(' '), candidate,
  }))
  const arabicReview = (label, value, error) => ({ ...reviewField(label, value, false, error), lang: 'ar', dir: 'rtl' })
  const reviewSections = [
    { title: 'Offer and candidate details', rows: [
      reviewField(T.labels.date, enDate(form.offerDate), true, allErrors.offerDate),
      reviewField(T.labels.division, businessUnitName(form.division), true, allErrors.division),
      reviewField(T.labels.salutation, form.salutation, false, allErrors.salutation),
      arabicReview('Title (Arabic)', form.salutationAr, allErrors.salutationAr),
      reviewField(T.labels.nameEn, form.candidateNameEn, true, allErrors.candidateNameEn),
      arabicReview(T.labels.nameAr, form.candidateNameAr, allErrors.candidateNameAr),
      reviewField(T.labels.position, form.position, true, allErrors.position),
      reviewField(T.labels.intNo, form.intNo, true, allErrors.intNo),
      reviewField(T.labels.reqNo, form.reqNo, false, allErrors.reqNo),
    ] },
    ...[['Package', PACKAGE_KEYS], ['Terms and conditions', TERMS_KEYS]].map(([title, keys]) => ({ title, rows: keys.flatMap((key) => [
      reviewField(T.labels.english(T.benefits[key].en), englishDisplay(key, form.benefits[key].en, currency), key === 'start', allErrors[key]),
      arabicReview(T.labels.arabic(T.benefits[key].en), form.benefits[key].ar, allErrors[`${key}Ar`]),
    ]) })),
    { title: 'Additional details', rows: [reviewField(T.labels.applicant, form.applicant, false, allErrors.applicant), reviewField(T.labels.comments, form.comments, false, allErrors.comments), reviewField('Actual acceptance date', enDate(record?.acceptedDate))] },
  ]
  const reviewProgress = reviewCompletion(reviewSections)

  return (
    <>
      <RecruitmentShell
        current="offer" title={T.title}
        flowStatus={record ? [record.offerId, T.status[record.status]].filter(Boolean).join(' · ') : null}
        tools={tools} primary={{ label: saveLabel, icon: 'save', onClick: save, disabled: !canSave }}
        feedback={editor.feedback} feedbackMode="toast" pendingMessage={saving ? "Saving employment offer" : editor.pending ? "Updating employment offer" : null} onDismissFeedback={editor.dismiss} lookupNotice={lookupNotice} locked={locked} pending={editor.pending} focusError={editor.focusError}
        steps={steps} step={step} onStep={setStep} doneSteps={doneSteps} lockedSteps={navigation.lockedSteps} onContinue={navigation.validateStep} finalLabel={saveLabel} onFinal={save}
        banner={!locked ? <><p className="zrv-hr-draft-note"><OrvexaIcon name="info" size={17} /><span>Complete the required details and select <strong>{record ? 'Save changes' : T.primary}</strong> to mark this offer Completed.</span></p>
          {sourceCandidate && <p className="zrv-hr-draft-note"><OrvexaIcon name="info" size={17} /><span>Candidate, position and requisition have been filled from assessment <strong>{sourceCandidate.intNo}</strong>. Complete the offer details below.</span></p>}
          {requestedAssessment && !record && !sourceCandidate && <p className="zrv-hr-draft-note"><OrvexaIcon name="info" size={17} /><span>This assessment is no longer in the approved, passed candidate list. Choose an available candidate below.</span></p>}
        </> : null}
        side={<>
          <div className="zrv-hr-side__h">
            <span className="zrv-hr-side__t"><span className="zrv-hr-eyebrow">{T.letter.side}</span><Pill tone={status === 'INCOMPLETE' ? 'warn' : 'ok'}>{T.status[status] ?? status}</Pill></span>
            <div className="zrv-hr-seg" role="group" aria-label={T.letter.languages} style={{ '--li': T.languages.findIndex(([value]) => value === language) }}>
              <span className="zrv-hr-seg__pill" aria-hidden="true" />
              {T.languages.map(([value, label]) => (
                <button key={value} type="button" aria-pressed={language === value} onClick={() => setLanguage(value)} lang={value === 'ar' ? 'ar' : undefined}>{label}</button>
              ))}
            </div>
          </div>
          <OfferLetter form={form} language={language} focusRow={focusRow} />
          <section className="zrv-hr-pkg zrv-hr-card">
            <svg width="104" height="104" viewBox="0 0 120 120" role="img" aria-label={T.package.label(currency, formatAmount(monthly))}>
              <circle cx="60" cy="60" r="46" fill="none" className="zrv-hr-pkg__track" strokeWidth="12" />
              {packageArcs(parts, PACKAGE_CIRCUMFERENCE).map((arc, index) => (
                <circle key={PACKAGE_TONES[index]} className={`zrv-hr-pkg__arc ${PACKAGE_TONES[index]}`} cx="60" cy="60" r="46" fill="none" strokeWidth="12"
                  strokeDasharray={`${arc.length.toFixed(2)} ${PACKAGE_CIRCUMFERENCE}`} strokeDashoffset={arc.offset.toFixed(2)} transform="rotate(-90 60 60)" />
              ))}
            </svg>
            <div className="zrv-hr-pkg__k">
              <small>{T.package.monthly}</small><b>{currency} {formatAmount(monthly)}</b>
              <small>{monthly ? T.package.yearly(currency, formatAmount(yearly)) : T.package.empty}</small>
              <div className="zrv-hr-legend">
                {T.package.parts.map((label, index) => <span key={label}><i className={PACKAGE_TONES[index]} />{label}<b>{parts[index] ? formatAmount(parts[index]) : COMMON_TEXT.dash}</b></span>)}
              </div>
            </div>
          </section>
          <Orbit done={reviewProgress.complete} total={reviewProgress.total} hint={doneSteps.every(Boolean) ? T.orbitReady : COMMON_TEXT.stillOpen(T.tabNames.filter((_, index) => !doneSteps[index]))} />
        </>}
      >
        {step === 0 && <>
          <StepHead {...T.heads[0]} />
          <div className="zrv-hr-grid zrv-hr-is-4 zrv-hr-mt zrv-hr-offer-candidate-grid">
            <HrField id="of-title" label={T.labels.salutation} error={errors.salutation}>
              <SearchableLookup id="of-title" value={form.salutation} customValue={form.salutation} options={lookups.titles.map((item) => ({ code: item.meaning, name: item.meaning, description: item.description }))}
                onChange={(option) => chooseTitle(option.code)} onClear={() => chooseTitle('')} placeholder="Choose a title" error={errors.salutation} />
            </HrField>
            <HrField id="of-name" label={T.labels.nameEn} required error={errors.candidateNameEn}>
              <SearchableLookup id="of-name" value={candidateOptions.find((option) => option.code === form.intNo && option.name === form.candidateNameEn)?.code || ''} customValue={form.candidateNameEn}
                options={candidateOptions} onChange={(option) => chooseCandidate(option.candidate)} onInputChange={candidateChanged}
                placeholder="Search and select an approved candidate" required error={errors.candidateNameEn}
                describedBy="of-candidate-autofill" />
            </HrField>
            <HrField id="of-name-ar" label={T.labels.nameAr} error={errors.candidateNameAr}>
              <input {...fieldProps('of-name-ar', { error: errors.candidateNameAr })} className="ux-input zrv-hr-input" dir="rtl" lang="ar" value={form.candidateNameAr} onChange={set('candidateNameAr')} placeholder={T.placeholders.nameAr} maxLength={200} />
            </HrField>
            <HrField id="of-position" label={T.labels.position} required error={errors.position}>
              <input {...fieldProps('of-position', { error: errors.position })} className="ux-input zrv-hr-input" placeholder="Filled from selected candidate"
                value={form.position} readOnly={lookups.candidates.some((candidate) => candidate.intNo === form.intNo)} aria-required="true" maxLength={200} />
            </HrField>
            <HrField id="of-date" label={T.labels.date} required error={errors.offerDate}>
              <input {...fieldProps('of-date', { error: errors.offerDate })} type="date" className="ux-input zrv-hr-input" value={form.offerDate} onChange={set('offerDate')} aria-required="true" />
            </HrField>
            <HrField id="of-division" label={T.labels.division} required error={errors.division}>
              <SearchableLookup id="of-division" value={form.division} options={BUSINESS_UNITS}
                onChange={(option) => set('division')(option.code)} placeholder="Choose FPP BU or IPP BU" required error={errors.division} />
            </HrField>
            <HrField id="of-intno" label={T.labels.intNo} required error={errors.intNo}>
              <SearchableLookup id="of-intno" value={form.intNo} customValue={form.intNo} error={errors.intNo} required maxLength={100}
                options={candidateOptions.map((option) => ({ ...option, name: option.code, description: `${option.name} / ${option.candidate.positionName}` }))}
                onChange={(option) => chooseCandidate(option.candidate)} onInputChange={assessmentChanged} placeholder="Filled from selected candidate" />
            </HrField>
            <HrField id="of-reqno" label={T.labels.reqNo} error={errors.reqNo}>
              <input {...fieldProps('of-reqno', { error: errors.reqNo })} className="ux-input zrv-hr-input" value={form.reqNo} readOnly maxLength={100}
                placeholder="Filled from selected candidate" />
            </HrField>
          </div>
          <small className="zrv-hr-offer-candidate-hint" id="of-candidate-autofill">Selecting a candidate fills their position, assessment number and requisition number.</small>
          <div className="zrv-hr-grid zrv-hr-is-3 zrv-hr-mt">
            <HrField id="of-applicant" label={T.labels.applicant} error={errors.applicant}>
              <input {...fieldProps('of-applicant', { error: errors.applicant })} className="ux-input zrv-hr-input" value={form.applicant} onChange={set('applicant')} maxLength={200} />
            </HrField>
            <HrField id="of-com" label={T.labels.comments} error={errors.comments} wide>
              <textarea {...fieldProps('of-com', { error: errors.comments })} className="ux-textarea zrv-hr-input" value={form.comments} onChange={set('comments')} placeholder={T.placeholders.comments} maxLength={4000} />
            </HrField>
          </div>
        </>}
        {step === 1 && <>
          <StepHead {...T.heads[1]} />
          <h3 className="zrv-hr-subh">Compensation package</h3>
          <div className="zrv-hr-benefits">{PACKAGE_KEYS.map(benefit)}</div>
          <h3 className="zrv-hr-subh zrv-hr-mt">Employment terms and benefits</h3>
          <div className="zrv-hr-benefits">{TERMS_KEYS.map(benefit)}</div>
        </>}
        {step === 2 && <>
          <StepHead title="Review employment offer" />
          <Review sections={reviewSections} {...reviewProgress} formTitle="Employment Offer" reference={record?.offerNumber || record?.offerId} approvalStatus={T.status[status] || status} statusLabel="Offer status" />
          {record?.status === 'ACCEPTED' ? (
            <div className="zrv-hr-offer-acceptance" role="status">
              <b>Offer Accepted</b>
              <p>Accepted on {enDate(record.acceptedDate)}. The linked requisition can now be marked Filled / Closed by HR.</p>
            </div>
          ) : record?.canRecordAcceptance && permissions.can(ACTIONS.OFFER_UPDATE) && (
            <div className="zrv-hr-offer-acceptance">
              <b>Record offer acceptance</b>
              <p>Enter the date the candidate actually accepted this offer. This updates the linked requisition's recruitment status.</p>
              <div className="zrv-hr-offer-acceptance__controls">
                <HrField id="of-accepted-date" label="Actual acceptance date" required error={acceptanceError}>
                  <input {...fieldProps('of-accepted-date', { error: acceptanceError })} type="date" className="ux-input zrv-hr-input" value={acceptanceDate} min={record.offerDate} max={today} onChange={(event) => { setAcceptanceDate(event.target.value); setAcceptanceError('') }} aria-required="true" />
                </HrField>
                <HrField id="of-acceptance-reason" label="Reason (optional)" error={acceptanceReasonError}>
                  <input {...fieldProps('of-acceptance-reason', { error: acceptanceReasonError })} className="ux-input zrv-hr-input" value={acceptanceReason} maxLength={1000} onChange={(event) => { setAcceptanceReason(event.target.value); setAcceptanceReasonError('') }} />
                </HrField>
                <button type="button" className="btn-primary zrv-hr-btn" onClick={recordAcceptance} disabled={editor.pending || editor.dirty || !record.reqNo}><span className="zrv-hr-btn__label">Record acceptance</span></button>
              </div>
              {editor.dirty && <small>Save your changes before recording acceptance.</small>}
              {!record.reqNo && <small>Link this offer to a requisition and save it first.</small>}
            </div>
          )}
        </>}
      </RecruitmentShell>

      {dialog === 'delete' && <ConfirmDialog title={T.deleteTitle} description={T.deleteBody} confirmLabel={T.deleteAction} pending={editor.pending}
        feedback={editor.feedback} onConfirm={deleteRecord} onClose={() => setDialog(null)} />}
      {dialog?.path && <NewFormDialog onConfirm={() => { const { path } = dialog; setDialog(null); navigate(path) }} onClose={() => setDialog(null)} />}
    </>
  )
}
