// Project Charter (ZPI.IMS.FM.13) business rules. Pure functions, no I/O. The
// legacy screen is pmform_codebase/views/charter (Charter controller); the
// server rules are projectCharter.validation.js and projectCharter.service.js.
import { isIsoDate } from '../../hr-recruitment/shared/hrFormat.js'

export const TEXT_MAX = 4000
export const NAME_MAX = 240
export const PENDING = 'Pending'

// The seven milestones of "Define the project schedule", in legacy order.
export const MILESTONES = Object.freeze([
  ['formProjectTeam', 'Form Project Team / Preliminary Review / Scope'],
  ['finalizePlan', 'Finalize Project Plan / Charter / Kick Off'],
  ['definePhase', 'Define Phase'],
  ['analysisPhase', 'Analysis Phase'],
  ['improvementPhase', 'Improvement Phase'],
  ['controlPhase', 'Control Phase'],
  ['projectSummary', 'Project Summary Report and Close Out'],
].map(([key, label]) => Object.freeze({ key, label })))

// The free-text fields the server stores (name → limit).
export const TEXT_FIELDS = Object.freeze({
  projectManager: NAME_MAX, processImpacted: TEXT_MAX, purpose: TEXT_MAX, expectedDeliverables: TEXT_MAX,
  projectTeam: TEXT_MAX, supportResources: TEXT_MAX, specialNeeds: TEXT_MAX,
  processOwner: NAME_MAX, keyStakeholders: TEXT_MAX, finalCustomer: TEXT_MAX, preparedBy: NAME_MAX,
})

// The server refuses any change once a charter is no longer Pending (409).
export const isCharterEditable = (status) => status === PENDING

export const blankMilestones = () => Object.fromEntries(MILESTONES.map((item) => [item.key, { start: false, complete: false }]))

export const blankCharter = (preparedBy = '') => ({
  ideaId: '', idea: null, expectedStartDate: '', expectedEndDate: '', milestones: blankMilestones(),
  ...Object.fromEntries(Object.keys(TEXT_FIELDS).map((key) => [key, key === 'preparedBy' ? preparedBy : ''])),
})

// Started and completed milestones (side card and step hint).
export function scheduleProgress(milestones) {
  const values = MILESTONES.map((item) => milestones[item.key] ?? { start: false, complete: false })
  return { started: values.filter((item) => item.start).length, completed: values.filter((item) => item.complete).length, total: MILESTONES.length }
}

const STEP = { ideaId: 0, projectManager: 0, processImpacted: 0, expectedStartDate: 0, expectedEndDate: 0, purpose: 0, expectedDeliverables: 0 }
const LABEL = {
  projectManager: 'Project manager', processImpacted: 'Process impacted', purpose: 'Purpose of project', expectedDeliverables: 'Expected deliverables',
  projectTeam: 'Project team', supportResources: 'Support resources', specialNeeds: 'Special needs', processOwner: 'Process owner',
  keyStakeholders: 'Key stakeholders', finalCustomer: 'Final customer', preparedBy: 'Prepared by',
}

// Problems as { field, message, step } in step order (0 project, 2 resources
// and customers). Mirrors the server: idea (new charters), project manager,
// both dates (completion not before start), purpose and deliverables are
// required; text within its column size.
export function validateCharter(form, { isNew }) {
  const problems = []
  const add = (field, message) => problems.push({ field, message, step: STEP[field] ?? 2 })
  if (isNew && !form.ideaId) add('ideaId', 'Select the approved idea.')
  if (!form.projectManager.trim()) add('projectManager', 'Project manager is required.')
  if (!form.expectedStartDate) add('expectedStartDate', 'Expected start date is required.')
  else if (!isIsoDate(form.expectedStartDate)) add('expectedStartDate', 'Enter a valid date.')
  if (!form.expectedEndDate) add('expectedEndDate', 'Expected completion date is required.')
  else if (!isIsoDate(form.expectedEndDate)) add('expectedEndDate', 'Enter a valid date.')
  else if (form.expectedStartDate && form.expectedEndDate < form.expectedStartDate) add('expectedEndDate', 'Completion cannot be before the start.')
  if (!form.purpose.trim()) add('purpose', 'Purpose of project is required.')
  if (!form.expectedDeliverables.trim()) add('expectedDeliverables', 'Expected deliverables are required.')
  for (const [key, max] of Object.entries(TEXT_FIELDS)) {
    if (form[key].trim().length > max) add(key, `Keep ${LABEL[key].toLowerCase()} within ${max} characters.`)
  }
  return problems.sort((a, b) => a.step - b.step)
}
