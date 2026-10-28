import { randomUUID } from 'node:crypto';
import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../../database/oracle.js';
import { AppError } from '../../../shared/errors/AppError.js';
import * as defaultRepository from './orientationTraining.repository.js';
import { SKILLS_BY_TYPE } from './orientationTraining.validation.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const legacyText = (value) => (value === undefined || value === null || value === '' ? '-' : value);
const legacyDate = (value) => {
  if (!value) return '01-JAN-00';
  const [year, month, day] = value.split('-');
  return `${day}-${MONTHS[Number(month) - 1]}-${year.slice(-2)}`;
};
const notFound = (what = 'Orientation training') =>
  new AppError(404, 'RESOURCE_NOT_FOUND', `${what} was not found`);
const conflict = () =>
  new AppError(
    409,
    'ORIENTATION_TRAINING_NOT_DRAFT',
    'Only draft orientation trainings can be deleted',
  );
const insertionFailed = () =>
  new AppError(500, 'ORIENTATION_TRAINING_INSERT_FAILED', 'Orientation training was not created');

function periodFromTimes(from, to) {
  const toMinutes = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };
  const hours = Math.max(0, toMinutes(to) - toMinutes(from)) / 60;
  return `${hours.toFixed(2)} Hrs`;
}

export function createOrientationTrainingService({
  repository = defaultRepository,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
}) {
  const read = (work) => withConnection(POOLS.LOW, work);

  async function selectedTable(connection, headerId) {
    const tableName = await repository.findTableName(connection, headerId);
    return tableName === 'SHARED' ? repository.TABLES.Y : repository.TABLES.N;
  }

  async function lineBinds(connection, table, headerId, actorId, item) {
    return {
      lineId: await repository.generateLineId(connection, table, headerId),
      headerId,
      department: item.department,
      departmentHead: item.departmentHead,
      orientationPeriod: legacyText(
        item.orientationPeriod || periodFromTimes(item.timeFrom, item.timeTo),
      ),
      timeFrom: item.timeFrom,
      timeTo: item.timeTo,
      remarks: legacyText(item.remarks),
      createdBy: actorId,
      fromDate: legacyDate(item.fromDate),
      toDate: legacyDate(item.toDate),
      orientationDays: item.orientationDays ?? 0,
    };
  }

  async function replaceLines(connection, table, headerId, actorId, lines) {
    await repository.deleteLines(connection, table, headerId);
    for (const item of lines) {
      await repository.insertLine(
        connection,
        table,
        await lineBinds(connection, table, headerId, actorId, item),
      );
    }
  }

  return {
    async create(actor, body) {
      return withTransaction(POOLS.LOW, async (connection) => {
        const employee = await repository.findEmployee(connection, body.empNo);
        if (!employee) throw notFound('Current employee');
        const flag = await repository.resolveFlag(connection, body.empNo);
        if (!flag) throw notFound('Current employee assignment');
        const table = repository.TABLES[flag];
        const expectedHeaderId = await repository.generateHeaderId(connection, table);
        const uuid = randomUUID();
        const actorName = await repository.findActorName(connection, actor.userId);
        await repository.insertHeader(connection, table, {
          uuid,
          empNo: body.empNo,
          section: body.section,
          empname: body.empname,
          fromOrient: legacyDate(body.fromOrient),
          toOrient: legacyDate(body.toOrient),
          startDate: legacyDate(body.startDate),
          orientationBy: legacyText(body.orientationBy || actorName),
          createdBy: actor.userId,
          personId: body.personId,
          division: body.division,
          position: body.position,
          empType: body.type,
        });
        const headerId = await repository.findHeaderIdByUuid(connection, table, uuid);
        if (!headerId) throw insertionFailed();
        if (String(headerId) !== String(expectedHeaderId)) {
          throw new AppError(
            409,
            'ORIENTATION_TRAINING_ID_CONFLICT',
            'The orientation training identifier changed during creation; retry the request',
          );
        }
        const reference = await repository.setReference(connection, table, headerId, body.division);
        await repository.registerFlag(connection, headerId, table.tableName);
        for (const item of body.lines) {
          await repository.insertLine(
            connection,
            table,
            await lineBinds(connection, table, headerId, actor.userId, item),
          );
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

    async get(headerId) {
      return read(async (connection) => {
        const table = await selectedTable(connection, headerId);
        const header = await repository.findHeader(connection, table, headerId);
        if (!header) throw notFound();
        const lines = await repository.listLines(connection, table, headerId);
        return { ...header, flag: table === repository.TABLES.Y ? 'Y' : 'N', lines };
      });
    },

    async update(actor, headerId, body) {
      return withTransaction(POOLS.LOW, async (connection) => {
        const table = await selectedTable(connection, headerId);
        if (!(await repository.findStatus(connection, table, headerId))) throw notFound();
        const employee = await repository.findEmployee(connection, body.empNo);
        if (!employee) throw notFound('Current employee');
        const actorName = await repository.findActorName(connection, actor.userId);
        const changed = await repository.updateHeader(connection, table, {
          headerId,
          empNo: body.empNo,
          section: body.section,
          empname: body.empname,
          fromOrient: legacyDate(body.fromOrient),
          toOrient: legacyDate(body.toOrient),
          startDate: legacyDate(body.startDate),
          orientationBy: legacyText(body.orientationBy || actorName),
          personId: body.personId,
          division: body.division,
          position: body.position,
          empType: body.type,
          updatedBy: actor.userId,
        });
        if (!changed) throw notFound();
        await replaceLines(connection, table, headerId, actor.userId, body.lines);
        return { headerId };
      });
    },

    async remove(headerId) {
      return withTransaction(POOLS.LOW, async (connection) => {
        const tableName = await repository.findTableName(connection, headerId);
        const table = tableName === 'SHARED' ? repository.TABLES.Y : repository.TABLES.N;
        const status = await repository.findStatus(connection, table, headerId);
        if (!status) throw notFound();
        if (status !== 'Draft') throw conflict();
        await repository.deleteLines(connection, table, headerId);
        if (!(await repository.deleteHeader(connection, table, headerId))) throw notFound();
        await repository.deleteFlag(connection, headerId);
        return { headerId, deleted: true };
      });
    },

    async removeLine(headerId, lineId) {
      return withTransaction(POOLS.LOW, async (connection) => {
        const table = await selectedTable(connection, headerId);
        if (!(await repository.findStatus(connection, table, headerId))) throw notFound();
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

    async employees(actor) {
      return read(async (connection) => {
        const isHr = await repository.isHrUser(connection, actor.userId);
        return repository.listEmployees(connection, { userId: actor.userId, isHr });
      });
    },

    managers() {
      return read((connection) => repository.listManagers(connection));
    },

    async employeeDetails(empNo) {
      const employee = await read((connection) => repository.findEmployee(connection, empNo));
      if (!employee) throw notFound('Current employee');
      return employee;
    },

    skills(empType) {
      const type = ['Supervisor', 'Manager', 'Employee'].includes(empType) ? empType : 'plant';
      return { empType: type, skills: [...SKILLS_BY_TYPE[type]] };
    },
  };
}
