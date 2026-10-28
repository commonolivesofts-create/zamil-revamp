import { randomUUID } from 'node:crypto';
import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../../database/oracle.js';
import { AppError } from '../../../shared/errors/AppError.js';
import * as defaultRepository from './probationEvaluation.repository.js';
import { FORM_TYPES } from './probationEvaluation.validation.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const text = (value) => (value === undefined || value === null || value === '' ? '-' : value);
const notFound = (what = 'Probation evaluation') =>
  new AppError(404, 'RESOURCE_NOT_FOUND', `${what} was not found`);
const dateOrderError = () =>
  new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [
    { field: 'toDate', message: 'toDate must be on or after fromDate' },
  ]);

/** Convert a date-only ISO value to the PAF legacy Oracle bind format. */
export function toLegacyDate(value) {
  if (!value) return '01-JAN-00';
  const [year, month, day] = value.split('-');
  return `${day}-${MONTHS[Number(month) - 1]}-${year}`;
}

export function searchPattern(search) {
  if (!search) return undefined;
  return `%${search.toUpperCase().replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

const toDateTime = (value) => {
  if (value instanceof Date) return value.getTime();
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

export function createProbationEvaluationService({
  repository = defaultRepository,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
}) {
  const read = (work) => withConnection(POOLS.LOW, work);

  function headerBinds(body) {
    if (body.toDate < body.fromDate) throw dateOrderError();
    return {
      formDate: toLegacyDate(body.formDate),
      empId: text(body.empId),
      grade: body.grade ?? 0,
      evaluationPeriod: text(body.evaluationPeriod),
      formType: body.formType,
      totalRating:
        body.totalRating ?? body.lines.reduce((sum, line) => sum + (line.rating ?? 0), 0),
      comment: text(body.comment),
      comments: text(body.comments),
      employeeName: body.employeeName,
      jobTitle: text(body.jobTitle),
      department: text(body.department),
      employeeNumber: body.employeeNumber,
      fromDate: toLegacyDate(body.fromDate),
      toDate: toLegacyDate(body.toDate),
    };
  }

  async function loadDetail(connection, headerId) {
    const header = await repository.findHeader(connection, headerId);
    if (!header) throw notFound();
    const lines = await repository.listLines(connection, headerId);
    return { ...header, lines };
  }

  return {
    formTypes: () => ({ formTypes: [...FORM_TYPES] }),

    async create(actor, body) {
      const common = headerBinds(body);
      return withTransaction(POOLS.LOW, async (connection) => {
        const uuid = randomUUID();
        const requestor = await repository.findRequestor(connection, actor.userId);
        const expectedHeaderId = await repository.generateHeaderId(connection);
        await repository.insertHeader(connection, {
          ...common,
          uuid,
          userName: text(requestor?.fullName),
          userMail: text(requestor?.emailAddress),
          createdBy: actor.userId,
        });
        const headerId = await repository.findHeaderIdByUuid(connection, uuid);
        if (!headerId) {
          throw new AppError(
            500,
            'PROBATION_EVALUATION_INSERT_FAILED',
            'Probation evaluation was not created',
          );
        }
        if (headerId !== expectedHeaderId) {
          throw new AppError(
            409,
            'PROBATION_EVALUATION_ID_CONFLICT',
            'The probation evaluation identifier changed during creation; retry the request',
          );
        }
        for (const line of body.lines) {
          const lineId = await repository.generateLineId(connection, headerId);
          await repository.insertLine(connection, {
            headerId,
            lineId,
            rating: line.rating ?? 0,
            param: line.param,
            paramAr: text(line.paramAr),
          });
        }
        return { headerId, uuid };
      });
    },

    async list(actor, { page, pageSize, sortBy, sortDir, search, ...filters }) {
      const isHr = await read((connection) =>
        repository.isHrUser(connection, actor.employeeNumber),
      );
      const createdBy = isHr ? null : actor.userId;
      return read((connection) =>
        repository.listEvaluations(connection, {
          limit: pageSize,
          offset: (page - 1) * pageSize,
          filters: { ...filters, search: searchPattern(search) },
          createdBy,
          sortBy,
          sortDir,
        }),
      );
    },

    get(headerId) {
      return read((connection) => loadDetail(connection, headerId));
    },

    async update(headerId, body) {
      const common = headerBinds(body);
      return withTransaction(POOLS.LOW, async (connection) => {
        if (!(await repository.findHeaderStatus(connection, headerId))) throw notFound();
        const changed = await repository.updateHeader(connection, { ...common, headerId });
        if (!changed) throw notFound();
        for (const line of body.lines) {
          const updated = await repository.updateLine(connection, {
            headerId,
            lineId: line.lineId,
            rating: line.rating ?? 0,
            param: line.param,
            paramAr: text(line.paramAr),
          });
          if (!updated) throw notFound('Probation evaluation line');
        }
        return { headerId };
      });
    },

    async remove(headerId) {
      return withTransaction(POOLS.LOW, async (connection) => {
        const existing = await repository.findHeaderStatus(connection, headerId);
        if (!existing) throw notFound();
        if (existing.requestStatus !== 'DRAFT') {
          throw new AppError(
            409,
            'PROBATION_EVALUATION_NOT_DRAFT',
            'Only draft probation evaluations can be deleted',
          );
        }
        const deleted = await repository.deleteEvaluation(connection, headerId);
        if (!deleted) throw notFound();
        return { headerId, deleted: true };
      });
    },

    employees(actor) {
      return read((connection) => repository.listEmployees(connection, actor.userId));
    },

    requestor(actor) {
      return read((connection) => repository.findRequestor(connection, actor.userId));
    },

    async employeeDetails(actor, empName) {
      const details = await read((connection) =>
        repository.findEmployeeDetails(connection, { empName, userId: actor.userId }),
      );
      if (!details) throw notFound('Employee');
      const start = toDateTime(details.hire?.startDate);
      const yearsInCompany =
        start === null ? null : Math.floor(Math.abs(Date.now() - start) / 31536000000);
      return { ...details, yearsInCompanay: yearsInCompany };
    },
  };
}
