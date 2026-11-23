// Contractors (CI3 /contractor…, /contractor/employees…, /report/contractor-summary…):
//   POST /contractors/list | /contractors/export, GET /contractors/choices | /contractors/lookup,
//   POST /contractors, PUT|DELETE /contractors/:id
//   POST /contractor-employees/list | /export, GET /contractor-employees/options,
//   POST /contractor-employees, PUT|DELETE /contractor-employees/:id
//   GET /contractor-summary/options, POST /contractor-summary/run | /contractor-summary/export
import { Router, type Request } from 'express';
import {
  conEmployeeExportQuerySchema,
  conEmployeeInputSchema,
  conEmployeeListQuerySchema,
  contractorExportQuerySchema,
  contractorInputSchema,
  contractorListQuerySchema,
  contractorSummaryFiltersSchema,
  toIsoDate,
  type ConEmployeeRow,
  type ContractorRow,
  type ContractorSummaryResult,
  type ContractorSummaryRow,
  type MutationResult,
} from '@attendance/shared';
import { authOf, requireAuth } from '../../auth/middleware';
import { dash, dMY, sendCsv, type CsvExport } from '../../lib/csv';
import { AppError } from '../../lib/errors';
import { body, idParam } from '../http';
import { reportRoutes } from '../report';
import type {
  ConEmployeeRepository,
  ContractorRepository,
  ContractorSummaryRepository,
  SummaryQuery,
} from './repository';

/** CI3 CREATEB_BY / UPDATED_BY: the Oracle user id of the signed-in user. */
const userIdOf = (req: Request) => String(authOf(req).userId ?? '');
const fieldError = (path: string, message: string) =>
  new AppError('VALIDATION', message, { issues: [{ path: [path], message }] });

/** CI3 serializeContractor keys, in order (the export writes them as headers). */
export const CONTRACTOR_EXPORT: CsvExport<ContractorRow> = {
  filePrefix: 'contractor_data',
  emptyMessage: 'No contractor data found to export.',
  columns: [
    { label: 'id', value: (r) => r.id },
    { label: 'con_number', value: (r) => r.conNumber },
    { label: 'con_name', value: (r) => r.conName },
    { label: 'rate', value: (r) => r.rate },
    { label: 'status', value: (r) => r.status },
    { label: 'status_display', value: (r) => dash(r.status) },
    { label: 'start_date', value: (r) => r.startDate },
    { label: 'end_date', value: (r) => r.endDate },
    { label: 'start_date_display', value: (r) => dash(dMY(r.startDate)) },
    { label: 'end_date_display', value: (r) => dash(dMY(r.endDate)) },
    { label: 'created_by', value: (r) => r.createdBy },
    { label: 'created_date', value: (r) => r.createdDate },
    { label: 'updated_by', value: (r) => r.updatedBy },
    { label: 'updated_date', value: (r) => r.updatedDate },
  ],
};

/** CI3 serializeEmployee keys, in order (division is the list's decoded label). */
export const CON_EMPLOYEE_EXPORT: CsvExport<ConEmployeeRow> = {
  filePrefix: 'contractor_employee_data',
  emptyMessage: 'No employee data found to export.',
  columns: [
    { label: 'id', value: (r) => r.id },
    { label: 'division', value: (r) => r.division },
    { label: 'con_number', value: (r) => r.conNumber },
    { label: 'con_name', value: (r) => r.conName },
    { label: 'employee_number', value: (r) => r.employeeNumber },
    { label: 'employee_name', value: (r) => r.employeeName },
    { label: 'iqamah', value: (r) => r.iqamah },
    { label: 'department', value: (r) => r.department },
    { label: 'prod_dep', value: (r) => r.prodDep },
    { label: 'direct_boss', value: (r) => r.directBoss },
    { label: 'direct_boss_id', value: (r) => r.directBossId },
    { label: 'job', value: (r) => r.job },
    { label: 'job_title', value: (r) => r.jobTitle },
    { label: 'place', value: (r) => r.place },
    { label: 'replacement', value: (r) => r.replacement },
    { label: 'rate', value: (r) => r.rate },
    { label: 'start_date', value: (r) => r.startDate },
    { label: 'end_date', value: (r) => r.endDate },
    { label: 'start_date_display', value: (r) => dash(dMY(r.startDate)) },
    { label: 'end_date_display', value: (r) => dash(dMY(r.endDate)) },
    { label: 'status', value: (r) => r.status },
    { label: 'status_display', value: (r) => dash(r.status) },
    { label: 'ajeer', value: (r) => r.ajeer },
    { label: 'sfda', value: (r) => r.sfda },
    { label: 'blacklist', value: (r) => r.blacklist },
    { label: 'remark', value: (r) => r.remark },
    { label: 'created_by', value: (r) => r.createdBy },
    { label: 'created_date', value: (r) => r.createdDate },
    { label: 'updated_by', value: (r) => r.updatedBy },
    { label: 'updated_date', value: (r) => r.updatedDate },
  ],
};

/** CI3 get_summary column names, in order. */
export const CONTRACTOR_SUMMARY_EXPORT: CsvExport<ContractorSummaryRow> = {
  filePrefix: 'contractor_summary',
  emptyMessage: 'No summary data found to export.',
  columns: [
    { label: 'DIVISION', value: (r) => r.division },
    { label: 'CON_NO', value: (r) => r.conNo },
    { label: 'CON_NAME', value: (r) => r.conName },
    { label: 'DEP', value: (r) => r.dep },
    { label: 'JOB_NM', value: (r) => r.jobNm },
    { label: 'EMPLOYEE_NUMBER', value: (r) => r.employeeNumber },
    { label: 'EMPLOYEE_NAME', value: (r) => r.employeeName },
    { label: 'IQAMAH', value: (r) => r.iqamah },
    { label: 'RATE', value: (r) => r.rate },
    { label: 'TOT_HRS', value: (r) => r.totHrs },
    { label: 'TOT_COST', value: (r) => r.totCost },
  ],
};

const validDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** CI3 resolveSummaryFilters: the current month by default, range checked. */
export function resolveSummary(input: unknown, now = new Date()): SummaryQuery {
  const f = contractorSummaryFiltersSchema.parse(input ?? {});
  const from = f.from || toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = f.to || toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  if (!validDay(from) || !validDay(to))
    throw new AppError('VALIDATION', 'From/To must be valid dates.');
  if (from > to)
    throw new AppError('VALIDATION', 'From date must be less than or equal to To date.');
  return { from, to, dept: f.dept, cont: f.cont, div: f.div };
}

export function contractorRoutes(deps: {
  contractors: ContractorRepository;
  employees: ConEmployeeRepository;
  summary: ContractorSummaryRepository;
}): Router {
  const router = Router();
  const { contractors, employees, summary } = deps;

  /* ---- contractors ---- */
  router.use(
    reportRoutes({
      path: '/contractors',
      listSchema: contractorListQuerySchema,
      repository: contractors,
      csv: { ...CONTRACTOR_EXPORT, exportSchema: contractorExportQuerySchema },
    }),
  );

  router.get('/contractors/choices', requireAuth, async (_req, res) => {
    res.json(await contractors.choices());
  });

  router.get('/contractors/lookup', requireAuth, async (req, res) => {
    const conNumber = typeof req.query.conNumber === 'string' ? req.query.conNumber.trim() : '';
    if (!conNumber) throw new AppError('VALIDATION', 'Contractor number is required.');
    const contractor = await contractors.findByNumber(conNumber);
    if (!contractor) throw new AppError('NOT_FOUND', 'Contractor not found.');
    res.json({ message: 'Contractor fetched successfully.', contractor });
  });

  router.post('/contractors', requireAuth, async (req, res) => {
    const input = body(contractorInputSchema, req);
    if (await contractors.numberExists(input.conNumber))
      throw fieldError(
        'conNumber',
        'The Contractor Number already exists. Please use a unique value.',
      );
    const id = await contractors.insert(input, userIdOf(req));
    res.status(201).json({
      message: 'Contractor added successfully.',
      contractor: await contractors.findById(id),
    });
  });

  router.put('/contractors/:id', requireAuth, async (req, res) => {
    const id = idParam(req, 'Contractor not found.');
    const input = body(contractorInputSchema, req);
    if (await contractors.numberExists(input.conNumber, id))
      throw fieldError(
        'conNumber',
        'The Contractor Number already exists. Please use a unique value.',
      );
    const result = await contractors.update(id, input, userIdOf(req));
    if (!result.found) throw new AppError('NOT_FOUND', 'Contractor not found.');
    const response: MutationResult = {
      message: result.changed ? 'Contractor updated successfully.' : 'No changes detected.',
    };
    res.json(response);
  });

  router.delete('/contractors/:id', requireAuth, async (req, res) => {
    const id = idParam(req, 'Contractor not found.');
    if (!(await contractors.findById(id))) throw new AppError('NOT_FOUND', 'Contractor not found.');
    await contractors.remove(id);
    const response: MutationResult = { message: 'Contractor deleted successfully.' };
    res.json(response);
  });

  /* ---- contractor employees ---- */
  router.use(
    reportRoutes({
      path: '/contractor-employees',
      listSchema: conEmployeeListQuerySchema,
      repository: employees,
      csv: { ...CON_EMPLOYEE_EXPORT, exportSchema: conEmployeeExportQuerySchema },
    }),
  );

  router.get('/contractor-employees/options', requireAuth, async (_req, res) => {
    const [options, choices] = await Promise.all([employees.options(), contractors.choices()]);
    res.json({ ...options, contractors: choices });
  });

  const checkContractor = async (conNumber: string) => {
    if (!(await contractors.findByNumber(conNumber)))
      throw fieldError('conNumber', 'The selected Contractor does not exist.');
  };

  router.post('/contractor-employees', requireAuth, async (req, res) => {
    const input = body(conEmployeeInputSchema, req);
    await checkContractor(input.conNumber);
    const id = await employees.insert(input, userIdOf(req));
    res
      .status(201)
      .json({ message: 'Employee added successfully.', employee: await employees.findById(id) });
  });

  router.put('/contractor-employees/:id', requireAuth, async (req, res) => {
    const id = idParam(req, 'Employee not found.');
    const input = body(conEmployeeInputSchema, req);
    await checkContractor(input.conNumber);
    const result = await employees.update(id, input, userIdOf(req));
    if (!result.found) throw new AppError('NOT_FOUND', 'Employee not found.');
    const response: MutationResult = {
      message: result.changed ? 'Employee updated successfully.' : 'No changes detected.',
    };
    res.json(response);
  });

  router.delete('/contractor-employees/:id', requireAuth, async (req, res) => {
    const id = idParam(req, 'Employee not found.');
    if (!(await employees.findById(id))) throw new AppError('NOT_FOUND', 'Employee not found.');
    await employees.remove(id);
    const response: MutationResult = { message: 'Employee deleted successfully.' };
    res.json(response);
  });

  /* ---- contractor summary ---- */
  router.get('/contractor-summary/options', requireAuth, async (_req, res) => {
    res.json(await summary.options());
  });

  router.post('/contractor-summary/run', requireAuth, async (req, res) => {
    const q = resolveSummary(req.body?.filters ?? req.body);
    const [rows, stats, records] = await Promise.all([
      summary.summary(q),
      summary.stats(q),
      summary.detail(q),
    ]);
    const result: ContractorSummaryResult = { filters: q, summary: rows, stats, records };
    res.json(result);
  });

  router.post('/contractor-summary/export', requireAuth, async (req, res) => {
    const q = resolveSummary(req.body?.filters ?? req.body);
    sendCsv(res, CONTRACTOR_SUMMARY_EXPORT, await summary.summary(q));
  });

  return router;
}
