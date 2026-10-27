// Employment Offer (form 1062): the nine bilingual benefit rows, Arabic
// auto-fill from English, the monthly package and the request body. Pure
// functions, testable in Node. The backend assigns the offer number and status.
import { OFFER_TEXT } from '../hrRecruitmentText.js'
import { arDate, enDate, toAmount } from '../shared/hrFormat.js'

export const OFFER_STATUSES = Object.freeze(['DRAFT', 'ISSUED', 'ACCEPTED'])
export const SALUTATIONS = Object.freeze(['MR', 'MS'])
export const SIGNATURE_ROLES = Object.freeze(['hrManager', 'generalManager', 'applicant'])
// [key, value type]; money rows make up the monthly package.
export const BENEFITS = Object.freeze([
  ['basic', 'money'], ['housing', 'money'], ['transport', 'money'],
  ['vacation', 'text'], ['ticket', 'text'], ['medical', 'text'], ['contract', 'text'],
  ['start', 'date'], ['probation', 'text'],
].map((row) => Object.freeze(row)))
export const BENEFIT_KEYS = Object.freeze(BENEFITS.map(([key]) => key))
export const PACKAGE_KEYS = Object.freeze(['basic', 'housing', 'transport'])
export const STEP_BENEFITS = Object.freeze({ 1: PACKAGE_KEYS, 2: Object.freeze(['vacation', 'ticket', 'medical', 'contract', 'start', 'probation']) })

export const benefitType = (key) => BENEFITS.find(([name]) => name === key)?.[1] ?? 'text'
// An issued or accepted offer is final.
export const isOfferLocked = (status) => status === 'ISSUED' || status === 'ACCEPTED'
// Issuing records acceptance when the applicant has already signed.
export const issuedStatus = (signatures) => (signatures?.applicant ? 'ACCEPTED' : 'ISSUED')

// Quick picks for a row: the fixed pairs plus the configured probation default.
export function benefitPicks(key, { probation } = {}) {
  const picks = OFFER_TEXT.benefits[key]?.picks ?? []
  return key === 'probation' && probation ? [[probation.en, probation.ar], ...picks] : picks
}

// The Arabic value for an English value: amounts become "<n> ريال سعودي شهرياً",
// dates the Arabic calendar date, text a matching quick pick (else empty).
export function autoArabic(key, en, { currency = 'SAR', probation } = {}) {
  if (!en) return ''
  const type = benefitType(key)
  if (type === 'money') {
    const amount = toAmount(en)
    return amount === null ? '' : `${amount.toLocaleString('ar-EG')} ${OFFER_TEXT.currencyAr[currency] ?? currency} ${OFFER_TEXT.monthlyAr}`
  }
  if (type === 'date') return arDate(en)
  const pair = benefitPicks(key, { probation }).find(([english]) => english === en)
  return pair ? pair[1] : ''
}

// How an English value appears on the letter.
export function englishDisplay(key, en, currency = 'SAR') {
  if (!en) return ''
  const type = benefitType(key)
  if (type === 'money') {
    const amount = toAmount(en)
    return amount === null ? en : `${currency} ${amount.toLocaleString('en-US')} ${OFFER_TEXT.monthlyEn}`
  }
  if (type === 'date') return enDate(en)
  return en
}

// Monthly package = basic + housing + transport; yearly = monthly × 12.
// A non-numeric value (e.g. "Company accommodation") counts as 0.
export function monthlyPackage(benefits) {
  const parts = PACKAGE_KEYS.map((key) => toAmount(benefits[key]?.en) || 0)
  const monthly = parts.reduce((total, part) => total + part, 0)
  return { parts, monthly, yearly: monthly * 12 }
}

// Ring segments of the package chart: each part's arc length and start
// offset on a circle of `circumference`, with a small gap between parts.
export function packageArcs(parts, circumference, gap = 3) {
  const total = parts.reduce((sum, part) => sum + part, 0)
  let start = 0
  return parts.map((part) => {
    const length = total ? (part / total) * circumference : 0
    const arc = { length: Math.max(0, length - (total ? gap : 0)), offset: -start }
    start += length
    return arc
  })
}

export function blankOffer(today, { reportFormat = '', probation = null } = {}) {
  const benefits = Object.fromEntries(BENEFIT_KEYS.map((key) => [key, { en: '', ar: '', linked: true }]))
  if (probation) benefits.probation = { en: probation.en, ar: probation.ar, linked: true }
  return {
    position: '', offerDate: today, reportFormat, salutation: 'MR', candidateNameEn: '', candidateNameAr: '',
    benefits, comments: '', signatures: { hrManager: null, generalManager: null, applicant: null },
  }
}

export function offerFormFromRecord(record) {
  return {
    position: record.position, offerDate: record.offerDate ?? '', reportFormat: record.reportFormat, salutation: record.salutation,
    candidateNameEn: record.candidateNameEn, candidateNameAr: record.candidateNameAr,
    benefits: Object.fromEntries(BENEFIT_KEYS.map((key) => {
      const row = record.benefits[key]
      return [key, { en: row.en, ar: row.ar, linked: row.autoArabic }]
    })),
    comments: record.comments, signatures: { ...record.signatures },
  }
}

export function offerPayload(form) {
  return {
    position: form.position.trim(), offerDate: form.offerDate || null, reportFormat: form.reportFormat.trim(),
    salutation: SALUTATIONS.includes(form.salutation) ? form.salutation : 'MR',
    candidateNameEn: form.candidateNameEn.trim(), candidateNameAr: form.candidateNameAr.trim(),
    benefits: Object.fromEntries(BENEFIT_KEYS.map((key) => {
      const row = form.benefits[key]
      return [key, { en: String(row.en).trim(), ar: row.ar.trim(), autoArabic: row.linked }]
    })),
    comments: form.comments.trim(),
    signatures: Object.fromEntries(SIGNATURE_ROLES.map((role) => [role, form.signatures[role] ?? null])),
  }
}

// Required to issue: position, candidate name (English), basic salary and the
// approximate starting date. Returns the errors and the step to open first.
export function validateOffer(form) {
  const text = OFFER_TEXT.errors
  const errors = {}
  if (!form.position.trim()) errors.position = text.position
  if (!form.candidateNameEn.trim()) errors.candidateNameEn = text.nameEn
  if (!String(form.benefits.basic.en).trim()) errors.basic = text.basic
  if (!form.benefits.start.en) errors.start = text.start
  const firstStep = errors.position || errors.candidateNameEn ? 0 : errors.basic ? 1 : errors.start ? 2 : -1
  return { errors, firstStep, valid: firstStep === -1 }
}

export function offerDoneSteps(form) {
  const filled = (key) => Boolean(String(form.benefits[key].en).trim())
  return [
    Boolean(form.position.trim() && form.candidateNameEn.trim()),
    STEP_BENEFITS[1].every(filled),
    STEP_BENEFITS[2].every(filled),
    Boolean(form.signatures.hrManager && form.signatures.generalManager),
  ]
}

export function offerProgress(form) {
  const rows = BENEFIT_KEYS.filter((key) => String(form.benefits[key].en).trim()).length
  return { done: rows + (form.position.trim() ? 1 : 0) + (form.candidateNameEn.trim() ? 1 : 0), total: BENEFIT_KEYS.length + 2 }
}
