import { randomUUID } from 'node:crypto';
import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../../database/oracle.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { parsePermission } from '../../access-control/authorization.service.js';
import * as defaultRepository from './probationEvaluation.repository.js';
import { FORM_TYPES } from './probationEvaluation.validation.js';

const VIEW = parsePermission('HR.PROBATION_EVALUATIONS', 'VIEW');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const text = (value) => (value === undefined || value === null || value === '' ? '-' : value);
const notFound = (what = 'Probation evaluation') =>
  new AppError(404, 'RESOURCE_NOT_FOUND', `${what} was not found`);
const forbidden = () =>
  new AppError(403, 'FORBIDDEN', 'You do not have permission for this action.');
const notDraft = (action) =>
  new AppError(
    409,
    'PROBATION_EVALUATION_NOT_DRAFT',
    `Only draft probation evaluations can be ${action}`,
  );
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
  // `authorizationService.holds`; denies by default so a missing wiring never widens access.
  holds = async () => false,
}) {
  const read = (work) => withConnection(POOLS.LOW, work);

  /**
   * Record-level access by ID: the creator, an HR user (XXZP_HR lookup, as for list scoping), or
   * a user in the evaluated employee's department who holds HR.PROBATION_EVALUATIONS:VIEW.
   * Returns the record's facts; unknown IDs are 404 and other records 403.
   */
  async function authorizeRecord(connection, actor, headerId) {
    const facts = await repository.findAccessFacts(connection, headerId);
    if (!facts) throw notFound();
    if (String(facts.createdBy) === String(actor.userId)) return facts;
    if (await repository.isHrUser(connection, actor.employeeNumber)) return facts;
    if (
      facts.employeeNumber &&
      (await repository.isSameDepartment(connection, {
        actorEmployeeNumber: actor.employeeNumber,
        subjectEmployeeNumber: facts.employeeNumber,
      })) &&
      (await holds(actor.userId, VIEW))
    ) {
      return facts;
    }
    throw forbidden();
  }

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

    get(actor, headerId) {
      return read(async (connection) => {
        await authorizeRecord(connection, actor, headerId);
        return loadDetail(connection, headerId);
      });
    },

    async update(actor, headerId, body) {
      const common = headerBinds(body);
      return withTransaction(POOLS.LOW, async (connection) => {
        const facts = await authorizeRecord(connection, actor, headerId);
        if (facts.requestStatus !== 'DRAFT') throw notDraft('updated');
        const changed = await repository.updateHeader(connection, {
          ...common,
          headerId,
          updatedBy: actor.userId,
        });
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

    async remove(actor, headerId) {
      return withTransaction(POOLS.LOW, async (connection) => {
        const facts = await authorizeRecord(connection, actor, headerId);
        if (facts.requestStatus !== 'DRAFT') throw notDraft('deleted');
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
