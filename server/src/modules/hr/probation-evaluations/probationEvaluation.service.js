import { randomUUID } from 'node:crypto';
import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../../database/oracle.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { parsePermission } from '../../access-control/authorization.service.js';
import * as defaultRepository from './probationEvaluation.repository.js';
import {
  evaluationResult,
  fromStoredDate,
  isEditable,
  ratingTotal,
  submitProblems,
  toStoredDate,
} from './probationEvaluation.rules.js';
import { FORM_TYPES } from './probationEvaluation.validation.js';

const VIEW = parsePermission('HR.PROBATION_EVALUATIONS', 'VIEW');

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
const notEditable = () =>
  new AppError(
    409,
    'PROBATION_EVALUATION_NOT_DRAFT',
    'Only draft or rejected probation evaluations can be updated',
  );
const invalid = (details) =>
  new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details);
const notInHierarchy = () =>
  new AppError(403, 'FORBIDDEN', 'The employee is not in your reporting hierarchy.');

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

  /**
   * The lines of a new evaluation: the criteria of its form type, in order, each with the rating
   * sent at the same position (blank = 0, as legacy). Criterion texts never come from the client.
   */
  async function criteriaLines(connection, formType, ratings) {
    const criteria = await repository.findCriteria(connection, formType);
    if (!criteria.length) {
      throw new AppError(
        422,
        'PROBATION_CRITERIA_UNAVAILABLE',
        'The criteria of this form type are not available.',
      );
    }
    if (ratings.length > criteria.length) {
      throw invalid([{ field: 'lines', message: 'More ratings than criteria' }]);
    }
    return criteria.map((criterion, index) => ({
      ...criterion,
      rating: ratings[index]?.rating ?? 0,
    }));
  }

  async function loadDetail(connection, headerId) {
    const header = await repository.findHeader(connection, headerId);
    if (!header) throw notFound();
    const lines = await repository.listLines(connection, headerId);
    const totalRating = ratingTotal(lines);
    return {
      ...header,
      formDate: fromStoredDate(header.formDate),
      totalRating,
      evaluationResult: evaluationResult(totalRating),
      lines,
    };
  }

  return {
    formTypes: () => ({ formTypes: [...FORM_TYPES] }),

    criteria: (formType) =>
      read(async (connection) => ({
        formType,
        criteria: await repository.findCriteria(connection, formType),
      })),

    /**
     * The legacy save of a new evaluation (Probation_Model::add_form_data): DRAFT, the form type's
     * criteria, Comments / Suggestion / evaluation period / person ID stored as '-' and the grade
     * as 0 (none of them is filled by the legacy create form). The employee must be one the legacy
     * select offers (the actor's hierarchy); number, name, job title and department are read from
     * the employee master. Prepared by is the signed-in user; the total is computed.
     */
    async create(actor, body) {
      return withTransaction(POOLS.LOW, async (connection) => {
        const subject = await repository.findHierarchyEmployee(connection, {
          employeeNumber: actor.employeeNumber,
          subjectNumber: body.employeeNumber,
        });
        if (!subject) throw notInHierarchy();
        const details = await repository.findEmployeeDetails(connection, {
          empName: subject.fullName,
          employeeNumber: actor.employeeNumber,
        });
        const lines = await criteriaLines(connection, body.formType, body.lines);
        const uuid = randomUUID();
        const requestor = await repository.findRequestor(connection, actor.employeeNumber);
        // HEADER_ID and LINE_ID come from the tables' identity columns (RETURNING INTO).
        const headerId = await repository.insertHeader(connection, {
          // FORM_DATE: the joining date, as entered (legacy prf_date); blank is NULL.
          formDate: toStoredDate(body.formDate),
          empId: '-',
          grade: 0,
          evaluationPeriod: '-',
          formType: body.formType,
          totalRating: ratingTotal(lines),
          comment: '-',
          comments: '-',
          employeeName: subject.fullName,
          jobTitle: text(details?.job?.name),
          department: text(details?.dept?.name),
          employeeNumber: subject.employeeNumber,
          fromDate: body.fromDate,
          toDate: body.toDate,
          uuid,
          userName: text(requestor?.fullName),
          userMail: text(requestor?.emailAddress),
          createdBy: actor.userId,
        });
        if (!headerId) {
          throw new AppError(
            500,
            'PROBATION_EVALUATION_INSERT_FAILED',
            'Probation evaluation was not created',
          );
        }
        for (const line of lines) {
          await repository.insertLine(connection, {
            headerId,
            rating: line.rating,
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
      const { total, items } = await read((connection) =>
        repository.listEvaluations(connection, {
          limit: pageSize,
          offset: (page - 1) * pageSize,
          filters: { ...filters, search: searchPattern(search) },
          createdBy,
          sortBy,
          sortDir,
        }),
      );
      return {
        total,
        items: items.map((item) => ({
          ...item,
          formDate: fromStoredDate(item.formDate),
          evaluationResult: evaluationResult(item.totalRating),
        })),
      };
    },

    get(actor, headerId) {
      return read(async (connection) => {
        await authorizeRecord(connection, actor, headerId);
        return loadDetail(connection, headerId);
      });
    },

    /**
     * The legacy edit save (prf_uplines.php): Comments, Suggestion and every criterion's 1–5
     * rating are required and are all that is saved, with the computed total. The status is kept.
     * Inprocess and Approved evaluations are read only.
     */
    async update(actor, headerId, body) {
      return withTransaction(POOLS.LOW, async (connection) => {
        const facts = await authorizeRecord(connection, actor, headerId);
        if (!isEditable(facts.requestStatus)) throw notEditable();
        const stored = await repository.listLines(connection, headerId);
        const ratings = new Map(body.lines.map((line) => [String(line.lineId), line.rating]));
        if (
          ratings.size !== stored.length ||
          stored.some((line) => !ratings.has(String(line.lineId)))
        ) {
          throw invalid([{ field: 'lines', message: 'Rate every criterion of the evaluation' }]);
        }
        const lines = stored.map((line) => ({ ...line, rating: ratings.get(String(line.lineId)) }));
        const problems = submitProblems({ comment: body.comment, comments: body.comments, lines });
        if (problems.length) throw invalid(problems);
        const changed = await repository.updateHeader(connection, {
          headerId,
          totalRating: ratingTotal(lines),
          comment: body.comment,
          comments: body.comments,
          updatedBy: actor.userId,
        });
        if (!changed) throw notFound();
        for (const line of lines) {
          const updated = await repository.updateLine(connection, {
            headerId,
            lineId: line.lineId,
            rating: line.rating,
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

    // The actor is identified by employee number: XX_DIGI_EMP_MASTER.USER_ID is the legacy EBS ID.
    employees(actor, { search } = {}) {
      return read((connection) =>
        repository.listEmployees(connection, { employeeNumber: actor.employeeNumber, search }),
      );
    },

    requestor(actor) {
      return read((connection) => repository.findRequestor(connection, actor.employeeNumber));
    },

    // Legacy getEmpDetails, limited to the employees the select offers (the actor's hierarchy).
    async employeeDetails(actor, empName) {
      const details = await read(async (connection) => {
        const subject = await repository.findHierarchyEmployee(connection, {
          employeeNumber: actor.employeeNumber,
          subjectName: empName,
        });
        if (!subject) throw notInHierarchy();
        return repository.findEmployeeDetails(connection, {
          empName,
          employeeNumber: actor.employeeNumber,
        });
      });
      if (!details) throw notFound('Employee');
      const start = toDateTime(details.hire?.startDate);
      const yearsInCompany =
        start === null ? null : Math.floor(Math.abs(Date.now() - start) / 31536000000);
      return { ...details, yearsInCompanay: yearsInCompany };
    },
  };
}
