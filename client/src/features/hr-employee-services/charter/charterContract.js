// Response contract of Project Charter: /api/v1/projects/charters. Readers turn
// backend data into frozen shapes and reject anything unexpected;
// `charterBody` builds the request body. Pure.
import { ID, invalidResponse, isoDate, pageOf, text } from '../shared/formRecords.js'
import { MILESTONES, TEXT_FIELDS } from './charterModel.js'

export function readIdeaOption(item) {
  if (!item || !ID.test(String(item.ideaId ?? ''))) throw invalidResponse('idea')
  return Object.freeze({ ideaId: String(item.ideaId), ideaNum: text(item.ideaNum), title: text(item.title), businessUnit: text(item.businessUnit) })
}

export function readEmployeeOption(item) {
  if (!item || !text(item.empNo)) throw invalidResponse('employee')
  return Object.freeze({ empNo: text(item.empNo), name: text(item.fullName) || text(item.empNo), jobTitle: text(item.jobTitle) })
}

const readMilestones = (data) => Object.freeze(Object.fromEntries(MILESTONES.map(({ key }) => [
  key, Object.freeze({ start: data?.[key]?.start === true, complete: data?.[key]?.complete === true }),
])))

export function readCharterRecord(data) {
  if (!data || !ID.test(String(data.headerId ?? ''))) throw invalidResponse('project charter')
  return Object.freeze({
    charterId: String(data.headerId),
    ideaId: data.ideaId == null ? '' : String(data.ideaId),
    ideaNum: text(data.ideaNum),
    projectName: text(data.projectName),
    businessUnit: text(data.businessUnit),
    expectedStartDate: isoDate(data.expectedStartDate),
    expectedEndDate: isoDate(data.expectedEndDate),
    creationDate: isoDate(data.creationDate),
    status: text(data.status),
    rewardExists: data.rewardExists === true,
    milestones: readMilestones(data.milestones),
    ...Object.fromEntries(Object.keys(TEXT_FIELDS).map((key) => [key, text(data[key])])),
  })
}

export function readCharterListItem(item) {
  if (!item || !ID.test(String(item.headerId ?? ''))) throw invalidResponse('project charter list')
  return Object.freeze({
    charterId: String(item.headerId),
    ideaNum: text(item.ideaNum),
    projectName: text(item.projectName),
    projectManager: text(item.projectManager),
    businessUnit: text(item.businessUnit),
    expectedStartDate: isoDate(item.expectedStartDate),
    expectedEndDate: isoDate(item.expectedEndDate),
    processOwner: text(item.processOwner),
    keyStakeholders: text(item.keyStakeholders),
    finalCustomer: text(item.finalCustomer),
    preparedBy: text(item.preparedBy),
    creationDate: isoDate(item.creationDate),
    status: text(item.status),
  })
}

export function readCharterPage(data) {
  if (!data || !Array.isArray(data.items)) throw invalidResponse('project charter list')
  return Object.freeze({ items: Object.freeze(data.items.map(readCharterListItem)), pagination: pageOf(data) })
}

// Request body: the requester's answers only. Project name, business unit and
// idea number come from the idea; status and creation date are server values.
// The idea is chosen on create only (the update does not re-link it).
export function charterBody(form, { isNew }) {
  return {
    ...(isNew ? { ideaId: form.ideaId } : {}),
    ...Object.fromEntries(Object.keys(TEXT_FIELDS).map((key) => [key, form[key].trim()])),
    expectedStartDate: form.expectedStartDate,
    expectedEndDate: form.expectedEndDate,
    milestones: Object.fromEntries(MILESTONES.map(({ key }) => [key, { start: Boolean(form.milestones[key]?.start), complete: Boolean(form.milestones[key]?.complete) }])),
  }
}
