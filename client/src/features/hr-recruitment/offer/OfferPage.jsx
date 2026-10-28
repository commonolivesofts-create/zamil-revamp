import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { ConfirmDialog } from '@/features/security-administration/components/AdminUi.jsx'
import usePermissions from '@/features/access/usePermissions.js'
import { HR_RECRUITMENT_ACTIONS as ACTIONS } from '../hrRecruitmentActions.js'
import { COMMON_TEXT, OFFER_TEXT as T } from '../hrRecruitmentText.js'
import { hrRecruitmentServices } from '../hrRecruitmentService.js'
import { arDate, businessToday, enDate, formatAmount, initials } from '../shared/hrFormat.js'
import { useRecruitmentForm } from '../shared/useRecruitmentForm.js'
import { RecruitmentLoader } from '../shared/components/RecruitmentLoader.jsx'
import { NewFormDialog, ReportDialog } from '../shared/components/RecruitmentDialogs.jsx'
import { Orbit, PanelHead, Pill, RecruitmentShell, Ticket } from '../shared/components/RecruitmentShell.jsx'
import { fieldProps } from '@/features/security-administration/adminForms.js'
import { HrField } from '../shared/components/RecruitmentInputs.jsx'
import {
  BENEFIT_KEYS, STEP_BENEFITS, benefitType, blankOffer, englishDisplay, isOfferLocked, monthlyPackage,
  offerDoneSteps, offerFormFromRecord, offerPayload, offerProgress, packageArcs, validateOffer,
} from './offerModel.js'

const BASE = '/hr/recruitment/offer'
const service = hrRecruitmentServices.offers
const BENEFIT_ICONS = Object.freeze({
  basic: 'wallet', housing: 'house', transport: 'layers', vacation: 'clock', ticket: 'plane', medical: 'heart-pulse',
  contract: 'file-text', start: 'calendar-days', probation: 'users',
})
const PACKAGE_TONES = Object.freeze(['zrv-hr-is-basic', 'zrv-hr-is-housing', 'zrv-hr-is-transport'])
const PACKAGE_CIRCUMFERENCE = 289.03 // 2π × 46

export default function OfferPage() {
  return (
    <RecruitmentLoader current="offer" title={T.title} subtitle={T.subtitle} param="offerId" load={service.getById} loadLookups={(signal) => service.getLookups({ signal })}>
      {({ lookups, lookupStatus, reloadLookups, record, editorKey }) => <OfferEditor key={editorKey} lookups={lookups} lookupStatus={lookupStatus} reloadLookups={reloadLookups} record={record} />}
    </RecruitmentLoader>
  )
}

function OfferEditor({ lookups, lookupStatus, reloadLookups, record: savedRecord }) {
  const navigate = useNavigate()
  const permissions = usePermissions()
  const today = businessToday()
  const currency = 'SAR'
  const editor = useRecruitmentForm({
    basePath: BASE, idKey: 'offerId', record: savedRecord,
    initialForm: savedRecord ? offerFormFromRecord(savedRecord) : blankOffer(today),
  })
  const { form, record, step, setStep, patch } = editor
  const [errors, setErrors] = useState({})
  const [focusRow, setFocusRow] = useState(null)
  const [language, setLanguage] = useState('bi')
  const [dialog, setDialog] = useState(null)
  const canSave = record ? permissions.can(ACTIONS.OFFER_UPDATE) : permissions.can(ACTIONS.OFFER_CREATE)
  const canDelete = Boolean(record && permissions.can(ACTIONS.OFFER_DELETE))
  const locked = isOfferLocked(record?.status) || !canSave
  const status = record?.status ?? 'INCOMPLETE'
  const { parts, monthly, yearly } = monthlyPackage(form.benefits)
  const doneSteps = offerDoneSteps(form)
  const progress = offerProgress(form)
  const conversionTimers = useRef({})
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
    setErrors((current) => ({ ...current, [key]: undefined }))
  }
  const setRow = (key, changes) => {
    patch((current) => ({ benefits: { ...current.benefits, [key]: { ...current.benefits[key], ...changes } } }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }
  const convertArabic = (key, value) => {
    clearTimeout(conversionTimers.current[key])
    if (!value) return
    conversionTimers.current[key] = setTimeout(async () => {
      try {
        const arabic = key === 'basic'
          ? await service.numberToArabic(Number(String(value).replaceAll(',', '')))
          : await service.hijriDate(value)
        patch((current) => current.benefits[key]?.linked && current.benefits[key]?.en === value
          ? { benefits: { ...current.benefits, [key]: { ...current.benefits[key], ar: arabic } } }
          : {})
      } catch {
        // The Arabic value remains editable if the conversion endpoint is unavailable.
      }
    }, 250)
  }
  useEffect(() => () => Object.values(conversionTimers.current).forEach(clearTimeout), [])
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
  const candidateChanged = (value) => {
    set('candidateNameEn')(value)
    const candidate = lookups.candidates.find((item) => item.candidateName.toLowerCase() === value.trim().toLowerCase())
    if (candidate) patch({ position: candidate.positionName, intNo: candidate.intNo, reqNo: candidate.requisitionNo })
    else patch({ position: '', intNo: '', reqNo: '' })
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
    const result = await service.save(editor.recordId, offerPayload(form))
    saved(result)
    return result
  }
  const save = () => {
    if (!canSave) return editor.showProblem(COMMON_TEXT.readOnly)
    const result = validateOffer(form)
    setErrors(result.errors)
    if (!result.valid) {
      const missing = Object.values(result.errors)
      editor.reject(result.firstStep, `${COMMON_TEXT.stillNeeded} ${missing.join(', ')}`)
      return
    }
    editor.perform(saveRecord, { success: (result) => T.saved(result.offerNumber || result.offerId) })
  }
  const deleteRecord = () => editor.perform(async () => {
    await service.remove(record.offerId)
    return true
  }, { success: T.deleted }).then((outcome) => {
    if (outcome.status === 'success') navigate(BASE, { replace: true })
  })
  const startNew = () => navigate(BASE)

  const benefit = (key, index) => {
    const text = T.benefits[key]
    const type = benefitType(key)
    const row = form.benefits[key]
    const error = errors[key]
    const enId = `of-${key}-en`
    const lookupKey = ({ housing: 'housing', transport: 'transport', vacation: 'vacation', ticket: 'ticket', medical: 'medical', contract: 'contract' })[key]
    const picks = (lookups.allowances[lookupKey] ?? []).map((item) => [item.meaning, item.description])
    return (
      <article key={key} className={`zrv-hr-benefit${row.en ? ' zrv-hr-is-done' : ''}${error ? ' zrv-hr-is-bad' : ''}`} style={{ '--i': index }}
        onFocus={() => setFocusRow(key)} onBlur={() => setFocusRow(null)}>
        <div className="zrv-hr-benefit__h">
          <span className="zrv-hr-bubble"><OrvexaIcon name={BENEFIT_ICONS[key]} size={17} /></span>
          <b>{text.en}</b><span className="zrv-hr-benefit__ar" lang="ar" dir="rtl">{text.ar}</span>
          <span className="zrv-hr-benefit__ok" aria-hidden="true"><OrvexaIcon name="check" size={12} /></span>
        </div>
        <div className="zrv-hr-pair">
          <div className="zrv-hr-pair__in">
            <label className="zrv-hr-sr" htmlFor={enId}>{T.labels.english(text.en)}</label>
            <input {...fieldProps(enId, { error })} className={`ux-input zrv-hr-input${type === 'money' ? ' has-suffix' : ''}`}
              type={type === 'date' ? 'date' : 'text'} inputMode={type === 'money' ? 'decimal' : undefined} maxLength={type === 'date' ? undefined : 500}
              aria-required={key === 'basic' || key === 'start' ? true : undefined}
              placeholder={type === 'money' ? T.placeholders.money : type === 'date' ? undefined : T.placeholders.text} value={row.en}
              onChange={(event) => changeBenefitEnglish(key, event.target.value)} />
            {type === 'money' && <span className="zrv-hr-pair__suffix">{T.perMonth(currency)}</span>}
          </div>
          <div className="zrv-hr-pair__in" dir="rtl">
            <label className="zrv-hr-sr" htmlFor={`of-${key}-ar`}>{T.labels.arabic(text.en)}</label>
            <input id={`of-${key}-ar`} className="ux-input zrv-hr-input" dir="rtl" lang="ar" placeholder={T.placeholders.arabic} value={row.ar} maxLength={key === 'basic' ? 1000 : key === 'start' ? 100 : 500}
              onChange={(event) => setRow(key, { ar: event.target.value, linked: false })} />
            <button type="button" className={`zrv-hr-auto${row.linked ? '' : ' zrv-hr-is-off'}`} aria-pressed={row.linked} title={T.auto.title} aria-label={`${T.auto.title}: ${text.en}`}
              onClick={() => setArabicLinked(key, row)}>{row.linked ? T.auto.on : T.auto.off}</button>
          </div>
        </div>
        {error && <small className="zrv-auth-field-error" id={`${enId}-error`}>{error}</small>}
        {picks.length > 0 && key !== 'probation' && (
          <div className="zrv-hr-picks">{picks.map(([en, ar], pickIndex) => <button key={`${en}-${pickIndex}`} type="button" onClick={() => setRow(key, { en, ar, linked: true })}>{en}</button>)}</div>
        )}
      </article>
    )
  }

  const placeholder = (value, fallback) => (value ? value : <span className="zrv-hr-paper__ph">{fallback}</span>)
  const tools = [
    { icon: 'save', label: COMMON_TEXT.save, onClick: save, disabled: locked || editor.pending },
    ...(canDelete ? [{ icon: 'trash-2', label: T.deleteAction, onClick: () => setDialog('delete'), disabled: editor.pending }] : []),
    { icon: 'printer', label: COMMON_TEXT.print, onClick: () => window.print() },
    { icon: 'chart-column', label: COMMON_TEXT.report, onClick: () => setDialog('report') },
    { icon: 'file-plus', label: COMMON_TEXT.requestForm, onClick: () => (editor.dirty ? setDialog('new') : startNew()) },
    { icon: 'house', label: COMMON_TEXT.home, onClick: () => navigate('/dashboard') },
  ]

  return (
    <>
      <RecruitmentShell
        current="offer" title={T.title} subtitle={T.subtitle}
        flowStatus={record ? [record.offerId, T.status[record.status]].filter(Boolean).join(' · ') : null}
        tools={tools} primary={{ label: T.primary, icon: 'save', onClick: save, disabled: !canSave }}
        feedback={editor.feedback} onDismissFeedback={editor.dismiss} lookupNotice={lookupNotice} locked={locked} pending={editor.pending} focusError={editor.focusError}
        ticket={<Ticket avatar={initials(form.candidateNameEn)} code={T.code} items={[
          { k: T.ticket.number, v: record?.offerId || T.ticket.numberPending },
          { k: T.ticket.candidate, v: form.candidateNameEn || T.ticket.newCandidate, big: true },
          { k: T.ticket.position, v: form.position || COMMON_TEXT.dash },
          { k: T.ticket.package, v: monthly ? `${currency} ${formatAmount(monthly)}` : COMMON_TEXT.dash },
          { k: T.ticket.status, v: <Pill tone="warn">{T.status[status]}</Pill> },
        ]} />}
        steps={T.steps} step={step} onStep={setStep} doneSteps={doneSteps} finalLabel={T.final} onFinal={save}
        side={<>
          <div className="zrv-hr-side__h">
            <span className="zrv-hr-eyebrow">{T.letter.side}</span>
            <div className="zrv-hr-seg" role="group" aria-label={T.letter.languages} style={{ '--li': T.languages.findIndex(([value]) => value === language) }}>
              <span className="zrv-hr-seg__pill" aria-hidden="true" />
              {T.languages.map(([value, label]) => (
                <button key={value} type="button" aria-pressed={language === value} onClick={() => setLanguage(value)} lang={value === 'ar' ? 'ar' : undefined}>{label}</button>
              ))}
            </div>
          </div>
          <article className="zrv-hr-paper" data-lang={language} aria-label={T.letter.label}>
            <div className="zrv-hr-paper__top">
              <div className="zrv-hr-paper__brand">{T.letter.brand}<small>{T.letter.kind}{record?.offerId ? ` · ${record.offerId}` : ''}</small></div>
              <h4><span data-l="en">{T.letter.title}</span><span data-l="ar" dir="rtl" lang="ar">{T.letterAr.title}</span></h4>
            </div>
            <p data-l="en">{T.letter.date} {placeholder(enDate(form.offerDate), T.letter.placeholders.date)}</p>
            <p data-l="ar" dir="rtl" lang="ar">{T.letterAr.date} {placeholder(arDate(form.offerDate), T.letterAr.placeholders.date)}</p>
            <p data-l="en">{T.letter.to} {form.salutation} {placeholder(form.candidateNameEn.trim(), T.letter.placeholders.name)}</p>
            <p data-l="ar" dir="rtl" lang="ar">{T.letterAr.to} {form.salutationAr} {placeholder(form.candidateNameAr.trim(), T.letterAr.placeholders.name)}</p>
            <p data-l="en">{T.letter.offer} <b>{placeholder(form.position.trim(), T.letter.placeholders.position)}</b> {T.letter.terms}</p>
            <p data-l="ar" dir="rtl" lang="ar">{T.letterAr.offer} <b>{placeholder(form.position.trim(), T.letterAr.placeholders.position)}</b> {T.letterAr.terms}</p>
            <table className="zrv-hr-paper__tbl">
              <thead>
                <tr>
                  <th scope="col" data-l="en">{T.letter.number}</th><th scope="col" data-l="en">{T.letter.description}</th><th scope="col" data-l="en">{T.letter.benefits}</th>
                  <th scope="col" dir="rtl" lang="ar" data-l="ar">{T.letterAr.benefits}</th><th scope="col" dir="rtl" lang="ar" data-l="ar">{T.letterAr.description}</th><th scope="col" dir="rtl" lang="ar" data-l="ar">{T.letterAr.number}</th>
                </tr>
              </thead>
              <tbody>
                {BENEFIT_KEYS.map((key, index) => (
                  <tr key={key} className={focusRow === key ? 'zrv-hr-is-hl' : undefined}>
                    <td className="zrv-hr-is-n" data-l="en">{index + 1}</td><td data-l="en">{T.benefits[key].en}</td>
                    <td data-l="en">{placeholder(englishDisplay(key, form.benefits[key].en, currency), COMMON_TEXT.dash)}</td>
                    <td dir="rtl" lang="ar" data-l="ar">{placeholder(form.benefits[key].ar, COMMON_TEXT.dash)}</td>
                    <td dir="rtl" lang="ar" data-l="ar">{T.benefits[key].ar}</td>
                    <td className="zrv-hr-is-n" dir="rtl" lang="ar" data-l="ar">{(index + 1).toLocaleString('ar-EG')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p data-l="en">{T.acceptEn}</p>
            <p data-l="ar" dir="rtl" lang="ar">{T.acceptAr}</p>
            {form.comments.trim() && <p><b>{T.letter.comments}</b> {form.comments}</p>}
          </article>
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
          <Orbit done={progress.done} total={progress.total} hint={doneSteps.every(Boolean) ? T.orbitReady : COMMON_TEXT.stillOpen(T.steps.filter((_, index) => !doneSteps[index]).map(([name]) => name))} />
        </>}
      >
        {step === 0 && <>
          <PanelHead n={1} {...T.heads[0]} />
          <p className="zrv-hr-sentence">
            <label htmlFor="of-position">{T.sentence.before}</label>
            <input {...fieldProps('of-position', { error: errors.position })} className="zrv-hr-sentence__pos" placeholder={T.placeholders.position}
              value={form.position} onChange={set('position')} size={Math.max(10, (form.position || T.placeholders.position).length + 1)} aria-required="true" maxLength={200} />
            {T.sentence.after}
          </p>
          {errors.position && <small className="zrv-auth-field-error" id="of-position-error">{errors.position}</small>}
          <div className="zrv-hr-grid zrv-hr-is-3 zrv-hr-mt">
            <HrField id="of-date" label={T.labels.date} required error={errors.offerDate}>
              <input {...fieldProps('of-date', { error: errors.offerDate })} type="date" className="ux-input zrv-hr-input" value={form.offerDate} onChange={set('offerDate')} aria-required="true" />
            </HrField>
            <HrField id="of-division" label={T.labels.division} required error={errors.division}>
              <select {...fieldProps('of-division', { error: errors.division })} className="ux-input zrv-hr-input" value={form.division} onChange={set('division')} aria-required="true">
                <option value="">Choose a business unit</option>
                {form.division && !lookups.businessUnits.includes(form.division) && <option value={form.division}>{form.division}</option>}
                {lookups.businessUnits.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </HrField>
            <HrField id="of-title" label={T.labels.salutation}>
              <select id="of-title" className="ux-input zrv-hr-input" value={form.salutation} onChange={(event) => chooseTitle(event.target.value)}>
                <option value="">Choose a title</option>
                {form.salutation && !lookups.titles.some((item) => item.meaning === form.salutation) && <option value={form.salutation}>{form.salutation}</option>}
                {lookups.titles.map((item) => <option key={item.meaning} value={item.meaning}>{item.meaning}</option>)}
              </select>
            </HrField>
            <HrField id="of-name" label={T.labels.nameEn} required error={errors.candidateNameEn}>
              <input {...fieldProps('of-name', { error: errors.candidateNameEn })} className="ux-input zrv-hr-input" value={form.candidateNameEn} list="of-candidate-options" onChange={(event) => candidateChanged(event.target.value)}
                placeholder={T.placeholders.nameEn} aria-required="true" maxLength={200} />
              <datalist id="of-candidate-options">{lookups.candidates.map((item) => <option key={item.intNo} value={item.candidateName} label={`${item.positionName} · ${item.intNo}`} />)}</datalist>
            </HrField>
            <HrField id="of-name-ar" label={T.labels.nameAr}>
              <input id="of-name-ar" className="ux-input zrv-hr-input" dir="rtl" lang="ar" value={form.candidateNameAr} onChange={set('candidateNameAr')} placeholder={T.placeholders.nameAr} maxLength={200} />
            </HrField>
          </div>
        </>}
        {step === 1 && <>
          <PanelHead n={2} {...T.heads[1]} />
          <div className="zrv-hr-benefits">{STEP_BENEFITS[1].map(benefit)}</div>
        </>}
        {step === 2 && <>
          <PanelHead n={3} {...T.heads[2]} />
          <div className="zrv-hr-benefits">{STEP_BENEFITS[2].map(benefit)}</div>
        </>}
        {step === 3 && <>
          <PanelHead n={4} {...T.heads[3]} />
          <div className="zrv-hr-grid zrv-hr-is-3 zrv-hr-mt">
            <HrField id="of-intno" label={T.labels.intNo} required error={errors.intNo}>
              <input {...fieldProps('of-intno', { error: errors.intNo })} className="ux-input zrv-hr-input" value={form.intNo} list="of-interview-options" onChange={set('intNo')} maxLength={100} aria-required="true" />
              <datalist id="of-interview-options">{lookups.candidates.map((item) => <option key={item.intNo} value={item.intNo}>{item.candidateName} · {item.positionName}</option>)}</datalist>
            </HrField>
            <HrField id="of-reqno" label={T.labels.reqNo}>
              <input id="of-reqno" className="ux-input zrv-hr-input" value={form.reqNo} onChange={set('reqNo')} maxLength={100} />
            </HrField>
            <HrField id="of-applicant" label={T.labels.applicant}>
              <input id="of-applicant" className="ux-input zrv-hr-input" value={form.applicant} onChange={set('applicant')} maxLength={200} />
            </HrField>
            <HrField id="of-com" label={T.labels.comments} wide>
              <textarea id="of-com" className="ux-textarea zrv-hr-input" value={form.comments} onChange={set('comments')} placeholder={T.placeholders.comments} maxLength={4000} />
            </HrField>
          </div>
        </>}
      </RecruitmentShell>

      {dialog === 'delete' && <ConfirmDialog title={T.deleteTitle} description={T.deleteBody} confirmLabel={T.deleteAction} pending={editor.pending}
        feedback={editor.feedback} onConfirm={deleteRecord} onClose={() => setDialog(null)} />}
      {dialog === 'new' && <NewFormDialog onConfirm={() => { setDialog(null); startNew() }} onClose={() => setDialog(null)} />}
      {dialog === 'report' && (
        <ReportDialog title={T.reportTitle} resourceKey="hr-offer-report" load={service.list} onClose={() => setDialog(null)}
          numberOf={(item) => item.offerId} statusOf={(item) => T.status[item.status]} pathOf={(item) => `${BASE}/${item.offerId}`}
          columns={[[T.reportColumns.position, (item) => item.position], [T.reportColumns.candidate, (item) => item.candidateNameEn]]} />
      )}
    </>
  )
}
