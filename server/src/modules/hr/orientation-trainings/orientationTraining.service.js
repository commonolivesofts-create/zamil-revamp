import { randomUUID } from 'node:crypto';
import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../../database/oracle.js';
import { AppError } from '../../../shared/errors/AppError.js';
import { parsePermission } from '../../access-control/authorization.service.js';
import * as defaultRepository from './orientationTraining.repository.js';
import { SKILLS_BY_TYPE } from './orientationTraining.validation.js';
import {
  employeeType,
  isEditable,
  legacyTime,
  orientationDays,
  orientationPeriod,
} from './orientationTraining.rules.js';

const blankToNull = (value) =>
  value === undefined || value === null || value === '' ? null : value;
const notFound = (what = 'Orientation training') =>
  new AppError(404, 'RESOURCE_NOT_FOUND', `${what} was not found`);
const conflict = (action = 'deleted') =>
  new AppError(
    409,
    'ORIENTATION_TRAINING_NOT_DRAFT',
    action === 'deleted'
      ? 'Only draft orientation trainings can be deleted'
      : `Only draft or rejected orientation trainings can be ${action}`,
  );
const forbidden = () =>
  new AppError(403, 'FORBIDDEN', 'You do not have permission for this action.');
const VIEW = parsePermission('HR.ORIENTATION_TRAININGS', 'VIEW');
const insertionFailed = () =>
  new AppError(500, 'ORIENTATION_TRAINING_INSERT_FAILED', 'Orientation training was not created');

export function createOrientationTrainingService({
  repository = defaultRepository,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
  // `authorizationService.holds`; denies by default so a missing wiring never widens access.
  holds = async () => false,
}) {
  const read = (work) => withConnection(POOLS.LOW, work);

  /**
   * The record's tables. The two variants number their headers independently, so legacy opens a
   * record as form/{id}/{Y|N}: an explicit flag wins. Otherwise the registry
   * (XXZP_NHT_MASTER_FLAG), and for legacy shared rows that were never registered, the table that
   * holds the ID (PRODUCTION when both or neither do, as legacy checkFlagStatus).
   */
  async function selectedTable(connection, headerId, flag) {
    if (flag) return repository.TABLES[flag];
    const tableName = await repository.findTableName(connection, headerId);
    if (tableName) return tableName === 'SHARED' ? repository.TABLES.Y : repository.TABLES.N;
    const shared = await repository.headerExists(connection, repository.TABLES.Y, headerId);
    const production = await repository.headerExists(connection, repository.TABLES.N, headerId);
    return shared && !production ? repository.TABLES.Y : repository.TABLES.N;
  }

  /**
   * Record-level access by ID: the creator, an HR user (XXZP_HR lookup, as for list scoping), or
   * a user in the trained employee's department who holds HR.ORIENTATION_TRAININGS:VIEW.
   * Returns the record's table and header; unknown IDs are 404 and other records 403.
   */
  async function authorizeRecord(connection, actor, headerId, flag) {
    const table = await selectedTable(connection, headerId, flag);
    const header = await repository.findHeader(connection, table, headerId);
    if (!header) throw notFound();
    if (String(header.createdBy) === String(actor.userId)) return { table, header };
    if (await repository.isHrUser(connection, actor.userId)) return { table, header };
    if (
      header.empNo &&
      (await repository.isSameDepartment(connection, {
        actorEmployeeNumber: actor.employeeNumber,
        subjectEmployeeNumber: header.empNo,
      })) &&
      (await holds(actor.userId, VIEW))
    ) {
      return { table, header };
    }
    throw forbidden();
  }

  /**
   * The employee of a request (legacy getEmpNum): HR may choose any current employee, any other
   * user only themselves. Name, section, division, position, type, start date and person ID are
   * read from the employee master, never from the body (legacy fills them read only).
   */
  async function requestEmployee(connection, actor, empNo) {
    if (
      String(empNo) !== String(actor.employeeNumber) &&
      !(await repository.isHrUser(connection, actor.userId))
    ) {
      throw forbidden();
    }
    const employee = await repository.findEmployee(connection, empNo);
    if (!employee) throw notFound('Current employee');
    return employee;
  }

  const employeeColumns = (employee) => ({
    empNo: employee.empNo,
    section: employee.section,
    empname: employee.empname,
    personId: employee.personId,
    division: employee.division,
    position: employee.position,
    empType: employeeType(employee.empType),
    startDate: employee.startDate || null,
  });

  // Legacy row: Training, Department Head, From/To Date, Time From/To and Remark as entered (all
  // optional); Orientation Days and Orientation Time computed as the legacy script does.
  function lineBinds(headerId, actorId, item) {
    const fromDate = blankToNull(item.fromDate);
    const toDate = blankToNull(item.toDate);
    const timeFrom = legacyTime(blankToNull(item.timeFrom));
    const timeTo = legacyTime(blankToNull(item.timeTo));
    const days = orientationDays(fromDate, toDate);
    return {
      headerId,
      department: item.department,
      departmentHead: blankToNull(item.departmentHead),
      orientationPeriod: orientationPeriod(timeFrom, timeTo),
      timeFrom,
      timeTo,
      remarks: blankToNull(item.remarks),
      createdBy: actorId,
      fromDate,
      toDate,
      orientationDays: days === null ? null : String(days),
    };
  }

  async function replaceLines(connection, table, headerId, actorId, lines) {
    await repository.deleteLines(connection, table, headerId);
    for (const item of lines) {
      await repository.insertLine(connection, table, lineBinds(headerId, actorId, item));
    }
  }

  return {
    async create(actor, body) {
      return withTransaction(POOLS.LOW, async (connection) => {
        const employee = await requestEmployee(connection, actor, body.empNo);
        const flag = await repository.resolveFlag(connection, body.empNo);
        if (!flag) throw notFound('Current employee assignment');
        const table = repository.TABLES[flag];
        const uuid = randomUUID();
        // Scheduled By: the signed-in user's name (legacy returnRec; "IT" when none is found).
        const actorName =
          (await repository.findActorName(connection, actor.employeeNumber)) || 'IT';
        // HEADER_ID comes from the header table's identity column (RETURNING INTO).
        const headerId = await repository.insertHeader(connection, table, {
          uuid,
          ...employeeColumns(employee),
          // Legacy copies From into the read-only To.
          fromOrient: body.fromOrient,
          toOrient: body.fromOrient,
          orientationBy: actorName,
          createdBy: actor.userId,
        });
        if (!headerId) throw insertionFailed();
        const reference = await repository.setReference(
          connection,
          table,
          headerId,
          employee.division,
        );
        await repository.registerFlag(connection, headerId, table.tableName);
        for (const item of body.lines) {
          await repository.insertLine(connection, table, lineBinds(headerId, actor.userId, item));
        }
        return { headerId, flag, reference };
      });
    },

    async list(
      actor,
      { flag, page, pageSize, search, status, empNo, empType, dateFrom, dateTo, sortBy, sortDir },
    ) {
      const table = repository.TABLES[flag];
      const isHr = await read((connection) => repository.isHrUser(connection, actor.userId));
      const filters = {
        ...(search
          ? { search: `%${search.toUpperCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%` }
          : {}),
        status,
        empNo,
        empType,
        dateFrom,
        dateTo,
      };
      // Legacy newhiretrain_list: HR sees every request of the variant, others their own.
      return read((connection) =>
        repository.listTrainings(connection, table, {
          filters,
          createdBy: isHr ? null : actor.userId,
          limit: pageSize,
          offset: (page - 1) * pageSize,
          sortBy,
          sortDir,
        }),
      );
    },

    async get(actor, headerId, flag) {
      return read(async (connection) => {
        const { table, header } = await authorizeRecord(connection, actor, headerId, flag);
        const lines = await repository.listLines(connection, table, headerId);
        return { ...header, flag: table === repository.TABLES.Y ? 'Y' : 'N', lines };
      });
    },

    async update(actor, headerId, body, flag) {
      return withTransaction(POOLS.LOW, async (connection) => {
        const { table, header } = await authorizeRecord(connection, actor, headerId, flag);
        if (!isEditable(header.rawStatus)) throw conflict('updated');
        const employee = await requestEmployee(connection, actor, body.empNo);
        // Saving sets the status back to Draft (legacy), so a rejected request can be re-submitted.
        const changed = await repository.updateHeader(connection, table, {
          headerId,
          ...employeeColumns(employee),
          fromOrient: body.fromOrient,
          toOrient: body.fromOrient,
          // Scheduled By keeps its saved value.
          orientationBy: header.orientationBy || 'IT',
          updatedBy: actor.userId,
        });
        if (!changed) throw notFound();
        await replaceLines(connection, table, headerId, actor.userId, body.lines);
        return { headerId, flag: table === repository.TABLES.Y ? 'Y' : 'N' };
      });
    },

    async remove(actor, headerId, flag) {
      return withTransaction(POOLS.LOW, async (connection) => {
        const { table, header } = await authorizeRecord(connection, actor, headerId, flag);
        if (header.status !== 'Draft') throw conflict();
        await repository.deleteLines(connection, table, headerId);
        if (!(await repository.deleteHeader(connection, table, headerId))) throw notFound();
        await repository.deleteFlag(connection, headerId);
        return { headerId, deleted: true };
      });
    },

    async removeLine(actor, headerId, lineId, flag) {
      return withTransaction(POOLS.LOW, async (connection) => {
        const { table, header } = await authorizeRecord(connection, actor, headerId, flag);
        if (!isEditable(header.rawStatus)) throw conflict('changed');
        if (!(await repository.deleteLine(connection, table, headerId, lineId))) {
          throw notFound('Orientation training line');
        }
        return { headerId, lineId, deleted: true };
      });
    },

    async flag(empNo) {
      const flag = await read((connection) => repository.resolveFlag(connection, empNo));
      if (!flag) throw notFound('Current employee assignment');
      return { flag, tableName: repository.TABLES[flag].tableName };
    },

    async employees(actor, search = '') {
      return read(async (connection) => {
        const isHr = await repository.isHrUser(connection, actor.userId);
        return repository.listEmployees(connection, {
          search,
          employeeNumber: isHr ? null : String(actor.employeeNumber ?? ''),
        });
      });
    },

    managers() {
      return read((connection) => repository.listManagers(connection));
    },

    async employeeDetails(actor, empNo) {
      const employee = await read((connection) => requestEmployee(connection, actor, empNo));
      return { ...employee, empType: employeeType(employee.empType) };
    },

    // Legacy generateSkillTable: the training rows of the employee's type.
    skills(empType) {
      const type = employeeType(empType);
      return { empType: type, skills: [...SKILLS_BY_TYPE[type]] };
    },
  };
}
