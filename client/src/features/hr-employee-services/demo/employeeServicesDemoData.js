// DEMO DATA ONLY (owner-approved for the HR employee services until their
// backend exists). Every person is fictional ("Sample Employee 001"); codes and
// amounts are illustrative. Delete this folder when the real API exists.

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
  return {
    recordChanges: [
      request('1', 'PCR-2026-1042', '2561', '2026-11-01', { positionCode: 'SALES_LEADER', basic: 8200, house: 2050, transport: 820, gradeCode: 'G7' }, 'SUBMITTED', '2026-10-20'),
      request('2', 'PCR-2026-1047', '2557', '2026-11-01', { familyStatusCode: 'MARRIED_WITH_FAMILY', house: 1150 }, 'APPROVED', '2026-10-12'),
      request('3', 'PCR-2026-1051', '0961', '2026-12-01', { basic: 6000, house: 1500, transport: 600 }, 'DRAFT', '2026-10-25'),
      request('4', 'PCR-2026-1053', '2559', '2026-11-15', { positionCode: 'SENIOR_ACCOUNTANT', gradeCode: 'G7', basic: 6900, house: 1725, transport: 690 }, 'SUBMITTED', '2026-10-27'),
    ],
  }
}
