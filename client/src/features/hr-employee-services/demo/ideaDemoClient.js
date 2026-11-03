// DEMO ADAPTER ONLY: an in-memory /ideas with the backend's response shapes and
// rules (division, project type and investment category lists, the server
// feasibility calculation, ID<date><nnnn> numbers, edits only while DRAFT or
// REJECTED, { items, page, pageSize, total } lists). Fictional people only.
import { businessToday } from '../../hr-recruitment/shared/hrFormat.js'
import { clone, containsText, createDemoTransport } from './formsDemoKit.js'

const DIVISIONS = [{ id: '300000003618177', name: 'IPP BU' }, { id: '300000003618190', name: 'FPP BU' }]
const PROJECT_TYPES = ['innovation', 'development', 'environmental', 'automation']
const YEARS = { computer: 4, machine: 10, robot: 10, tools: 5, mold: 5, auxiliary: 5, building: 30, material: 0, exchange_rate: 0 }
const label = (value) => value.split('_').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100

export const DEMO_IDEA_EMPLOYEES = Object.freeze([
  { empNo: '9101', empName: 'Sample Employee 001', department: 'Injection Department', sourceDivision: '300000003618177' },
  { empNo: '9102', empName: 'Sample Employee 002', department: 'Assembly Department', sourceDivision: '300000003618190' },
  { empNo: '9103', empName: 'Sample Employee 003', department: 'Finance Department', sourceDivision: null },
  { empNo: '9104', empName: 'Sample Employee 004', department: 'Maintenance Department', sourceDivision: '300000003618177' },
].map(Object.freeze))

// The backend's calculation (depreciation, NPV at 8 %, IRR, ROI).
function calculate({ hasInvestment, investmentValue, saving, investmentCategory }) {
  const amount = hasInvestment === 'no' ? 0 : Number(investmentValue) || 0
  const yearly = Number(saving) || 0
  const years = YEARS[investmentCategory]
  if (!years) return { investmentValue: amount, saving: yearly, depreciation: 0, irr: 0, npv: 0, roi: 0 }
  const depreciation = amount / years
  const cash = yearly + depreciation
  let npv = -amount
  for (let t = 1; t <= years; t++) npv += cash / 1.08 ** t
  let rate = 0.1
  let irr = 0
  for (let k = 0; k < 100; k++) {
    let value = -amount
    let derivative = 0
    for (let t = 1; t <= years; t++) {
      value += cash / (1 + rate) ** t
      derivative -= (t * cash) / (1 + rate) ** (t + 1)
    }
    if (Math.abs(value) < 0.00001) { irr = round(rate * 100); break }
    if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-12 || rate <= -0.999999) break
    rate -= value / derivative
  }
  return { investmentValue: amount, saving: yearly, depreciation: round(depreciation), irr, npv: round(npv), roi: amount > 0 ? round((yearly * years - amount) / amount) : 0 }
}

export function createDemoIdeaRecords() {
  return [
    { headerId: 3, empNo: '9104', division: '300000003618177', title: 'Motion sensors for warehouse lighting', idea: 'Install motion sensors so warehouse aisles are lit only while someone works there.', projectType: 'environmental', investmentCategory: 'auxiliary', hasInvestment: 'yes', investmentValue: 12000, saving: 15000, status: 'INPROCESS', creationDate: '2026-10-21' },
    { headerId: 2, empNo: '9102', division: '300000003618190', title: 'Colour-coded packing stations', idea: 'Use one colour per product family at the packing stations to cut mix-ups on the line.', projectType: 'development', investmentCategory: 'material', hasInvestment: 'no', investmentValue: 0, saving: 18000, status: 'APPROVED', creationDate: '2026-10-02' },
    { headerId: 1, empNo: '9101', division: '300000003618177', title: 'Reuse mould cooling water', idea: 'Run the mould cooling water in a closed loop instead of draining it after each cycle.', projectType: 'innovation', investmentCategory: 'machine', hasInvestment: 'yes', investmentValue: 45000, saving: 60000, status: 'DRAFT', creationDate: '2026-09-14' },
  ]
}

export function createIdeaDemoClient({ latencyMs = 300, now = () => new Date(), records = createDemoIdeaRecords(), employees = DEMO_IDEA_EMPLOYEES } = {}) {
  const store = clone(records)
  const employeeOf = (number) => employees.find((item) => item.empNo === String(number)) ?? null
  const idNo = (record) => `ID${record.creationDate.replaceAll('-', '')}${String(record.headerId).padStart(4, '0')}`
  const present = (record, { attachments = true } = {}) => {
    const employee = employeeOf(record.empNo)
    return {
      headerId: record.headerId, uuid: `demo-${record.headerId}`, idNo: idNo(record), empNo: record.empNo, empName: employee.empName,
      division: record.division, divisionName: DIVISIONS.find((item) => item.id === record.division)?.name ?? null,
      department: employee.department, title: record.title, idea: record.idea, projectType: record.projectType,
      investmentCategory: record.investmentCategory, hasInvestment: record.hasInvestment, ...calculate(record),
      status: record.status, approvedBy: null, createdBy: '1', creationDate: record.creationDate,
      ...(attachments ? { attachments: [] } : {}),
    }
  }
  const find = (id, fail) => store.find((record) => String(record.headerId) === id) ?? fail(404, 'RESOURCE_NOT_FOUND', 'Idea not found')
  const bad = (fail, field, message) => fail(400, 'VALIDATION_ERROR', message, [{ field, message }])
  function prepare(body, fail) {
    if (!employeeOf(body?.empNo)) bad(fail, 'empNo', 'Current employee not found')
    if (!DIVISIONS.some((item) => item.id === body.division)) bad(fail, 'division', '"division" must be one of the listed divisions')
    if (!String(body.title ?? '').trim() || body.title.length > 200) bad(fail, 'title', '"title" is required (at most 200 characters)')
    if (!PROJECT_TYPES.includes(body.projectType)) bad(fail, 'projectType', '"projectType" is invalid')
    if (!(body.investmentCategory in YEARS)) bad(fail, 'investmentCategory', '"investmentCategory" is invalid')
    if (!['yes', 'no'].includes(body.hasInvestment)) bad(fail, 'hasInvestment', '"hasInvestment" is invalid')
    if (body.hasInvestment === 'yes' && !(Number(body.investmentValue) > 0)) bad(fail, 'investmentValue', 'Investment value must be positive')
    return {
      empNo: String(body.empNo), division: body.division, title: body.title.trim(), idea: body.idea ?? '', projectType: body.projectType,
      investmentCategory: body.investmentCategory, hasInvestment: body.hasInvestment,
      investmentValue: Number(body.investmentValue) || 0, saving: Number(body.saving) || 0,
    }
  }

  return createDemoTransport({
    latencyMs,
    routes: [
      [/^\/ideas\/lookups\/divisions$/, { get: ({ respond }) => respond(DIVISIONS) }],
      [/^\/ideas\/lookups\/categories$/, {
        get: ({ respond }) => respond({
          projectTypes: PROJECT_TYPES.map((value) => ({ value, label: label(value) })),
          investmentCategories: Object.entries(YEARS).map(([value, depreciationYears]) => ({ value, label: label(value), depreciationYears })),
        }),
      }],
      [/^\/ideas\/lookups\/employees$/, {
        get: ({ params, respond }) => respond(employees
          .filter((item) => !params.q || containsText(item.empNo, params.q) || containsText(item.empName, params.q))
          .map(({ empNo, empName, department }) => ({ empNo, empName, department }))),
      }],
      [/^\/ideas\/lookups\/employees\/([^/]+)$/, {
        get: ({ match, respond, fail }) => {
          const employee = employeeOf(decodeURIComponent(match[1])) ?? bad(fail, 'empNo', 'Current employee not found')
          const division = DIVISIONS.find((item) => item.id === employee.sourceDivision) ?? null
          return respond({ empNo: employee.empNo, empName: employee.empName, department: employee.department, divisionId: division?.id ?? null, divisionName: division?.name ?? null })
        },
      }],
      [/^\/ideas$/, {
        get: ({ params, respond }) => {
          const page = Number(params.page) || 1
          const pageSize = Math.min(100, Number(params.pageSize) || 25)
          const rows = store.map((record) => ({ ...present(record, { attachments: false }), pendingAt: null })).filter((item) =>
            (!params.status || item.status === String(params.status).toUpperCase()) && (!params.division || item.division === params.division) &&
            (!params.category || item.projectType === params.category) && (!params.invCategory || item.investmentCategory === params.invCategory) &&
            (!params.from || item.creationDate >= params.from) && (!params.to || item.creationDate <= params.to) &&
            (!params.q || [item.title, item.idea, item.empName].some((value) => containsText(value, params.q))))
            .sort((a, b) => b.headerId - a.headerId)
          return respond({ items: rows.slice((page - 1) * pageSize, page * pageSize), page, pageSize, total: rows.length })
        },
        post: ({ body, respond, fail }) => {
          const record = { ...prepare(body, fail), headerId: Math.max(0, ...store.map((item) => item.headerId)) + 1, status: 'DRAFT', creationDate: businessToday(now()) }
          store.unshift(record)
          return respond(present(record), { status: 201 })
        },
      }],
      [/^\/ideas\/([1-9][0-9]*)$/, {
        get: ({ match, respond, fail }) => respond(present(find(match[1], fail))),
        put: ({ match, body, respond, fail }) => {
          const record = find(match[1], fail)
          if (!['DRAFT', 'REJECTED'].includes(record.status)) fail(409, 'IDEA_LOCKED', `Idea is ${record.status} and cannot be modified`)
          Object.assign(record, prepare(body, fail))
          return respond(present(record, { attachments: false }))
        },
      }],
    ],
  })
}
