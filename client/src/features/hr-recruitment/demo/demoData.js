// DEMO DATA ONLY (owner-approved for HR recruitment until its backend exists).
// Lookup lists and sample records for the in-memory demo adapter. All people
// in the sample records are fictional. Delete this folder when the real API
// is available (see the feature README).

const option = (code, name) => ({ code, name })
// [English, Arabic, allocated points] → criterion with a code derived from the English name.
const criteria = (list) => list.map(([name, nameAr, points]) => ({
  code: name.toUpperCase().replace(/&/g, 'AND').replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40), name, nameAr, points,
}))

export const DEMO_LOOKUPS = Object.freeze({
  departments: [
    option('HR', 'Human Resources'), option('FIN', 'Finance'), option('PROD', 'Production'), option('QUAL', 'Quality'),
    option('WH', 'Warehouse'), option('MAINT', 'Maintenance'), option('SALES', 'Sales'), option('PROC', 'Procurement'),
    option('IT', 'IT'), option('ADMIN', 'Administration'),
  ],
  divisions: [option('IPP', 'IPP'), option('CORP', 'Corporate'), option('OPS', 'Operations')],
  interviewTypes: [option('ONLINE', 'Online'), option('F2F', 'Face to face'), option('PHONE', 'Phone')],
  certificates: [
    option('HS', 'Highschool or equivalent'), option('DIP', 'Diploma'), option('HDIP', 'Higher diploma'),
    option('BSC', 'Bachelor’s degree'), option('MSC', 'Master’s degree or higher'),
  ],
  maritalStatuses: [option('SINGLE', 'Single'), option('MARRIED', 'Married'), option('DIVORCED', 'Divorced'), option('WIDOWED', 'Widowed')],
  educationLevels: [
    { ...option('HS', 'Highschool or equivalent'), level: 1 }, { ...option('DIP', 'Diploma'), level: 2 },
    { ...option('HDIP', 'Higher diploma'), level: 3 }, { ...option('BSC', 'Bachelor’s degree'), level: 4 },
    { ...option('MSC', 'Master’s degree or higher'), level: 5 },
  ],
  experienceBands: [option('Y0_2', '0–2 years'), option('Y2_5', '2–5 years'), option('Y5_10', '5–10 years'), option('Y10P', '10+ years')],
  approvalRoute: {
    steps: [
      { code: 'LINE_MANAGER', label: 'Line manager', note: 'Confirms the need' },
      { code: 'HR_MANAGER', label: 'HR manager', note: 'Checks grade and salary' },
      { code: 'GENERAL_MANAGER', label: 'General manager', note: 'Final approval' },
    ],
    unbudgetedStep: { code: 'FINANCE', label: 'Finance', note: 'Approves an unbudgeted position' },
  },
  interview: { payrollDefault: 'IPP BU' },
  orientation: {
    departmentHeads: {
      hr: [option('HEAD_HR_A', 'Sample HR Head A'), option('HEAD_HR_B', 'Sample HR Head B')],
      safety: [option('HEAD_SAF_A', 'Sample Safety Head A'), option('HEAD_SAF_B', 'Sample Safety Head B')],
      it: [option('HEAD_IT_A', 'Sample IT Head A'), option('HEAD_IT_B', 'Sample IT Head B')],
      tour: [option('HEAD_PROD_A', 'Sample Production Head A'), option('HEAD_PROD_B', 'Sample Production Head B')],
      meet: [option('HEAD_HR_A', 'Sample HR Head A'), option('HEAD_HR_B', 'Sample HR Head B')],
    },
  },
  // PLACEHOLDER criteria and points (from the incoming prototype), not approved
  // HR content: the real form types and criteria must come from the backend.
  probation: {
    formTypes: [
      { code: 'WORKERS', name: 'Workers & Technicians', nameAr: 'العمال والفنيون', criteria: criteria([
        ['Job knowledge & skills', 'المعرفة والمهارات الوظيفية', 20], ['Quality of work', 'جودة العمل', 15], ['Productivity', 'الإنتاجية', 15],
        ['Safety compliance', 'الالتزام بالسلامة', 15], ['Attendance & punctuality', 'الحضور والانضباط', 10], ['Teamwork', 'العمل الجماعي', 10],
        ['Following instructions', 'اتباع التعليمات', 10], ['Housekeeping (5S)', 'النظافة والترتيب', 5],
      ]) },
      { code: 'TRAINEE', name: 'Trainee', nameAr: 'متدرب', criteria: criteria([
        ['Learning ability', 'القدرة على التعلم', 20], ['Job knowledge gained', 'المعرفة المكتسبة', 15], ['Initiative', 'المبادرة', 15],
        ['Attendance & punctuality', 'الحضور والانضباط', 15], ['Attitude', 'السلوك', 15], ['Communication', 'التواصل', 10], ['Teamwork', 'العمل الجماعي', 10],
      ]) },
      { code: 'ENGINEERS', name: 'Engineers & Staff', nameAr: 'المهندسون والموظفون', criteria: criteria([
        ['Technical knowledge', 'المعرفة الفنية', 20], ['Quality & accuracy', 'الجودة والدقة', 15], ['Planning & organisation', 'التخطيط والتنظيم', 15],
        ['Problem solving', 'حل المشكلات', 15], ['Communication', 'التواصل', 10], ['Initiative', 'المبادرة', 10], ['Teamwork', 'العمل الجماعي', 10],
        ['Attendance & punctuality', 'الحضور والانضباط', 5],
      ]) },
      { code: 'MANAGERS', name: 'Department Managers', nameAr: 'مدراء الأقسام', criteria: criteria([
        ['Leadership', 'القيادة', 20], ['Planning & goal achievement', 'التخطيط وتحقيق الأهداف', 20], ['Decision making', 'اتخاذ القرار', 15],
        ['People development', 'تطوير الموظفين', 15], ['Communication', 'التواصل', 10], ['Budget & cost control', 'الميزانية وضبط التكاليف', 10],
        ['Safety & compliance', 'السلامة والامتثال', 10],
      ]) },
      { code: 'SUPERVISORS', name: 'Supervisors & Foremen', nameAr: 'المشرفون ورؤساء العمال', criteria: criteria([
        ['Supervision & leadership', 'الإشراف والقيادة', 20], ['Production target achievement', 'تحقيق أهداف الإنتاج', 20], ['Safety enforcement', 'تطبيق السلامة', 15],
        ['Shift planning', 'تخطيط الورديات', 15], ['Quality control', 'مراقبة الجودة', 10], ['Training the team', 'تدريب الفريق', 10],
        ['Attendance & punctuality', 'الحضور والانضباط', 10],
      ]) },
    ],
    // ASSUMED rating scale (the original form shows a Rating box without a scale); configurable server-side.
    ratingScale: [
      { min: 0, label: 'Unsatisfactory', labelAr: 'غير مرضٍ' }, { min: 51, label: 'Needs improvement', labelAr: 'يحتاج إلى تحسين' },
      { min: 71, label: 'Good', labelAr: 'جيد' }, { min: 81, label: 'Very good', labelAr: 'جيد جداً' }, { min: 91, label: 'Outstanding', labelAr: 'ممتاز' },
    ],
  },
  offer: {
    currency: 'SAR',
    reportFormat: 'FPP BU',
    probation: { en: '3 months with the possibility to be extend to 6 Months.', ar: 'ثلاثة أشهر مع قابلية تمديدها إلى ستة أشهر.' },
    signatories: [
      { role: 'HR_MANAGER', name: 'Saad AL Essa', title: 'HR Manager' },
      { role: 'GENERAL_MANAGER', name: 'Bader Alsulaim', title: 'General Manager' },
    ],
  },
})

// Values the demo "server" assigns (a real backend takes them from the session
// and the workflow).
// Used only until the page passes the signed-in user's name (identifyDemoUser).
export const DEMO_ASSIGNED = Object.freeze({
  requesterName: 'Demo Requester', adminManagerName: 'Demo Admin Manager', scheduledByName: 'Demo Scheduler', preparedByName: 'Demo Evaluator',
})

// Fictional employees for the pickers: new joiners (orientation) and employees
// on probation (evaluation). `evaluationFormCode` suggests the PAF form type.
const employee = (n, employmentType, startDate, section, division, position, grade, departmentName, evaluationFormCode) => ({
  employeeId: String(n), employeeNumber: String(30400 + n), name: `Sample Employee ${String(n).padStart(3, '0')}`,
  employmentType, startDate, section, division, position, grade, departmentName, evaluationFormCode,
})
export const DEMO_EMPLOYEES = Object.freeze([
  employee(1, 'Employee', '2026-11-01', 'Sales Section', 'IPP BU', 'Sales Coordinator', 'G5', 'Sales', 'ENGINEERS'),
  employee(2, 'Employee', '2026-11-08', 'Quality Section', 'IPP BU', 'Quality Inspector', 'G5', 'Quality', 'WORKERS'),
  employee(3, 'Trainee', '2026-11-15', 'Engineering', 'Corporate', 'Graduate Trainee', 'T1', 'Engineering', 'TRAINEE'),
  employee(4, 'Contractor', '2026-11-02', 'Maintenance', 'Operations', 'Electrician', 'G4', 'Maintenance', 'WORKERS'),
  employee(5, 'Employee', '2026-08-02', 'Maintenance', 'Operations', 'Maintenance Technician', 'G5', 'Maintenance', 'WORKERS'),
  employee(6, 'Employee', '2026-08-16', 'Warehouse', 'Operations', 'Store Keeper', 'G4', 'Warehouse', 'WORKERS'),
  employee(7, 'Employee', '2026-09-01', 'Quality Section', 'IPP BU', 'Quality Engineer', 'G8', 'Quality', 'ENGINEERS'),
  employee(8, 'Employee', '2026-09-15', 'Production', 'IPP BU', 'Production Supervisor', 'G9', 'Production', 'SUPERVISORS'),
  employee(9, 'Trainee', '2026-10-01', 'Engineering', 'Corporate', 'Graduate Trainee', 'T1', 'Engineering', 'TRAINEE'),
  employee(10, 'Employee', '2026-07-12', 'Finance', 'Corporate', 'Finance Manager', 'G11', 'Finance', 'MANAGERS'),
].map((item) => Object.freeze(item)))

const ratings = (keys, values) => Object.fromEntries(keys.map((key, index) => [key, { rating: values[index], remark: '' }]))
const benefit = (en, ar) => ({ en, ar, autoArabic: true })

// Sample records, numbered as the server would number them.
export function createDemoRecords() {
  return {
    requisitions: [
      {
        requisitionId: '1', requisitionNumber: 'PRQ-2026-0001', status: 'SUBMITTED', requesterName: DEMO_ASSIGNED.requesterName,
        requestDate: '2026-09-14', jobTitle: 'Quality Inspector', departmentCode: 'QUAL', neededDate: '2026-12-01',
        remark: 'Second shift coverage.', reason: 'REPLACEMENT', replacementFor: 'Departing quality inspector', additionReason: '',
        budgeted: true, budgetedSalary: 6500, basicSalary: null, educationCodes: ['DIP', 'BSC'], gccExperienceCode: 'Y2_5',
        workExperienceCode: 'Y5_10', skills: ['ISO 9001', 'SPC', 'Gauge calibration'], otherRequirements: 'Rotating shifts.',
        attachments: [], updatedAt: '2026-09-14T07:30:00.000Z',
      },
      {
        requisitionId: '2', requisitionNumber: null, status: 'DRAFT', requesterName: DEMO_ASSIGNED.requesterName,
        requestDate: '2026-10-20', jobTitle: 'Store Keeper', departmentCode: 'WH', neededDate: '2026-11-10',
        remark: '', reason: 'ADDITION', replacementFor: '', additionReason: 'New finished-goods warehouse bay.',
        budgeted: false, budgetedSalary: null, basicSalary: null, educationCodes: ['HS'], gccExperienceCode: 'Y0_2',
        workExperienceCode: null, skills: [], otherRequirements: '', attachments: [], updatedAt: '2026-10-20T09:10:00.000Z',
      },
    ],
    interviews: [
      {
        assessmentId: '1', assessmentNumber: 'IA-2026-0001', status: 'COMPLETE', requisitionNumber: 'PRQ-2026-0001',
        positionTitle: 'Quality Inspector', preScreeningDate: '2026-10-05', divisionCode: 'IPP', expectedJoiningDate: '2026-12-01',
        interviewTypeCode: 'F2F', candidateName: 'Sample Candidate A', candidateAge: 31, nationality: 'Sample', maritalStatusCode: 'MARRIED',
        location: 'Dammam', certificateCode: 'BSC', major: 'Industrial engineering', currentEmployer: 'Sample Manufacturing Co.',
        lastPosition: 'QC Technician', relevantExperienceYears: 6, expectedBasic: 6000, expectedTotal: 8400, currentBasic: 5200, currentTotal: 7300,
        personalSpecification: ratings(['conf', 'att', 'gk', 'exp', 'eng', 'comm', 'safe', 'health'], [4, 4, 3, 4, 3, 4, 5, 4]),
        personalSpecificationRemarks: '', competency: ratings(['jrk', 'lead', 'press', 'nat', 'shift', 'ot'], [4, 3, 4, 4, 5, 4]),
        competencyRemarks: '', strengths: 'Strong SPC background.', weakness: 'Limited supervisory experience.', outcome: 'PASSED',
        adminManagerName: DEMO_ASSIGNED.adminManagerName, departmentRepresentative: 'Quality supervisor', payroll: 'IPP BU', hrComment: '',
        interviewers: ['HR officer', 'Quality manager', ''], updatedAt: '2026-10-05T11:00:00.000Z',
      },
    ],
    offers: [
      {
        offerId: '1', offerNumber: null, status: 'DRAFT', position: 'Quality Inspector', offerDate: '2026-10-21', reportFormat: 'FPP BU',
        salutation: 'MR', candidateNameEn: 'Sample Candidate A', candidateNameAr: '',
        benefits: {
          basic: benefit('6000', '٦٬٠٠٠ ريال سعودي شهرياً'), housing: benefit('1500', '١٬٥٠٠ ريال سعودي شهرياً'),
          transport: benefit('600', '٦٠٠ ريال سعودي شهرياً'), vacation: benefit('21 days per year', '٢١ يوماً في السنة'),
          ticket: benefit('', ''), medical: benefit('As per company policy', 'حسب سياسة الشركة'), contract: benefit('2 years', 'سنتان'),
          start: benefit('', ''), probation: benefit('3 months with the possibility to be extend to 6 Months.', 'ثلاثة أشهر مع قابلية تمديدها إلى ستة أشهر.'),
        },
        comments: '', signatures: { hrManager: null, generalManager: null, applicant: null }, currency: 'SAR',
        updatedAt: '2026-10-21T08:00:00.000Z',
      },
    ],
    orientations: [],
    evaluations: [],
  }
}
