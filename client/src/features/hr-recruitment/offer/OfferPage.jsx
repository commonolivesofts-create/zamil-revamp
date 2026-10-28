import { useState } from 'react'
import { useNavigate } from 'react-router'
import OrvexaIcon from '@/components/icons/OrvexaIcon.jsx'
import { ConfirmDialog } from '@/features/security-administration/components/AdminUi.jsx'
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
  BENEFIT_KEYS, SALUTATIONS, STEP_BENEFITS, autoArabic, benefitPicks, benefitType, blankOffer, englishDisplay, isOfferLocked, monthlyPackage,
  offerDoneSteps, offerFormFromRecord, offerPayload, offerProgress, packageArcs, validateOffer,
} from './offerModel.js'

const BASE = '/hr/recruitment/offer'
const service = hrRecruitmentServices.offers
const BENEFIT_ICONS = Object.freeze({
  basic: 'wallet', housing: 'house', transport: 'layers', vacation: 'clock', ticket: 'plane', medical: 'heart-pulse',
  contract: 'file-text', start: 'calendar-days', probation: 'users',
})
const SIGNERS = Object.freeze([['hrManager', 'HR_MANAGER'], ['generalManager', 'GENERAL_MANAGER'], ['applicant', null]])
// Decorative pen strokes for a recorded signature.
const INK = Object.freeze([
  'M6 30 C 18 6, 26 40, 36 20 S 52 8, 58 26 S 76 36, 84 14 S 104 30, 118 22 S 140 10, 150 28',
  'M8 24 C 20 40, 30 4, 44 22 S 60 36, 70 16 S 92 8, 100 28 C 108 40, 126 6, 150 20',
  'M6 22 C 14 4, 30 4, 32 24 S 46 40, 60 18 S 84 2, 92 26 S 118 34, 128 14 S 146 22, 152 26',
])
const PACKAGE_TONES = Object.freeze(['zrv-hr-is-basic', 'zrv-hr-is-housing', 'zrv-hr-is-transport'])
const PACKAGE_CIRCUMFERENCE = 289.03 // 2π × 46

export default function OfferPage() {
  return (
    <RecruitmentLoader current="offer" title={T.title} subtitle={T.subtitle} param="offerId" load={service.getById}>
      {({ lookups, record, editorKey }) => <OfferEditor key={editorKey} lookups={lookups} record={record} />}
    </RecruitmentLoader>
  )
}

function Ink({ index }) {
  return <svg viewBox="0 0 160 44" aria-hidden="true"><path className="zrv-hr-ink" d={INK[index]} /></svg>
}

function OfferEditor({ lookups, record: savedRecord }) {
  const navigate = useNavigate()
  const today = businessToday()
  const settings = lookups.offer
  const currency = savedRecord?.currency ?? settings.currency
  const editor = useRecruitmentForm({
    basePath: BASE, idKey: 'offerId', record: savedRecord,
    initialForm: savedRecord ? offerFormFromRecord(savedRecord) : blankOffer(today, { reportFormat: settings.reportFormat, probation: settings.probation }),
  })
  const { form, record, step, setStep, patch } = editor
  const [errors, setErrors] = useState({})
  const [focusRow, setFocusRow] = useState(null)
  const [language, setLanguage] = useState('bi')
  const [dialog, setDialog] = useState(null)
  const locked = isOfferLocked(record?.status)
  const status = record?.status ?? 'DRAFT'
  const { parts, monthly, yearly } = monthlyPackage(form.benefits)
  const doneSteps = offerDoneSteps(form)
  const progress = offerProgress(form)
  const applicantName = form.candidateNameEn.trim() || T.letter.applicant
  const signerName = (role) => settings.signatories.find((item) => item.role === role)
  const auto = (key, en) => autoArabic(key, en, { currency, probation: settings.probation })

  const set = (key) => (eventOrValue) => {
    editor.set(key)(eventOrValue)
    setErrors((current) => ({ ...current, [key]: undefined }))
  }
  const setRow = (key, changes) => {
    patch((current) => ({ benefits: { ...current.benefits, [key]: { ...current.benefits[key], ...changes } } }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }
  const sign = (role) => patch((current) => ({ signatures: { ...current.signatures, [role]: current.signatures[role] ? null : new Date().toISOString() } }))

  const saveRecord = async ({ saved }) => {
    const result = await service.saveDraft(editor.recordId, offerPayload(form))
    saved(result)
    return result
  }
  const save = () => editor.perform(saveRecord, { success: (result) => T.saved(result.offerNumber) })
  const requestIssue = () => {
    const result = validateOffer(form)
    setErrors(result.errors)
    if (!result.valid) {
      const missing = Object.keys(result.errors).map((key) => T.checks[key === 'candidateNameEn' ? 'nameEn' : key])
      editor.reject(result.firstStep, `${COMMON_TEXT.stillNeeded} ${missing.join(', ')}`)
      return
    }
    setDialog('issue')
  }
  const issue = () => editor.perform(async (context) => {
    const draft = await saveRecord(context)
    const result = await service.issue(draft.offerId)
    context.saved(result)
    return result
  }, { success: (result) => T.issued(result.offerNumber) }).then((outcome) => {
    if (outcome.status === 'success') setDialog(null)
  })
  const startNew = () => navigate(BASE)

  const benefit = (key, index) => {
    const text = T.benefits[key]
    const type = benefitType(key)
    const row = form.benefits[key]
    const error = errors[key]
    const enId = `of-${key}-en`
    const picks = benefitPicks(key, { probation: settings.probation })
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
              type={type === 'date' ? 'date' : 'text'} inputMode={type === 'money' ? 'decimal' : undefined} maxLength={300}
              aria-required={key === 'basic' || key === 'start' ? true : undefined}
              placeholder={type === 'money' ? T.placeholders.money : type === 'date' ? undefined : T.placeholders.text} value={row.en}
              onChange={(event) => { const value = event.target.value; setRow(key, row.linked ? { en: value, ar: auto(key, value) } : { en: value }) }} />
            {type === 'money' && <span className="zrv-hr-pair__suffix">{T.perMonth(currency)}</span>}
          </div>
          <div className="zrv-hr-pair__in" dir="rtl">
            <label className="zrv-hr-sr" htmlFor={`of-${key}-ar`}>{T.labels.arabic(text.en)}</label>
            <input id={`of-${key}-ar`} className="ux-input zrv-hr-input" dir="rtl" lang="ar" placeholder={T.placeholders.arabic} value={row.ar} maxLength={300}
              onChange={(event) => setRow(key, { ar: event.target.value, linked: false })} />
            <button type="button" className={`zrv-hr-auto${row.linked ? '' : ' zrv-hr-is-off'}`} aria-pressed={row.linked} title={T.auto.title} aria-label={`${T.auto.title}: ${text.en}`}
              onClick={() => setRow(key, row.linked ? { linked: false } : { linked: true, ar: auto(key, row.en) || row.ar })}>{row.linked ? T.auto.on : T.auto.off}</button>
          </div>
        </div>
        {error && <small className="zrv-auth-field-error" id={`${enId}-error`}>{error}</small>}
        {picks.length > 0 && key !== 'probation' && (
          <div className="zrv-hr-picks">{picks.map(([en, ar]) => <button key={en} type="button" onClick={() => setRow(key, { en, ar, linked: true })}>{en}</button>)}</div>
        )}
      </article>
    )
  }

  const placeholder = (value, fallback) => (value ? value : <span className="zrv-hr-paper__ph">{fallback}</span>)
  const salutationAr = form.salutation === 'MS' ? T.letterAr.ms : T.letterAr.mr

  const tools = [
    { icon: 'save', label: COMMON_TEXT.save, onClick: save, disabled: locked || editor.pending },
    { icon: 'printer', label: COMMON_TEXT.print, onClick: () => window.print() },
    { icon: 'chart-column', label: COMMON_TEXT.report, onClick: () => setDialog('report') },
    { icon: 'file-plus', label: COMMON_TEXT.requestForm, onClick: () => (editor.dirty ? setDialog('new') : startNew()) },
    { icon: 'house', label: COMMON_TEXT.home, onClick: () => navigate('/dashboard') },
  ]

  return (
    <>
      <RecruitmentShell
        current="offer" title={T.title} subtitle={T.subtitle}
        flowStatus={record ? [record.offerNumber, T.status[record.status]].filter(Boolean).join(' · ') : null}
        tools={tools} primary={{ label: T.primary, icon: 'send', onClick: requestIssue }}
        feedback={editor.feedback} onDismissFeedback={editor.dismiss} locked={locked} pending={editor.pending} focusError={editor.focusError}
        ticket={<Ticket avatar={initials(form.candidateNameEn)} code={T.code} items={[
          { k: T.ticket.number, v: record?.offerNumber || T.ticket.numberPending },
          { k: T.ticket.candidate, v: form.candidateNameEn || T.ticket.newCandidate, big: true },
          { k: T.ticket.position, v: form.position || COMMON_TEXT.dash },
          { k: T.ticket.package, v: monthly ? `${currency} ${formatAmount(monthly)}` : COMMON_TEXT.dash },
          { k: T.ticket.status, v: <Pill tone={status === 'DRAFT' ? 'warn' : 'ok'}>{T.status[status]}</Pill> },
        ]} />}
        steps={T.steps} step={step} onStep={setStep} doneSteps={doneSteps} finalLabel={T.final} onFinal={requestIssue}
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
              <div className="zrv-hr-paper__brand">{T.letter.brand}<small>{T.letter.kind}{record?.offerNumber ? ` · ${record.offerNumber}` : ''}</small></div>
              <h4><span data-l="en">{T.letter.title}</span><span data-l="ar" dir="rtl" lang="ar">{T.letterAr.title}</span></h4>
            </div>
            <p data-l="en">{T.letter.date} {placeholder(enDate(form.offerDate), T.letter.placeholders.date)} · {T.letter.format} {placeholder(form.reportFormat, COMMON_TEXT.dash)}</p>
            <p data-l="ar" dir="rtl" lang="ar">{T.letterAr.date} {placeholder(arDate(form.offerDate), T.letterAr.placeholders.date)}</p>
            <p data-l="en">{T.letter.to} {T.salutations[form.salutation]} {placeholder(form.candidateNameEn.trim(), T.letter.placeholders.name)}</p>
            <p data-l="ar" dir="rtl" lang="ar">{T.letterAr.to} {salutationAr} {placeholder(form.candidateNameAr.trim(), T.letterAr.placeholders.name)}</p>
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
            <div className="zrv-hr-paper__sigs">
              {SIGNERS.map(([role, signatory], index) => {
                const person = signatory ? signerName(signatory) : null
                return (
                  <div key={role}>
                    <div className="zrv-hr-paper__line">{form.signatures[role] && <Ink index={index} />}</div>
                    <b>{person ? person.name : applicantName}</b>{person ? person.title : T.letter.applicant}
                  </div>
                )
              })}
            </div>
            {(status === 'ISSUED' || status === 'ACCEPTED') && <span className="zrv-hr-paper__stamp">{T.status[status].toUpperCase()}</span>}
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
            <HrField id="of-date" label={T.labels.date}>
              <input id="of-date" type="date" className="ux-input zrv-hr-input" value={form.offerDate} onChange={set('offerDate')} />
            </HrField>
            <HrField id="of-fmt" label={T.labels.reportFormat}>
              <input id="of-fmt" className="ux-input zrv-hr-input" value={form.reportFormat} onChange={set('reportFormat')} maxLength={60} />
            </HrField>
            <div className="zrv-hr-field">
              <span className="zrv-hr-label" id="of-sal-label">{T.labels.salutation}</span>
              <div className="zrv-hr-seg zrv-hr-is-salutation" role="group" aria-labelledby="of-sal-label" style={{ '--li': form.salutation === 'MS' ? 1 : 0 }}>
                <span className="zrv-hr-seg__pill" aria-hidden="true" />
                {SALUTATIONS.map((value) => <button key={value} type="button" aria-pressed={form.salutation === value} onClick={() => set('salutation')(value)}>{T.salutations[value]}</button>)}
              </div>
            </div>
            <HrField id="of-name" label={T.labels.nameEn} required error={errors.candidateNameEn}>
              <input {...fieldProps('of-name', { error: errors.candidateNameEn })} className="ux-input zrv-hr-input" value={form.candidateNameEn} onChange={set('candidateNameEn')}
                placeholder={T.placeholders.nameEn} aria-required="true" maxLength={200} />
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
          <div className="zrv-hr-accept"><p>{T.acceptEn}</p><p dir="rtl" lang="ar">{T.acceptAr}</p></div>
          <div className="zrv-hr-grid zrv-hr-mt">
            <HrField id="of-com" label={T.labels.comments} wide>
              <textarea id="of-com" className="ux-textarea zrv-hr-input" value={form.comments} onChange={set('comments')} placeholder={T.placeholders.comments} />
            </HrField>
          </div>
          <div className="zrv-hr-signs zrv-hr-mt">
            {SIGNERS.map(([role, signatory], index) => {
              const person = signatory ? signerName(signatory) : null
              const signed = Boolean(form.signatures[role])
              return (
                <div key={role} className={`zrv-hr-sign${signed ? ' zrv-hr-is-signed' : ''}`}>
                  <div className="zrv-hr-sign__pad">{signed ? <Ink index={index} /> : T.sign.notSigned}</div>
                  <b>{person ? person.name : applicantName}</b><small>{person ? person.title : T.letter.applicant}</small>
                  <button type="button" className="btn-secondary zrv-hr-btn" aria-pressed={signed} onClick={() => sign(role)}>
                    <OrvexaIcon name={signed ? 'x' : 'pen-line'} size={15} /> {signed ? T.sign.remove : T.sign.sign}
                  </button>
                </div>
              )
            })}
          </div>
        </>}
      </RecruitmentShell>

      {dialog === 'issue' && (
        <ConfirmDialog title={T.issueTitle} confirmLabel={T.issueConfirm} pending={editor.pending} feedback={editor.feedback}
          onConfirm={issue} onClose={() => setDialog(null)}>
          <p className="zrv-admin-confirm">
            <b>{form.position}</b> {T.issueBody.for} {T.salutations[form.salutation]} {form.candidateNameEn}<br />
            {T.issueBody.package} {currency} {formatAmount(monthly)}<br />
            {T.issueBody.starting} {enDate(form.benefits.start.en)}
          </p>
        </ConfirmDialog>
      )}
      {dialog === 'new' && <NewFormDialog onConfirm={() => { setDialog(null); startNew() }} onClose={() => setDialog(null)} />}
      {dialog === 'report' && (
        <ReportDialog title={T.reportTitle} resourceKey="hr-offer-report" load={service.list} onClose={() => setDialog(null)}
          numberOf={(item) => item.offerNumber} statusOf={(item) => T.status[item.status]} pathOf={(item) => `${BASE}/${item.offerId}`}
          columns={[[T.reportColumns.position, (item) => item.position], [T.reportColumns.candidate, (item) => item.candidateNameEn]]} />
      )}
    </>
  )
}
