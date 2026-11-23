// Contractors, Contractor Employees and Contractor Summary (CI3: Contractor + Contractor_model +
// Con_employee_model). Master data lives in EBS (XXZP.XX_CONTRACTOR_INFO / XX_CON_EMPLOYEE_INFO).
import { z } from 'zod';
import { exportQuerySchema, listQuerySchema, pagedSchema, textFilter } from '../list';

const text = z.string().nullable();

/* ---------- shared field rules (CI3 form_validation wording) ---------- */

/** CI3 'numeric': optional; when given it must be a number. */
const numeric = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .default('')
    .refine(
      (v) => v === '' || /^[-+]?[0-9]*\.?[0-9]+$/.test(v),
      `The ${label} field must contain only numbers.`,
    );

/** CI3 valid_date_optional: YYYY-MM-DD or DD/MM/YYYY; returned as YYYY-MM-DD ('' when empty). */
const optionalDate = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .default('')
    .refine(
      (v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{2}\/\d{2}\/\d{4}$/.test(v),
      `The ${label} field must be a valid date.`,
    )
    .transform((v) => {
      const dmy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
      return dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : v;
    });

const required = (label: string, max?: number) => {
  const base = z
    .string({ error: `The ${label} field is required.` })
    .trim()
    .min(1, `The ${label} field is required.`);
  return max
    ? base.max(max, `The ${label} field cannot exceed ${max} characters in length.`)
    : base;
};

const endAfterStart = (value: { startDate: string; endDate: string }, ctx: z.RefinementCtx) => {
  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'End Date must be on or after Start Date.',
    });
  }
};

export const CONTRACTOR_STATUSES = ['Active', 'Inactive'] as const;
/** Division codes stored in XX_CON_EMPLOYEE_INFO and their CI3 labels. */
export const CONTRACTOR_DIVISIONS = [
  { value: 'IBM', label: 'IPP BU' },
  { value: 'Z3P', label: 'FPP BU' },
] as const;
export const CONTRACTOR_DEPARTMENTS = ['Production', 'QC', 'Maintenance', 'W/H', 'Admin'] as const;

/* ---------- Contractors ---------- */

export const contractorFiltersSchema = z
  .object({ conNumber: textFilter, conName: textFilter, status: textFilter })
  .prefault({});
export type ContractorFilters = z.infer<typeof contractorFiltersSchema>;
export const contractorListQuerySchema = listQuerySchema(contractorFiltersSchema);
export const contractorExportQuerySchema = exportQuerySchema(contractorFiltersSchema);

export const contractorRowSchema = z.object({
  id: z.number(),
  conNumber: text,
  conName: text,
  rate: text,
  status: text,
  /** YYYY-MM-DD */
  startDate: text,
  endDate: text,
  createdBy: text,
  createdDate: text,
  updatedBy: text,
  updatedDate: text,
});
export type ContractorRow = z.infer<typeof contractorRowSchema>;
export const contractorPageSchema = pagedSchema(contractorRowSchema);
/** GET /contractors/lookup */
export const contractorLookupSchema = z.object({
  message: z.string(),
  contractor: contractorRowSchema,
});

export const contractorInputSchema = z
  .object({
    conNumber: required('Contractor Number', 50),
    conName: required('Contractor Name', 200),
    status: required('Status').refine(
      (v) => ['ACTIVE', 'INACTIVE'].includes(v.toUpperCase()),
      'The Status field must be one of: ACTIVE, INACTIVE.',
    ),
    rate: numeric('Rate'),
    startDate: optionalDate('Start Date'),
    endDate: optionalDate('End Date'),
  })
  .superRefine(endAfterStart);
export type ContractorInput = z.infer<typeof contractorInputSchema>;

export const contractorChoiceSchema = z.object({ conNumber: z.string(), conName: text });
export const contractorChoicesSchema = z.array(contractorChoiceSchema);

/* ---------- Contractor employees ---------- */

export const conEmployeeFiltersSchema = z
  .object({
    division: textFilter,
    department: textFilter,
    conNumber: textFilter,
    status: textFilter,
    startDate: textFilter,
    endDate: textFilter,
  })
  .prefault({});
export type ConEmployeeFilters = z.infer<typeof conEmployeeFiltersSchema>;
export const conEmployeeListQuerySchema = listQuerySchema(conEmployeeFiltersSchema);
export const conEmployeeExportQuerySchema = exportQuerySchema(conEmployeeFiltersSchema);

export const conEmployeeRowSchema = z.object({
  id: z.number(),
  /** Stored code (IBM / Z3P). */
  divisionCode: text,
  /** CI3 list label (IPP / FPP / code). */
  division: text,
  conNumber: text,
  conName: text,
  employeeNumber: text,
  employeeName: text,
  iqamah: text,
  department: text,
  prodDep: text,
  directBoss: text,
  directBossId: text,
  job: text,
  jobTitle: text,
  place: text,
  replacement: text,
  rate: text,
  startDate: text,
  endDate: text,
  status: text,
  ajeer: text,
  sfda: text,
  blacklist: text,
  remark: text,
  createdBy: text,
  createdDate: text,
  updatedBy: text,
  updatedDate: text,
});
export type ConEmployeeRow = z.infer<typeof conEmployeeRowSchema>;
export const conEmployeePageSchema = pagedSchema(conEmployeeRowSchema);

const optionalText = z.string().trim().optional().default('');
/** Checkbox flags: CI3 stored "on" when ticked. */
const flag = z
  .string()
  .optional()
  .default('')
  .transform((v) => (v === 'on' ? 'on' : ''));

// CI3 has no date-order rule for contractor employees (Contractor.php:578-582), so none here.
export const conEmployeeInputSchema = z.object({
  employeeName: required('Employee Name', 200),
  conNumber: required('Contractor'),
  division: required('Division'),
  status: required('Status'),
  rate: numeric('Rate'),
  conName: optionalText,
  employeeNumber: optionalText,
  iqamah: optionalText,
  department: optionalText,
  prodDep: optionalText,
  directBoss: optionalText,
  directBossId: optionalText,
  job: optionalText,
  jobTitle: optionalText,
  place: optionalText,
  replacement: optionalText,
  startDate: optionalDate('Start Date'),
  endDate: optionalDate('End Date'),
  ajeer: flag,
  sfda: flag,
  blacklist: flag,
  remark: optionalText,
});
export type ConEmployeeInput = z.infer<typeof conEmployeeInputSchema>;

const option = z.object({ value: z.string(), label: z.string() });
export const conEmployeeOptionsSchema = z.object({
  departments: z.array(z.string()),
  jobs: z.array(option),
  bosses: z.array(option),
  productionDepartments: z.array(option),
  contractors: contractorChoicesSchema,
});
export type ConEmployeeOptions = z.infer<typeof conEmployeeOptionsSchema>;

/* ---------- Contractor summary ---------- */

export const contractorSummaryFiltersSchema = z
  .object({
    from: z.string().trim().optional().default(''),
    to: z.string().trim().optional().default(''),
    dept: z.string().trim().optional().default(''),
    cont: z.string().trim().optional().default(''),
    div: z.string().trim().optional().default(''),
  })
  .prefault({});
export type ContractorSummaryFilters = z.infer<typeof contractorSummaryFiltersSchema>;

export const contractorSummaryRowSchema = z.object({
  division: text,
  conNo: text,
  conName: text,
  dep: text,
  jobNm: text,
  employeeNumber: text,
  employeeName: text,
  iqamah: text,
  rate: text,
  totHrs: text,
  totCost: text,
});
export type ContractorSummaryRow = z.infer<typeof contractorSummaryRowSchema>;

export const contractorStatsRowSchema = z.object({
  conNo: text,
  conName: text,
  totalEmp: text,
  totalCost: text,
});
export type ContractorStatsRow = z.infer<typeof contractorStatsRowSchema>;

export const contractorDetailRowSchema = z.object({
  tDate: text,
  division: text,
  conNo: text,
  conName: text,
  depId: text,
  dep: text,
  empNo: text,
  employeeName: text,
  innPIn: text,
  outtPOut: text,
  actHrs: text,
});
export type ContractorDetailRow = z.infer<typeof contractorDetailRowSchema>;

export const contractorSummaryResultSchema = z.object({
  filters: z.object({
    from: z.string(),
    to: z.string(),
    dept: z.string(),
    cont: z.string(),
    div: z.string(),
  }),
  summary: z.array(contractorSummaryRowSchema),
  stats: z.array(contractorStatsRowSchema),
  records: z.array(contractorDetailRowSchema),
});
export type ContractorSummaryResult = z.infer<typeof contractorSummaryResultSchema>;

export const contractorSummaryOptionsSchema = z.object({
  departments: z.array(z.string()),
  contractors: z.array(z.string()),
});
