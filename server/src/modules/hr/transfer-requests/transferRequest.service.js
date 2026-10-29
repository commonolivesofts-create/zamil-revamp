import { randomUUID } from 'node:crypto';
import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../../database/oracle.js';
import { AppError } from '../../../shared/errors/AppError.js';
import * as defaultRepository from './transferRequest.repository.js';
import { DEPARTMENTS, PLANTS } from './transferRequest.validation.js';

const today = () => new Date().toISOString().slice(0, 10);
const dateValid = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};
const required = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const fail = (code, field, message) => new AppError(400, code, message, [{ field, message }]);
const notFound = (message = 'Transfer request not found') =>
  new AppError(404, 'RESOURCE_NOT_FOUND', message);
const conflict = (message) => new AppError(409, 'TRANSFER_REQUEST_LOCKED', message);
const num = (v) => (v === undefined || v === null || v === '' ? null : String(v));

export function createTransferRequestService({
  repository = defaultRepository,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
} = {}) {
  const read = (work) => withConnection(POOLS.LOW, work);

  async function prepare(actor, body, connection, existing = null) {
    if (!PLANTS.includes(body.plant)) throw fail('PLANT_INVALID', 'plant', 'plant is invalid');
    const current = body.current ?? {};
    const transfer = body.transfer ?? {};
    if (!required(current.empName))
      throw fail('EMP_NOT_FOUND', 'current.empName', 'Employee was not found');
    const employee = await repository.findEmployeeDetails(connection, current.empName);
    if (!employee) throw fail('EMP_NOT_FOUND', 'current.empName', 'Employee was not found');
    if (
      !required(transfer.jobTitle) ||
      !(await repository.listJobs(connection)).some((x) => x.name === transfer.jobTitle)
    ) {
      throw fail('JOB_TITLE_INVALID', 'transfer.jobTitle', 'Job title is invalid');
    }
    if (!DEPARTMENTS.includes(transfer.dept))
      throw fail('DEPT_INVALID', 'transfer.dept', 'Department is invalid');
    if (
      !required(transfer.section) ||
      !(await repository.listSections(connection)).some((x) => x.name === transfer.section)
    ) {
      throw fail('SECTION_INVALID', 'transfer.section', 'Section is invalid');
    }
    if (!dateValid(transfer.effectiveDate))
      throw fail(
        'EFFECTIVE_DATE_REQUIRED',
        'transfer.effectiveDate',
        'A valid effective date is required',
      );
    if (
      !required(transfer.bloodType) ||
      !(await repository.listBloodTypes(connection)).some(
        (x) => String(x.code) === transfer.bloodType,
      )
    ) {
      throw fail('BLOOD_TYPE_INVALID', 'transfer.bloodType', 'Blood type is invalid');
    }
    const directors = await repository.listDirectors(connection);
    const director = directors.find((x) => String(x.empNo) === String(transfer.superiorNo));
    if (!required(transfer.superiorNo) || !director)
      throw fail('SUPERIOR_INVALID', 'transfer.superiorNo', 'Superior is invalid');
    if (
      !['Yes', 'No'].includes(transfer.changeSalary) ||
      !['Yes', 'No'].includes(transfer.budgetedSalary)
    ) {
      throw fail('SALARY_FLAG_INVALID', 'transfer.changeSalary', 'Salary flags must be Yes or No');
    }
    const requestors = await repository.findRequestor(connection, actor.userId);
    const requestor = requestors[0] ?? {};
    const mgrDate =
      required(body.mgrDate) && dateValid(body.mgrDate)
        ? body.mgrDate
        : body.mgrDate
          ? null
          : today();
    if (!mgrDate) throw fail('VALIDATION_ERROR', 'mgrDate', 'mgrDate must be YYYY-MM-DD');
    const dateOrNull = (v) => (required(v) && dateValid(v) ? v : null);
    if (
      [body.itHr?.hrDate, body.itHr?.itDate, body.itHr?.adminDate].some(
        (v) => required(v) && !dateValid(v),
      )
    ) {
      throw fail('VALIDATION_ERROR', 'itHr', 'Signature dates must be YYYY-MM-DD');
    }
    return {
      uuid: null,
      plant: body.plant,
      requestedBy:
        existing?.requestedBy ??
        (required(body.requestedBy) ? body.requestedBy : (requestor.fullName ?? null)),
      deptMgrNo: num(requestor.empNo),
      mgrDate,
      cEmpNo: num(current.empNo ?? employee.empNo),
      cEmpName: current.empName,
      cDateOfJoining:
        dateOrNull(current.dateOfJoining ?? employee.dateOfJoining) ??
        (existing ? null : '2000-01-01'),
      cJobTitle: current.jobTitle ?? employee.jobTitle ?? null,
      cDept: current.dept ?? (employee.deptName ? employee.deptName.replace('Section', '') : null),
      cSection: current.section ?? employee.deptName ?? null,
      tJobTitle: transfer.jobTitle,
      tDept: transfer.dept,
      tSection: transfer.section,
      tEffectiveDate: transfer.effectiveDate,
      tBloodType: transfer.bloodType,
      tSuperiorNo: num(director.empNo),
      tSuperiorName: director.name,
      tChangeSalary: transfer.changeSalary,
      tBudgetSalary: transfer.budgetedSalary,
      hrSignature: body.itHr?.hrSignature ?? null,
      itSignature: body.itHr?.itSignature ?? null,
      hrDate: dateOrNull(body.itHr?.hrDate),
      itDate: dateOrNull(body.itHr?.itDate),
      adminDate: dateOrNull(body.itHr?.adminDate),
      createdBy: actor.userId,
    };
  }

  return {
    async create(actor, body) {
      return withTransaction(POOLS.LOW, async (c) => {
        const binds = await prepare(actor, body, c);
        binds.uuid = randomUUID();
        const headerId = await repository.insertRequest(c, binds);
        if (!headerId)
          throw new AppError(
            500,
            'TRANSFER_REQUEST_ID_UNAVAILABLE',
            'Transfer request could not be created',
          );
        return { headerId: String(headerId), uuid: binds.uuid };
      });
    },
    async list(actor, query) {
      const isHr = await read((c) => repository.isHrUser(c, actor.userId));
      const { page, pageSize, sort, order, ...filters } = query;
      const result = await read((c) =>
        repository.listRequests(c, {
          filters,
          page,
          pageSize,
          sort,
          order,
          userId: actor.userId,
          isHr,
        }),
      );
      return {
        meta: {
          page: query.page,
          pageSize: query.pageSize,
          total: result.total,
          sort: query.sort,
          order: query.order,
        },
        rows: result.rows,
      };
    },
    async get(headerId) {
      const record = await read((c) => repository.findRequest(c, headerId));
      if (!record) throw notFound();
      return record;
    },
    async update(actor, headerId, body) {
      return withTransaction(POOLS.LOW, async (c) => {
        const existing = await repository.findStatusForUpdate(c, headerId);
        if (!existing) throw notFound();
        if (['Inprocess', 'Approved'].includes(existing.status))
          throw conflict('Cannot update request while it is In Process');
        const binds = await prepare(actor, body, c, existing);
        const updated = await repository.updateRequest(c, { ...binds, headerId });
        if (!updated) throw notFound();
        return { headerId: String(headerId) };
      });
    },
    async remove(_actor, headerId) {
      return withTransaction(POOLS.LOW, async (c) => {
        const existing = await repository.findStatusForUpdate(c, headerId);
        if (!existing) throw notFound();
        if (['Inprocess', 'Approved'].includes(existing.status))
          throw conflict('Cannot delete a request that is not Draft or Rejected');
        if (!(await repository.deleteRequest(c, headerId))) throw notFound();
        return { headerId: String(headerId) };
      });
    },
    employees: () => read((c) => repository.listEmployeeNames(c)),
    employeeDetails: (name) =>
      read(async (c) => {
        const result = await repository.findEmployeeDetails(c, name);
        if (!result) throw notFound('Employee not found');
        return result;
      }),
    jobs: () => read((c) => repository.listJobs(c)),
    sections: () => read((c) => repository.listSections(c)),
    departments: async () => DEPARTMENTS,
    directors: () => read((c) => repository.listDirectors(c)),
    bloodTypes: () => read((c) => repository.listBloodTypes(c)),
    requestor: (actor) => read((c) => repository.findRequestor(c, actor.userId)),
  };
}
