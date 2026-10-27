// Personnel Requisition (form 1060): form state, required-answer checks,
// lead time, approval route and the request body. Pure functions, testable in
// Node. The backend validates again and assigns number, status and requester.
import { REQUISITION_TEXT } from '../hrRecruitmentText.js'
import { daysBetween } from '../shared/hrFormat.js'

export const REQUISITION_STATUSES = Object.freeze(['DRAFT', 'SUBMITTED'])
export const REASONS = Object.freeze(['REPLACEMENT', 'ADDITION'])
export const URGENT_LEAD_DAYS = 30

export const isRequisitionLocked = (status) => status === 'SUBMITTED'

export function blankRequisition(today) {
  return {
    jobTitle: '', departmentCode: '', neededDate: today, remark: '',
    reason: '', replacementFor: '', additionReason: '', budgeted: '', budgetedSalary: '',
    educationCodes: [], gccExperienceCode: '', workExperienceCode: '', skills: [], otherRequirements: '',
    attachments: [],
  }
}

const yesNo = (value) => (value === true ? 'yes' : value === false ? 'no' : '')

export function requisitionFormFromRecord(record) {
  return {
    jobTitle: record.jobTitle, departmentCode: record.departmentCode ?? '', neededDate: record.neededDate ?? '', remark: record.remark,
    reason: record.reason ?? '', replacementFor: record.replacementFor, additionReason: record.additionReason,
    budgeted: yesNo(record.budgeted), budgetedSalary: record.budgetedSalary === null ? '' : String(record.budgetedSalary),
    educationCodes: [...record.educationCodes], gccExperienceCode: record.gccExperienceCode ?? '',
    workExperienceCode: record.workExperienceCode ?? '', skills: [...record.skills], otherRequirements: record.otherRequirements,
    attachments: record.attachments.map((file) => ({ ...file })),
  }
}

const amountOrNull = (value) => {
  const text = String(value ?? '').trim()
  if (!text) return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

// Request body for saveDraft/submit. Only the answer that applies to the
// chosen reason, and a budgeted salary only for a budgeted position, are sent.
// Attachment metadata is sent only when `attachments` is supported (demo).
export function requisitionPayload(form, { attachments = false } = {}) {
  const reason = REASONS.includes(form.reason) ? form.reason : null
  const budgeted = form.budgeted === 'yes' ? true : form.budgeted === 'no' ? false : null
  return {
    jobTitle: form.jobTitle.trim(),
    departmentCode: form.departmentCode || null,
    neededDate: form.neededDate || null,
    remark: form.remark.trim(),
    reason,
    replacementFor: reason === 'REPLACEMENT' ? form.replacementFor.trim() : '',
    additionReason: reason === 'ADDITION' ? form.additionReason.trim() : '',
    budgeted,
    budgetedSalary: budgeted === true ? amountOrNull(form.budgetedSalary) : null,
    educationCodes: [...form.educationCodes],
    gccExperienceCode: form.gccExperienceCode || null,
    workExperienceCode: form.workExperienceCode || null,
    skills: [...form.skills],
    otherRequirements: form.otherRequirements.trim(),
    ...(attachments && { attachments: form.attachments.map(({ fileName, sizeBytes }) => ({ fileName, sizeBytes })) }),
  }
}

// Every required answer: { step, key, label, ok }. "Replacement for" or
// "Reason for addition" follows the chosen reason; the budgeted salary is
// required only when the position is budgeted.
export function requisitionChecks(form) {
  const label = REQUISITION_TEXT.checks
  const addition = form.reason === 'ADDITION'
  const checks = [
    { step: 0, key: 'jobTitle', ok: Boolean(form.jobTitle.trim()) },
    { step: 0, key: 'departmentCode', label: label.department, ok: Boolean(form.departmentCode) },
    { step: 0, key: 'neededDate', ok: Boolean(form.neededDate) },
    { step: 1, key: 'reason', ok: REASONS.includes(form.reason) },
    addition
      ? { step: 1, key: 'additionReason', ok: Boolean(form.additionReason.trim()) }
      : { step: 1, key: 'replacementFor', ok: Boolean(form.replacementFor.trim()) },
    { step: 1, key: 'budgeted', ok: form.budgeted === 'yes' || form.budgeted === 'no' },
    ...(form.budgeted === 'yes' ? [{ step: 1, key: 'budgetedSalary', ok: Boolean(String(form.budgetedSalary).trim()) }] : []),
    { step: 2, key: 'educationCodes', label: label.education, ok: form.educationCodes.length > 0 },
    { step: 2, key: 'gccExperienceCode', label: label.gccExperience, ok: Boolean(form.gccExperienceCode) },
    { step: 2, key: 'workExperienceCode', label: label.workExperience, ok: Boolean(form.workExperienceCode) },
    { step: 2, key: 'skills', ok: form.skills.length > 0 },
  ]
  return checks.map((check) => ({ ...check, label: check.label ?? label[check.key] }))
}

// Totals and the step to open when something is missing. Step 4 (review) has
// no required answer; it counts as done once a job description is attached.
export function requisitionProgress(form, steps = 4) {
  const checks = requisitionChecks(form)
  const missing = checks.filter((check) => !check.ok)
  const doneSteps = Array.from({ length: steps }, (_, step) => {
    const own = checks.filter((check) => check.step === step)
    return own.length ? own.every((check) => check.ok) : form.attachments.length > 0
  })
  return {
    checks, missing, doneSteps,
    done: checks.length - missing.length,
    total: checks.length,
    firstStep: missing.length ? Math.min(...missing.map((check) => check.step)) : -1,
  }
}

// Lead time until the needed date: past, today and under 30 days are warnings.
export function leadTime(today, neededDate) {
  const days = daysBetween(today, neededDate)
  if (days === null) return null
  const text = REQUISITION_TEXT.lead
  if (days < 0) return { tone: 'warn', days, text: text.past }
  if (days === 0) return { tone: 'warn', days, text: text.today }
  if (days < URGENT_LEAD_DAYS) return { tone: 'warn', days, text: text.urgent(days) }
  return { tone: '', days, text: text.normal(days) }
}

// The approval route for the budget answer: a position that is not budgeted
// gets the extra (Finance) step before the final approval.
export function approvalRoute(route, budgeted) {
  if (!route) return []
  const steps = route.steps.map((step) => ({ ...step, added: false }))
  if (budgeted !== 'no' || !route.unbudgetedStep || !steps.length) return steps
  return [...steps.slice(0, -1), { ...route.unbudgetedStep, added: true }, steps[steps.length - 1]]
}

// The lowest selected education level (the minimum the role accepts).
export function minimumEducation(codes, levels) {
  const selected = levels.filter((level) => codes.includes(level.code)).sort((a, b) => a.level - b.level)
  return selected.length ? { name: selected[0].name, more: selected.length - 1 } : null
}
