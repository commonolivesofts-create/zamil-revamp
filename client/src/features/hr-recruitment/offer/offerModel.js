// Employment Offer (form 1062): the nine bilingual benefit rows, Arabic
// auto-fill from English, the monthly package and the request body. Pure
// functions, testable in Node. The backend assigns the offer number and status.
import { OFFER_TEXT } from '../hrRecruitmentText.js'
import { arDate, enDate, isIsoDate, toAmount } from '../shared/hrFormat.js'
import { normalizeNotes, normalizeShortText, textLimitError } from '../shared/formValidation.js'

export const OFFER_STATUSES = Object.freeze(['INCOMPLETE', 'COMPLETE', 'ACCEPTED'])
// Kept for the unused demo adapter; the live backend has no issue action.
export const issuedStatus = (signatures) => (signatures?.applicant ? 'ACCEPTED' : 'ISSUED')
// [key, value type]; money rows make up the monthly package.
export const BENEFITS = Object.freeze([
  ['basic', 'money'], ['housing', 'money'], ['transport', 'money'],
  ['vacation', 'text'], ['ticket', 'text'], ['medical', 'text'], ['contract', 'text'],
  ['start', 'date'], ['probation', 'text'],
].map((row) => Object.freeze(row)))
export const BENEFIT_KEYS = Object.freeze(BENEFITS.map(([key]) => key))
export const PACKAGE_KEYS = Object.freeze(['basic', 'housing', 'transport'])
export const TERMS_KEYS = Object.freeze(['vacation', 'ticket', 'medical', 'contract', 'start', 'probation'])

export const OFFER_VALIDATION_FIELDS = Object.freeze(Object.fromEntries([
  ...[['offerDate', 'offerDate'], ['employeeName', 'candidateNameEn'], ['employeeNameAr', 'candidateNameAr'], ['position', 'position'], ['division', 'division'], ['to', 'salutation'], ['toArabic', 'salutationAr'], ['intNo', 'intNo'], ['reqNo', 'reqNo']].map(([api, key]) => [api, { key, step: 0, label: key }]),
  ['applicant', { key: 'applicant', step: 0, label: 'Applicant / signatory' }],
  ['line.comment', { key: 'comments', step: 0, label: 'Comments' }],
  ['basic', { key: 'basic', step: 1, label: 'Basic salary', fields: ['benefits.basic.en'] }],
  ...[['basic', 'basicSalary'], ['housing', 'housingAllowance'], ['transport', 'transportation'], ['vacation', 'annualVacation'], ['ticket', 'ticket'], ['medical', 'medical'], ['contract', 'contractPeriod'], ['start', 'approximateStartingDate'], ['probation', 'probationaryPeriod']].flatMap(([key, api]) => [
    [`line.${api}`, { key, step: 1, label: OFFER_TEXT.benefits[key].en, fields: [`benefits.${key}.en`] }],
    [`line.${api}Ar`, { key: `${key}Ar`, step: 1, label: `${OFFER_TEXT.benefits[key].en} (Arabic)`, fields: [`benefits.${key}.ar`] }],
  ]),
]))

export const benefitType = (key) => BENEFITS.find(([name]) => name === key)?.[1] ?? 'text'
export const isOfferLocked = (status) => status === 'ACCEPTED'

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

export function blankOffer(today) {
  const benefits = Object.fromEntries(BENEFIT_KEYS.map((key) => [key, { en: '', ar: '', linked: true }]))
  return {
    position: '', offerDate: today, division: '', salutation: '', salutationAr: '', candidateNameEn: '', candidateNameAr: '',
    intNo: '', reqNo: '', applicant: '', benefits, comments: '',
  }
}

// Candidate options come from the approved, passed assessment lookup.
export function offerCandidateFields(candidate) {
  return {
    candidateNameEn: candidate.candidateName,
    position: candidate.positionName,
    intNo: candidate.intNo,
    reqNo: candidate.requisitionNo,
  }
}

// Finish pending automatic translations before sending a snapshot to the API.
export async function completeOfferTranslations(form, converters) {
  const benefits = { ...form.benefits }
  await Promise.all(['basic', 'start'].map(async (key) => {
    const row = form.benefits[key]
    if (!row.linked || !row.en || row.ar) return
    try {
      const ar = key === 'basic'
        ? await converters.numberToArabic(Number(row.en.replaceAll(',', '')))
        : await converters.hijriDate(row.en)
      benefits[key] = { ...row, ar }
    } catch {
      // Arabic is optional and remains available for manual entry.
    }
  }))
  return { ...form, benefits }
}

export function offerFormFromRecord(record) {
  return {
    position: record.position, offerDate: record.offerDate ?? '', division: record.division,
    salutation: record.salutation, salutationAr: record.salutationAr,
    candidateNameEn: record.candidateNameEn, candidateNameAr: record.candidateNameAr,
    intNo: record.intNo, reqNo: record.reqNo, applicant: record.applicant,
    benefits: Object.fromEntries(BENEFIT_KEYS.map((key) => {
      const row = record.benefits[key]
      return [key, { en: row.en, ar: row.ar, linked: row.autoArabic }]
    })),
    comments: record.comments,
  }
}

export function offerPayload(form) {
  return {
    position: normalizeShortText(form.position), offerDate: form.offerDate || null, division: form.division,
    salutation: normalizeShortText(form.salutation), salutationAr: normalizeShortText(form.salutationAr),
    candidateNameEn: normalizeShortText(form.candidateNameEn), candidateNameAr: normalizeShortText(form.candidateNameAr),
    intNo: normalizeShortText(form.intNo), reqNo: normalizeShortText(form.reqNo), applicant: normalizeShortText(form.applicant),
    benefits: Object.fromEntries(BENEFIT_KEYS.map((key) => {
      const row = form.benefits[key]
      return [key, { en: normalizeShortText(row.en), ar: normalizeShortText(row.ar), autoArabic: row.linked }]
    })),
    comments: normalizeNotes(form.comments),
  }
}

// Validate the fields the API requires to save an offer.
export function validateOffer(form) {
  const text = OFFER_TEXT.errors
  const errors = {}
  if (!form.position.trim()) errors.position = text.position
  if (!form.candidateNameEn.trim()) errors.candidateNameEn = text.nameEn
  if (!form.offerDate) errors.offerDate = text.date
  if (!form.division) errors.division = text.division
  if (!form.intNo.trim()) errors.intNo = text.intNo
  if (!form.benefits.start.en) errors.start = text.start
  else if (!isIsoDate(form.benefits.start.en)) errors.start = 'Enter a valid starting date.'
  if (form.offerDate && !isIsoDate(form.offerDate)) errors.offerDate = 'Enter a valid offer date.'
  const basic = String(form.benefits.basic.en).trim()
  if (basic && !/^(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(basic)) errors.basic = 'Enter a valid basic salary of zero or more.'
  if (form.reqNo && !/^[0-9]{1,38}$/.test(String(form.reqNo).trim())) errors.reqNo = 'The linked requisition number must contain digits only.'
  const check = (key, value, limit, label, options) => {
    const message = textLimitError(value, limit, label, options)
    if (message) errors[key] = message
  }
  check('candidateNameEn', form.candidateNameEn, 1000, 'Candidate name')
  check('candidateNameAr', form.candidateNameAr, 1000, 'Arabic candidate name')
  check('position', form.position, 1000, 'Position')
  check('applicant', form.applicant, 500, 'Applicant')
  check('comments', form.comments, 500, 'Comments', { multiline: true })
  for (const [key, type] of BENEFITS) {
    if (type !== 'date' && key !== 'basic') check(key, form.benefits[key].en, 500, `${OFFER_TEXT.benefits[key].en}`)
    check(`${key}Ar`, form.benefits[key].ar, key === 'start' ? 100 : 500, `${OFFER_TEXT.benefits[key].en} (Arabic)`)
  }
  const benefitKeys = new Set(BENEFITS.flatMap(([key]) => [key, `${key}Ar`]))
  const firstStep = Object.keys(errors).some((key) => !benefitKeys.has(key)) ? 0 : Object.keys(errors).some((key) => benefitKeys.has(key)) ? 1 : -1
  return { errors, firstStep, valid: firstStep === -1 }
}

export function offerStepErrors(form) {
  const { errors } = validateOffer(form)
  const benefitKeys = new Set(BENEFITS.flatMap(([key]) => [key, `${key}Ar`]))
  return [Object.fromEntries(Object.entries(errors).filter(([key]) => !benefitKeys.has(key))),
    Object.fromEntries(Object.entries(errors).filter(([key]) => benefitKeys.has(key))), {}]
}

export function offerDoneSteps(form) {
  const errors = offerStepErrors(form)
  return [!Object.keys(errors[0]).length, !Object.keys(errors[1]).length, validateOffer(form).valid]
}

export function offerProgress(form) {
  const rows = BENEFIT_KEYS.filter((key) => String(form.benefits[key].en).trim()).length
  const header = [form.position, form.candidateNameEn, form.offerDate, form.division, form.intNo].filter((value) => String(value ?? '').trim()).length
  return { done: rows + header, total: BENEFIT_KEYS.length + 5 }
}
