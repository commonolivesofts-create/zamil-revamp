// DEMO DATA ONLY for Transfer Request and Performance Appraisal while their
// backends are pending. Every person is fictional ("Sample Employee 001");
// codes and amounts are illustrative. Delete this folder when the APIs exist.

const slug = (name) => name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
const options = (names) => names.map((name) => ({ code: slug(name), name }))

const POSITIONS = options([
  'Packer', 'Machine Operator', 'Line Supervisor', 'Injection Operator', 'Moulding Technician', 'Sales Coordinator', 'Sales Leader', 'Sales Executive',
  'HR Officer', 'Senior HR Officer', 'Payroll Officer', 'Accountant', 'Senior Accountant', 'Maintenance Technician', 'Senior Maintenance Technician',
  'Electrician', 'Quality Inspector', 'Quality Engineer', 'Store Keeper', 'Warehouse Supervisor',
])

export const DEMO_EMPLOYEE_SERVICES_LOOKUPS = Object.freeze({
  positions: POSITIONS,
  grades: options(['G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10']),
  levels: options(['L1', 'L2', 'L3', 'L4']),
  familyStatuses: options(['Single', 'Married', 'Married with family', 'Divorced', 'Widowed']),
  departments: [
    ['ASSEMBLY', 'Assembly Department', [['ASSEMBLY_LINE_1', 'Assembly Line 1'], ['ASSEMBLY_LINE_2', 'Assembly Line 2'], ['PACKING', 'Packing']]],
    ['INJECTION', 'Injection Department', [['INJECTION_HALL_A', 'Injection Hall A'], ['INJECTION_HALL_B', 'Injection Hall B']]],
    ['FINANCE', 'Finance Department', [['ACCOUNTS', 'Accounts'], ['TREASURY', 'Treasury']]],
    ['HR', 'HR Department', [['HR_SECTION', 'HR Section'], ['RECRUITMENT', 'Recruitment'], ['PAYROLL', 'Payroll']]],
    ['SALES', 'Sales Department', [['SALES_SECTION', 'Sales Section'], ['KEY_ACCOUNTS', 'Key Accounts']]],
    ['MAINTENANCE', 'Maintenance Department', [['MAINTENANCE', 'Maintenance'], ['UTILITIES', 'Utilities']]],
    ['QUALITY', 'Quality Department', [['QUALITY_CONTROL', 'Quality Control'], ['QUALITY_ASSURANCE', 'Quality Assurance']]],
    ['WAREHOUSE', 'Warehouse Department', [['RAW_MATERIALS', 'Raw Materials Store'], ['FINISHED_GOODS', 'Finished Goods Store']]],
    ['TOOL_ROOM', 'Tool Room Department', [['TOOL_ROOM', 'Tool Room']]],
  ].map(([code, name, sections]) => ({ code, name, sections: sections.map(([sectionCode, sectionName]) => ({ code: sectionCode, name: sectionName })) })),
  jobTitles: POSITIONS,
  directors: [
    { directorId: 'D-1004', name: 'Sample Director A', area: 'Operations' },
    { directorId: 'D-1011', name: 'Sample Director B', area: 'Commercial' },
    { directorId: 'D-1018', name: 'Sample Director C', area: 'Finance & Admin' },
    { directorId: 'D-1022', name: 'Sample Director D', area: 'Engineering' },
  ],
  bloodTypes: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((code) => ({ code, name: code.replace('-', '−') })),
  companies: [{ code: 'ZP_NON_FOOD', name: 'Zamil Plastic Non-Food' }, { code: 'ZP_FOOD', name: 'Zamil Plastic Food' }],
  transferDocument: { title: 'Transfer Request Form', controlNumber: 'ZPI.TCN.FM.01', version: '1.0', issueDate: '2026-01-01', pages: 'Page 1 of 1' },
})

const record = (positionCode, basic, house, transport, other, communication, car, gradeCode, levelCode, familyStatusCode) => ({
  positionCode, basic, house, transport, other, communication, car, gradeCode, levelCode, familyStatusCode,
})

const employee = (employeeId, employeeNumber, name, nationality, [departmentCode, departmentName], [sectionCode, sectionName], startDate, bloodType, current) => ({
  employeeId, employeeNumber, name, nationality, departmentCode, departmentName, sectionCode, sectionName, startDate,
  jobTitleCode: current.positionCode, bloodType, current,
})

const HR = ['HR', 'HR Department']
const SALES = ['SALES', 'Sales Department']
const TOOL_ROOM = ['TOOL_ROOM', 'Tool Room Department']
const MAINTENANCE = ['MAINTENANCE', 'Maintenance Department']
const ASSEMBLY = ['ASSEMBLY', 'Assembly Department']
const FINANCE = ['FINANCE', 'Finance Department']

export const DEMO_SERVICE_EMPLOYEES = Object.freeze([
  employee('101', '2558', 'Sample Employee 001', 'Saudi', HR, ['HR_SECTION', 'HR Section'], '2019-03-10', 'O+', record('HR_OFFICER', 6500, 1625, 650, 0, 150, 0, 'G6', 'L2', 'SINGLE')),
  employee('102', '2561', 'Sample Employee 002', 'Saudi', SALES, ['SALES_SECTION', 'Sales Section'], '2021-08-10', null, record('SALES_COORDINATOR', 7000, 1750, 700, 300, 200, 0, 'G6', 'L1', 'MARRIED')),
  employee('103', '2557', 'Sample Employee 003', 'Indian', TOOL_ROOM, ['TOOL_ROOM', 'Tool Room'], '2016-07-09', 'B+', record('MOULDING_TECHNICIAN', 3800, 950, 380, 0, 0, 0, 'G4', 'L2', 'MARRIED_WITH_FAMILY')),
  employee('104', '2556', 'Sample Employee 004', 'Saudi', MAINTENANCE, ['MAINTENANCE', 'Maintenance'], '2018-07-08', null, record('MAINTENANCE_TECHNICIAN', 5200, 1300, 520, 0, 100, 0, 'G5', 'L1', 'SINGLE')),
  employee('105', '0961', 'Sample Employee 005', 'Indian', ASSEMBLY, ['ASSEMBLY_LINE_1', 'Assembly Line 1'], '1996-06-27', 'A+', record('LINE_SUPERVISOR', 5600, 1400, 560, 250, 100, 0, 'G7', 'L3', 'MARRIED_WITH_FAMILY')),
  employee('106', '2559', 'Sample Employee 006', 'Pakistani', FINANCE, ['ACCOUNTS', 'Accounts'], '2020-08-06', null, record('ACCOUNTANT', 6000, 1500, 600, 0, 150, 0, 'G6', 'L1', 'MARRIED')),
  employee('107', '2554', 'Sample Employee 007', 'Saudi', ASSEMBLY, ['PACKING', 'Packing'], '2023-07-02', null, record('PACKER', 3000, 750, 300, 0, 0, 0, 'G3', 'L1', 'SINGLE')),
  employee('108', '2553', 'Sample Employee 008', 'Egyptian', ASSEMBLY, ['PACKING', 'Packing'], '2024-04-09', 'O-', record('PACKER', 2900, 725, 290, 0, 0, 0, 'G3', 'L1', 'MARRIED')),
])

// Server-side values the demo cannot take from a session.
export const DEMO_REQUESTER = Object.freeze({ name: 'Sample Requester', employeeNumber: '9001' })

const byNumber = (employeeNumber) => DEMO_SERVICE_EMPLOYEES.find((item) => item.employeeNumber === employeeNumber)

// Seed requests (statuses: draft, submitted, approved), as stored by the server.
export function createDemoServiceRecords() {
  const request = (requestId, requestNumber, employeeNumber, effectiveDate, changes, status, requestDate) => {
    const person = structuredClone(byNumber(employeeNumber))
    return {
      requestId, requestNumber, status, requestDate, requestedBy: { ...DEMO_REQUESTER }, employee: person, effectiveDate,
      revised: { ...person.current, ...changes }, remarks: '', views: '', attachments: [], updatedAt: `${requestDate}T08:00:00.000Z`,
    }
  }
  const transfer = (transferId, transferNumber, employeeNumber, to, effectiveDate, directorId, salaryChange, budgetedSalary, status, requestDate) => {
    const person = structuredClone(byNumber(employeeNumber))
    return {
      transferId, transferNumber, status, requestDate, requestedBy: { ...DEMO_REQUESTER }, companyCode: 'ZP_NON_FOOD', employee: person,
      to, effectiveDate, bloodType: person.bloodType, directorId, salaryChange, budgetedSalary, updatedAt: `${requestDate}T08:00:00.000Z`,
    }
  }
  return {
    // One submitted appraisal of the previous period (every criterion rated 4: 4.00, grade B).
    appraisals: [{
      appraisalId: '1', appraisalNumber: 'EPA-2026-0007', status: 'SUBMITTED', periodCode: '2025', appraiser: { ...DEMO_REQUESTER },
      employeeId: '102', ratings: Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`C${String(index + 1).padStart(2, '0')}`, { rating: 4, explanation: '' }])),
      goals: ['Lead the key account reviews', 'Complete the negotiation course', 'Mentor a new coordinator'], training: ['Negotiation skills'],
      employeeRemarks: '', appraiserRemarks: '', signatures: { employee: '2026-01-20', appraiser: '2026-01-18' }, updatedAt: '2026-01-20T08:00:00.000Z',
    }],
    transfers: [
      transfer('1', 'TRF-2026-0311', '2554', { jobTitleCode: 'MACHINE_OPERATOR', departmentCode: 'INJECTION', sectionCode: 'INJECTION_HALL_A' }, '2026-11-08', 'D-1004', 'NO', 'YES', 'SUBMITTED', '2026-10-21'),
      transfer('2', 'TRF-2026-0314', '2557', { jobTitleCode: 'MOULDING_TECHNICIAN', departmentCode: 'MAINTENANCE', sectionCode: 'UTILITIES' }, '2026-11-15', 'D-1022', 'YES', 'YES', 'APPROVED', '2026-10-14'),
      transfer('3', 'TRF-2026-0318', '2561', { jobTitleCode: 'SALES_LEADER', departmentCode: 'SALES', sectionCode: 'KEY_ACCOUNTS' }, '2026-12-01', 'D-1011', 'YES', 'NO', 'DRAFT', '2026-10-27'),
    ],
    recordChanges: [
      request('1', 'PCR-2026-1042', '2561', '2026-11-01', { positionCode: 'SALES_LEADER', basic: 8200, house: 2050, transport: 820, gradeCode: 'G7' }, 'SUBMITTED', '2026-10-20'),
      request('2', 'PCR-2026-1047', '2557', '2026-11-01', { familyStatusCode: 'MARRIED_WITH_FAMILY', house: 1150 }, 'APPROVED', '2026-10-12'),
      request('3', 'PCR-2026-1051', '0961', '2026-12-01', { basic: 6000, house: 1500, transport: 600 }, 'DRAFT', '2026-10-25'),
      request('4', 'PCR-2026-1053', '2559', '2026-11-15', { positionCode: 'SENIOR_ACCOUNTANT', gradeCode: 'G7', basic: 6900, house: 1725, transport: 690 }, 'SUBMITTED', '2026-10-27'),
    ],
  }
}

// Performance appraisal lookups: the 20 criteria and the rating scale of the
// form. The A–E letters per band are an assumed mapping (see the README).
const CRITERIA = [
  'Quality / Accuracy of Work', 'Quantity of Work', 'Dependability', 'Attendance / Punctuality',
  'Professional Communication Skills with co-workers/Supervisors', 'Customer-focused Communication Skills',
  'Ability to work as a member of a team; teamwork', 'Demonstrates Positive Attitude', 'Ability to work independently',
  'Open to feedback', 'Willingness to take on additional responsibilities', 'Complies with company policies and procedures',
  'Exhibits effective problem solving skills', 'Eagerness to learn new-job related skills', 'Ask questions and seek guidance as needed',
  'Makes progress towards professional development goals', 'Demonstrates Zamil Group Core Values', 'Initiative', 'Developing Others',
  'Health Safety & Environment (HSE)',
]

export const DEMO_PERFORMANCE_LOOKUPS = Object.freeze({
  criteria: CRITERIA.map((label, index) => ({ code: `C${String(index + 1).padStart(2, '0')}`, label })),
  scale: [
    { min: 4.25, grade: 'A', title: 'Consistently exceeds', range: '4.25 & above', description: 'Performance consistently exceeds all the stated objectives in terms of the performance indicators/criteria established.' },
    { min: 3.5, grade: 'B', title: 'Meets and exceeds', range: '3.5 – 4.24', description: 'Performance consistently meets and frequently exceeds objectives in terms of the performance indicators/criteria established.' },
    { min: 2.5, grade: 'C', title: 'Successfully meets', range: '2.5 – 3.49', description: 'Performance meets and occasionally exceeds objectives in terms of the performance indicators/criteria established.' },
    { min: 1.6, grade: 'D', title: 'Meets some', range: '1.6 – 2.49', description: 'Meet some but not all of the objectives in terms of the performance indicators/criteria established.' },
    { min: 0, grade: 'E', title: 'Below expectations', range: '1 – 1.5', description: 'Performance frequently does not meet objectives in terms of the performance indicators/criteria established.' },
  ],
  distribution: { A: 15, B: 30, C: 40, D: 10, E: 5 },
  periods: [
    { code: '2026', label: 'From 01 Jan 2026 to 31 Dec 2026', from: '2026-01-01', to: '2026-12-31' },
    { code: '2025', label: 'From 01 Jan 2025 to 31 Dec 2025', from: '2025-01-01', to: '2025-12-31' },
  ],
})

// The appraiser's team: every demo employee, with the date in the current
// position and the grades already given in a period (before any appraisal
// saved in this tab).
const POSITION_SINCE = { 101: '2022-01-01', 102: '2021-08-10', 103: '2020-05-01', 104: '2018-07-08', 105: '2009-02-15', 106: '2020-08-06', 107: '2023-07-02', 108: '2024-04-09' }
export const DEMO_SAVED_GRADES = Object.freeze({ 2026: Object.freeze({ 101: 'B', 103: 'C', 104: 'C', 105: 'A', 107: 'C' }), 2025: Object.freeze({}) })
export const DEMO_TEAM = Object.freeze(DEMO_SERVICE_EMPLOYEES.map((person) => Object.freeze({
  employeeId: person.employeeId, employeeNumber: person.employeeNumber, name: person.name,
  jobTitle: POSITIONS.find((item) => item.code === person.jobTitleCode)?.name ?? person.jobTitleCode, grade: person.current.gradeCode,
  companyName: 'Zamil Plastic', departmentName: person.departmentName, joinedDate: person.startDate, positionDate: POSITION_SINCE[person.employeeId],
})))
