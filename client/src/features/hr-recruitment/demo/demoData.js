// DEMO DATA ONLY (owner-approved for HR recruitment until its backend exists).
// Lookup lists and sample records for the in-memory demo adapter. All people
// in the sample records are fictional. Delete this folder when the real API
// is available (see the feature README).

const option = (code, name) => ({ code, name })

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
export const DEMO_ASSIGNED = Object.freeze({ requesterName: 'Demo Requester', adminManagerName: 'Demo Admin Manager' })

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
  }
}
