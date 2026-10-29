import { randomUUID } from 'node:crypto';
import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../../database/oracle.js';
import { AppError } from '../../../shared/errors/AppError.js';
import * as defaultRepository from './performanceAppraisal.repository.js';

const notFound = () => new AppError(404, 'RESOURCE_NOT_FOUND', 'Performance appraisal not found');
const invalid = (code, message) => new AppError(400, code, message);
const text = (v) => (v === undefined || v === null || v === '' ? '-' : v);
const DESCRIPTION = Object.freeze({
  A: 'CONSISTENTLY EXCEEDS',
  B: 'MEETS AND EXCEEDS',
  C: 'SUCCESSFULLY MEETS',
  D: 'MEETS SOME',
  E: 'BELOW EXPECTATIONS',
});
export function calculateResult(criteria) {
  const rating =
    Math.round((criteria.reduce((sum, item) => sum + item.rating, 0) / 20) * 100) / 100;
  const grade =
    rating > 4.24 ? 'A' : rating > 3.49 ? 'B' : rating > 2.49 ? 'C' : rating > 1.59 ? 'D' : 'E';
  return { rating, grade, description: DESCRIPTION[grade] };
}

export function createPerformanceAppraisalService({
  repository = defaultRepository,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
}) {
  const read = (fn) => withConnection(POOLS.LOW, fn);
  const currentYear = () => new Date().getFullYear();
  const yearValid = (y) => Number.isInteger(y) && y >= currentYear() - 5 && y <= currentYear();
  const searchPattern = (s) =>
    s ? `%${s.toUpperCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  async function assertUnique(connection, employeeNumber, year) {
    if (await repository.hasDuplicate(connection, employeeNumber, year))
      throw new AppError(409, 'ALREADY_RATED', 'Already Rating Given');
  }
  function validateLines(body) {
    if (
      !Array.isArray(body.criteria) ||
      body.criteria.length !== 20 ||
      body.criteria.some(
        (item, index) =>
          !item ||
          item.id !== index + 1 ||
          !Number.isInteger(item.rating) ||
          item.rating < 1 ||
          item.rating > 5,
      )
    )
      throw invalid(
        'RATINGS_INVALID',
        'criteria must contain ratings 1 through 5 for ids 1 through 20',
      );
    if (!Array.isArray(body.development) || !body.development[0]?.trim())
      throw invalid('DEVELOPMENT_REQUIRED', 'the first development goal is required');
    if (!Array.isArray(body.training) || !body.training[0]?.trim())
      throw invalid('TRAINING_REQUIRED', 'the first training need is required');
  }
  function computedBinds(body) {
    const result = calculateResult(body.criteria);
    return {
      result,
      employeeRemarks: text(body.remarks?.employee),
      appraiserRemarks: text(body.remarks?.appraiser),
    };
  }
  async function insertLines(connection, headerId, body) {
    for (const item of body.criteria) {
      await repository.insertRating(connection, {
        id: item.id,
        headerId,
        personId: body.employee.personId,
        name: (body.formLanguage === 'Arabic'
          ? (repository.arabicCriteria ?? defaultRepository.arabicCriteria)
          : (repository.englishCriteria ?? defaultRepository.englishCriteria))[item.id - 1],
        justification: text(item.justification),
        rating: item.rating,
      });
    }
    for (const [index, need] of body.development.entries())
      if (need.trim())
        await repository.insertDevelopment(connection, { id: index + 1, need, headerId });
    for (const [index, objective] of body.training.entries())
      if (objective.trim())
        await repository.insertTraining(connection, { id: index + 1, objective, headerId });
  }
  return {
    async list(actor, query) {
      const year = query.year ?? currentYear();
      const isHr = await read((c) => repository.isHrUser(c, actor.userId));
      const hasEmployee = actor.employeeNumber !== undefined && actor.employeeNumber !== null;
      return read((c) =>
        repository.listAppraisals(c, {
          ...query,
          year,
          filters: {
            search: searchPattern(query.search),
            status: query.status ?? null,
            grade: query.grade ?? null,
            department: query.department ?? null,
          },
          userId: actor.userId,
          isHr,
          noEmployee: !isHr && !hasEmployee,
        }),
      );
    },
    async get(headerId) {
      const result = await read((c) => repository.findHeader(c, headerId));
      if (!result) throw notFound();
      return result;
    },
    async create(actor, body) {
      if (!body || !yearValid(body.year))
        throw invalid(
          'YEAR_INVALID',
          'year must be within the last five years through the current year',
        );
      validateLines(body);
      return withTransaction(POOLS.LOW, async (c) => {
        const employee = body.employee?.name
          ? await repository.findEmployee(c, body.employee.name, actor.userId)
          : null;
        if (
          !employee ||
          String(employee.number) !== String(body.employee.number) ||
          String(employee.personId) !== String(body.employee.personId)
        )
          throw invalid('EMP_NOT_FOUND', 'Employee was not found in the eligible employee list');
        await assertUnique(c, employee.number, body.year);
        const { result, employeeRemarks, appraiserRemarks } = computedBinds(body);
        const uuid = randomUUID();
        await repository.insertHeader(c, {
          uuid,
          personId: employee.personId,
          empName: employee.name,
          empNumber: employee.number,
          hireDate: employee.hireDate,
          jobId: employee.jobId,
          jobTitle: employee.jobTitle,
          periodFrom: `${body.year}-01-01`,
          periodTo: `${body.year}-12-31`,
          departmentId: employee.departmentId,
          department: employee.department,
          evaluatedBy: employee.evaluatedBy,
          ...result,
          year: body.year,
          createdBy: actor.userId,
          yearsInCompany: employee.yearsInCompany,
          yearsInPosition: employee.yearsInPosition,
          employeeRemarks,
          appraiserRemarks,
          formLanguage: body.formLanguage,
        });
        const headerId = await repository.findHeaderIdByUuid(c, uuid);
        if (!headerId)
          throw new AppError(
            500,
            'PERFORMANCE_APPRAISAL_INSERT_FAILED',
            'Performance appraisal was not created',
          );
        await insertLines(c, headerId, body);
        return { headerId };
      });
    },
    async update(headerId, body) {
      validateLines(body);
      return withTransaction(POOLS.LOW, async (c) => {
        const status = await repository.findStatus(c, headerId, true);
        if (!status) throw notFound();
        if (status === 'Inprocess')
          throw new AppError(
            409,
            'APPRAISAL_INPROCESS',
            'Request is Inprocess. Can not Update Request',
          );
        const { result, employeeRemarks, appraiserRemarks } = computedBinds(body);
        if (
          !(await repository.updateHeader(c, {
            headerId,
            ...result,
            employeeRemarks,
            appraiserRemarks,
          }))
        )
          throw notFound();
        for (const item of body.criteria)
          if (
            !(await repository.updateRating(c, {
              headerId,
              id: item.id,
              rating: item.rating,
              justification: text(item.justification),
            }))
          )
            throw notFound();
        for (const [index, need] of body.development.entries())
          if (need.trim()) await repository.updateDevelopment(c, { headerId, id: index + 1, need });
        for (const [index, objective] of body.training.entries())
          if (objective.trim())
            await repository.updateTraining(c, { headerId, id: index + 1, objective });
        return { headerId };
      });
    },
    async employeeRemarks(actor, headerId, remarks) {
      return withTransaction(POOLS.LOW, async (c) => {
        const appraisal = await repository.findHeader(c, headerId);
        if (!appraisal) throw notFound();
        const requestor = await repository.findRequestor(c, actor.userId);
        if (!requestor || String(requestor.employeeNumber) !== String(appraisal.employee.number))
          throw new AppError(
            403,
            'FORBIDDEN',
            'Only the appraised employee may update employee remarks',
          );
        if (!(await repository.updateEmployeeRemarks(c, { headerId, remarks }))) throw notFound();
        return { headerId, remarks };
      });
    },
    async remove(headerId) {
      return withTransaction(POOLS.LOW, async (c) => {
        if (!(await repository.findStatus(c, headerId))) throw notFound();
        if (!(await repository.deleteAppraisal(c, headerId))) throw notFound();
        return { headerId };
      });
    },
    async employees(actor, year = currentYear()) {
      const items = await read((c) => repository.listEmployees(c, actor.userId, year));
      return items.map((r) => ({
        hierarchyLevel: r.HIERARCHY_LEVEL,
        userId: r.USER_ID,
        name: r.FULL_NAME,
        number: r.EMPLOYEE_NUMBER,
      }));
    },
    async employeeDetails(actor, name, year = currentYear()) {
      return read(async (c) => {
        const employee = await repository.findEmployee(c, name, actor.userId);
        if (!employee) throw new AppError(404, 'EMP_NOT_FOUND', 'Employee was not found');
        await assertUnique(c, employee.number, year);
        return employee;
      });
    },
    async gradeStats(actor) {
      const data = await read(async (c) => {
        const employees = await repository.listEmployees(c, actor.userId, currentYear());
        return repository.gradeStats(c, actor.userId, employees.length);
      });
      const percent = { A: 15, B: 30, C: 40, D: 10, E: 5 };
      const target = Object.fromEntries(
        Object.entries(percent).map(([g, p]) => [
          g,
          data.totalEmployees <= 5
            ? 1
            : g === 'E'
              ? Math.ceil((p * data.totalEmployees) / 100)
              : Math.round((p * data.totalEmployees) / 100),
        ]),
      );
      return {
        totalEmployees: data.totalEmployees,
        quota: { percent, target, allocated: data.allocated },
      };
    },
    requestor(actor) {
      return read((c) => repository.findRequestor(c, actor.userId));
    },
  };
}
