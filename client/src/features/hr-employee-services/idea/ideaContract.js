// Response contract of Share an Idea (form 1097): /api/v1/ideas. Readers turn
// backend data into the frozen shapes the screens use and reject anything
// unexpected; `ideaBody` builds the create/update payload. Pure.
import { ID, invalidResponse, isoDate, normalizeStatus, optionalNumber, pageOf, text } from '../shared/formRecords.js'

const option = (item, what) => {
  if (!item || typeof item.value !== 'string' || typeof item.label !== 'string') throw invalidResponse(what)
  return Object.freeze({ value: item.value, label: item.label })
}

export function readIdeaLookups(divisions, categories) {
  if (!Array.isArray(divisions) || !Array.isArray(categories?.projectTypes) || !Array.isArray(categories?.investmentCategories)) {
    throw invalidResponse('idea form options')
  }
  return Object.freeze({
    divisions: Object.freeze(divisions.map((item) => option({ value: text(item?.id), label: item?.name }, 'division list'))),
    projectTypes: Object.freeze(categories.projectTypes.map((item) => option(item, 'project type list'))),
    investmentCategories: Object.freeze(categories.investmentCategories.map((item) => Object.freeze({
      ...option(item, 'investment category list'),
      depreciationYears: Number(item.depreciationYears) || 0,
    }))),
  })
}

// Search row and the picker's option shape.
export function readIdeaEmployee(item) {
  if (!item || !text(item.empNo)) throw invalidResponse('employee')
  return Object.freeze({
    employeeId: text(item.empNo), employeeNumber: text(item.empNo), name: text(item.empName) || text(item.empNo),
    departmentName: text(item.department), position: text(item.department),
  })
}

// Employee details (fills the name, department and suggested division).
export function readIdeaEmployeeDetails(data) {
  if (!data || !text(data.empNo)) throw invalidResponse('employee')
  return Object.freeze({
    employeeId: text(data.empNo), employeeNumber: text(data.empNo), name: text(data.empName) || text(data.empNo),
    departmentName: text(data.department), position: text(data.department), divisionId: text(data.divisionId),
  })
}

const feasibility = (data) => Object.freeze({
  depreciation: optionalNumber(data.depreciation), irr: optionalNumber(data.irr), npv: optionalNumber(data.npv), roi: optionalNumber(data.roi),
})

export function readIdeaRecord(data) {
  if (!data || !ID.test(String(data.headerId ?? ''))) throw invalidResponse('idea')
  return Object.freeze({
    ideaId: String(data.headerId),
    idNo: text(data.idNo) || String(data.headerId),
    employee: Object.freeze({
      employeeId: text(data.empNo), employeeNumber: text(data.empNo), name: text(data.empName) || text(data.empNo),
      departmentName: text(data.department), position: text(data.department),
    }),
    division: text(data.division),
    divisionName: text(data.divisionName),
    title: text(data.title),
    idea: text(data.idea),
    projectType: text(data.projectType),
    investmentCategory: text(data.investmentCategory),
    hasInvestment: data.hasInvestment === 'yes' || data.hasInvestment === 'no' ? data.hasInvestment : '',
    investmentValue: optionalNumber(data.investmentValue),
    saving: optionalNumber(data.saving),
    feasibility: feasibility(data),
    status: normalizeStatus(data.status),
    creationDate: isoDate(data.creationDate),
    attachments: Object.freeze((Array.isArray(data.attachments) ? data.attachments : []).map((item) => Object.freeze({
      attachmentId: text(item?.attachmentId), fileName: text(item?.fileName), attachedOn: isoDate(item?.attachedOn),
    }))),
  })
}

export function readIdeaListItem(item) {
  if (!item || !ID.test(String(item.headerId ?? ''))) throw invalidResponse('idea list')
  return Object.freeze({
    ideaId: String(item.headerId),
    idNo: text(item.idNo) || String(item.headerId),
    employeeNumber: text(item.empNo),
    employeeName: text(item.empName),
    divisionName: text(item.divisionName),
    department: text(item.department),
    title: text(item.title),
    projectType: text(item.projectType),
    investmentCategory: text(item.investmentCategory),
    hasInvestment: text(item.hasInvestment),
    investmentValue: optionalNumber(item.investmentValue),
    saving: optionalNumber(item.saving),
    status: normalizeStatus(item.status),
    pendingAt: text(item.pendingAt),
    creationDate: isoDate(item.creationDate),
  })
}

export function readIdeaPage(data) {
  if (!data || !Array.isArray(data.items)) throw invalidResponse('idea list')
  return Object.freeze({ items: Object.freeze(data.items.map(readIdeaListItem)), pagination: pageOf(data) })
}

// The server re-reads the employee's name and department, and computes the
// depreciation, IRR, NPV and ROI; amounts are sent as plain numbers.
export function ideaBody(form) {
  return {
    empNo: form.employee.employeeNumber,
    division: form.division,
    title: form.title.trim(),
    idea: form.idea.trim(),
    projectType: form.projectType,
    investmentCategory: form.investmentCategory,
    hasInvestment: form.hasInvestment,
    investmentValue: form.hasInvestment === 'yes' ? Number(form.investmentValue) : 0,
    saving: form.saving === '' ? 0 : Number(form.saving),
  }
}
