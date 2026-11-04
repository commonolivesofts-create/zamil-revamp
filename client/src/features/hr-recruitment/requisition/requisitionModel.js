// Personal Requisition Form 1060. Field names and values here are translated
// to the existing /hr/requisitions API by hrRecruitmentService.js.
import { REQUISITION_TEXT } from '../hrRecruitmentText.js'
import { daysBetween } from '../shared/hrFormat.js'

export const REQUISITION_STATUSES = Object.freeze(['Draft', 'Inprocess', 'Approved', 'Rejected'])
export const REASONS = Object.freeze(['REPLACEMENT', 'ADDITION'])
export const EDUCATION_FIELDS = Object.freeze([
  ['highSchool', 'High school'], ['diploma', 'Diploma'], ['higherDiploma', 'Higher diploma'],
  ['degree', 'Degree'], ['masterDegree', "Master's degree"],
])
export const EXPERIENCE_BANDS = Object.freeze(['0 - 2', '2 - 5', '5 - 10', '> 10'])
// Connect server validation paths to the form control and its step.
export const REQUISITION_VALIDATION_FIELDS = Object.freeze(Object.fromEntries([
  ['jobId', 'jobTitle', 0, 'Job title'], ['jobName', 'jobTitle', 0, 'Job title'],
  ['deptId', 'departmentId', 0, 'Department'], ['deptName', 'departmentId', 0, 'Department'],
  ['dateNeeded', 'neededDate', 0, 'Needed date'], ['requestDate', 'requestDate', 0, 'Request date'],
  ['remark', 'remark', 0, 'Remark'], ['reasonOfReq', 'reason', 1, 'Reason'],
  ['replacementFor', 'replacementFor', 1, 'Replacement for'], ['reason', 'additionReason', 1, 'Reason for addition'],
  ['budgeted', 'budgeted', 1, 'Budget answer'], ['budgetedSal', 'budgetedSalary', 1, 'Budgeted salary'],
  ['totalPackage', 'totalPackage', 1, 'Basic salary'],
  ...EDUCATION_FIELDS.map(([key]) => [key, 'educationCodes', 2, 'Education']),
  ['gccExp', 'gccExp', 2, 'GCC experience'], ['workExp', 'workExp', 2, 'Total work experience'],
  ['skills', 'skills', 2, 'Skills and knowledge'], ['other', 'otherRequirements', 2, 'Other requirements'],
].map(([apiField, key, step, label]) => [apiField, { key, step, label,
  ...(key === 'educationCodes' ? { fields: EDUCATION_FIELDS.map(([field]) => field) } : {}),
}])))
export const isRequisitionLocked = (status) => status === 'Inprocess' || status === 'Approved'

export function blankRequisition(today = '') {
  return {
    requesterName: '', requestDate: today, jobId: '', jobTitle: '', departmentId: '', departmentName: '', neededDate: today, remark: '',
    reason: '', replacementFor: '', additionReason: '', budgeted: '', budgetedSalary: '',
    highSchool: '', diploma: '', higherDiploma: '', degree: '', masterDegree: '',
    gccExp: '', workExp: '', skills: '', otherRequirements: '', totalPackage: '', attachments: [],
  }
}

const yesNo = (value) => (value === 'Y' ? 'yes' : value === 'N' ? 'no' : '')

export function requisitionFormFromRecord(record, today = '') {
  return {
    requesterName: record.requesterName ?? '', requestDate: record.requestDate ?? '',
    jobId: record.jobId ?? '', jobTitle: record.jobTitle, departmentId: record.departmentId ?? '',
    departmentName: record.departmentName, neededDate: record.neededDate || today, remark: record.remark,
    reason: record.reason, replacementFor: record.replacementFor,
    additionReason: record.additionReason, budgeted: yesNo(record.budgeted === true ? 'Y' : record.budgeted === false ? 'N' : ''),
    budgetedSalary: record.budgetedSalary, highSchool: yesNo(record.highSchool === true ? 'Y' : record.highSchool === false ? 'N' : ''),
    diploma: yesNo(record.diploma === true ? 'Y' : record.diploma === false ? 'N' : ''),
    higherDiploma: yesNo(record.higherDiploma === true ? 'Y' : record.higherDiploma === false ? 'N' : ''),
    degree: yesNo(record.degree === true ? 'Y' : record.degree === false ? 'N' : ''),
    masterDegree: yesNo(record.masterDegree === true ? 'Y' : record.masterDegree === false ? 'N' : ''),
    gccExp: record.gccExp ?? '', workExp: record.workExp ?? '', skills: record.skills,
    otherRequirements: record.otherRequirements, totalPackage: record.totalPackage == null ? '' : String(record.totalPackage),
    attachments: record.attachments.map((file) => ({ ...file })),
  }
}

export function requisitionPayload(form) {
  const reason = REASONS.includes(form.reason) ? form.reason : ''
  return {
    jobId: form.jobId, jobName: form.jobTitle.trim(), deptId: form.departmentId,
    deptName: form.departmentName.trim(), dateNeeded: form.neededDate,
    reasonOfReq: reason === 'REPLACEMENT' ? 'Replacement' : reason === 'ADDITION' ? 'Addition' : '',
    replacementFor: reason === 'REPLACEMENT' ? form.replacementFor.trim() : '',
    reason: reason === 'ADDITION' ? form.additionReason.trim() : '',
    budgeted: form.budgeted === 'yes' ? 'Y' : form.budgeted === 'no' ? 'N' : '',
    budgetedSal: form.budgeted === 'yes' ? form.budgetedSalary : '',
    highSchool: form.highSchool === 'yes' ? 'Y' : form.highSchool === 'no' ? 'N' : '',
    diploma: form.diploma === 'yes' ? 'Y' : form.diploma === 'no' ? 'N' : '',
    higherDiploma: form.higherDiploma === 'yes' ? 'Y' : form.higherDiploma === 'no' ? 'N' : '',
    degree: form.degree === 'yes' ? 'Y' : form.degree === 'no' ? 'N' : '',
    masterDegree: form.masterDegree === 'yes' ? 'Y' : form.masterDegree === 'no' ? 'N' : '',
    gccExp: form.gccExp, workExp: form.workExp, skills: form.skills.trim(),
    other: form.otherRequirements.trim(), remark: form.remark.trim(), totalPackage: form.totalPackage,
  }
}

export function requisitionChecks(form) {
  const label = REQUISITION_TEXT.checks
  const addition = form.reason === 'ADDITION'
  const checks = [
    { step: 0, key: 'jobTitle', ok: Boolean(form.jobTitle.trim()) },
    // The backend accepts a free-text department name with a nullable ID.
    { step: 0, key: 'departmentId', label: label.department, ok: Boolean(form.departmentName.trim()) },
    { step: 0, key: 'neededDate', ok: Boolean(form.neededDate) },
    { step: 1, key: 'reason', ok: REASONS.includes(form.reason) },
    { step: 1, key: 'budgeted', label: label.budgeted, ok: form.budgeted === 'yes' || form.budgeted === 'no' },
    ...(form.budgeted === 'yes' ? [{ step: 1, key: 'budgetedSalary', label: label.budgetedSalary, ok: String(form.budgetedSalary).trim() !== '' }] : []),
    addition
      ? { step: 1, key: 'additionReason', ok: Boolean(form.additionReason.trim()) }
      : { step: 1, key: 'replacementFor', ok: Boolean(form.replacementFor.trim()) },
    { step: 2, key: 'educationCodes', label: label.education, ok: EDUCATION_FIELDS.some(([key]) => form[key] === 'yes') },
    { step: 2, key: 'gccExp', label: label.gccExperience, ok: Boolean(form.gccExp) },
    { step: 2, key: 'workExp', label: label.workExperience, ok: Boolean(form.workExp) },
    { step: 2, key: 'skills', ok: Boolean(form.skills.trim()) },
  ]
  return checks.map((check) => ({ ...check, label: check.label ?? label[check.key] }))
}

export function requisitionProgress(form, steps = 4) {
  const checks = requisitionChecks(form)
  const missing = checks.filter((check) => !check.ok)
  const doneSteps = Array.from({ length: steps }, (_, step) => {
    const own = checks.filter((check) => check.step === step)
    return own.length ? own.every((check) => check.ok) : false
  })
  return { checks, missing, doneSteps, done: checks.length - missing.length, total: checks.length,
    firstStep: missing.length ? Math.min(...missing.map((check) => check.step)) : -1,
    unlockedStep: missing.length ? Math.min(...missing.map((check) => check.step)) : steps - 1 }
}

export function leadTime(today, neededDate) {
  const days = daysBetween(today, neededDate)
  if (days === null) return null
  const text = REQUISITION_TEXT.lead
  if (days < 0) return { tone: 'warn', days, text: text.past }
  if (days === 0) return { tone: 'warn', days, text: text.today }
  if (days < 30) return { tone: 'warn', days, text: text.urgent(days) }
  return { tone: '', days, text: text.normal(days) }
}
