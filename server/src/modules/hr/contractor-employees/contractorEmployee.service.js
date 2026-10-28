import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../../database/oracle.js';
import { AppError } from '../../../shared/errors/AppError.js';
import * as defaultRepository from './contractorEmployee.repository.js';

const notFound = (what = 'Contractor employee') =>
  new AppError(404, 'RESOURCE_NOT_FOUND', `${what} was not found`);
const invalidReference = (what) => new AppError(400, 'INVALID_REFERENCE', `${what} was not found`);
const duplicate = (error) => error?.errorNum === 1 || error?.code === 'ORA-00001';
const asText = (value) =>
  value === undefined || value === null || value === '' ? null : String(value);
const flag = (value) => (value ? 'on' : null);

function employeeBinds(body, contractor, job, boss, audit) {
  return {
    ...audit,
    employeeName: body.employee_name,
    division: body.division,
    iqamah: body.iqamah,
    department: body.department,
    prodDep: body.department === 'Production' ? asText(body.prod_dep) : null,
    directBoss: boss.fullName,
    directBossId: boss.personId,
    job: job.jobId,
    jobTitle: job.jobTitle,
    place: asText(body.place),
    replacement: asText(body.replacement),
    rate: body.rate,
    startDate: body.start_date,
    endDate: body.end_date ?? null,
    status: body.status,
    ajeer: flag(body.ajeer),
    sfda: flag(body.sfda),
    blacklist: flag(body.blacklist),
    remark: asText(body.remark),
    conNumber: contractor.conNumber,
    conName: contractor.conName,
  };
}

export function createContractorEmployeeService({
  repository = defaultRepository,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
}) {
  const read = (work) => withConnection(POOLS.LOW, work);

  async function resolveReferences(connection, body, { lock = false } = {}) {
    const contractor = lock
      ? await repository.lockContractor(connection, body.con_number)
      : await repository.findContractor(connection, body.con_number);
    if (!contractor) throw invalidReference('Contractor');
    const job = await repository.findJob(connection, body.job);
    const boss = await repository.findBoss(connection, body.direct_boss_id);
    if (!job) throw invalidReference('Job');
    if (!boss) throw invalidReference('Direct boss');
    return { contractor, job, boss };
  }

  async function insertOnce(actor, body) {
    return withTransaction(POOLS.LOW, async (connection) => {
      const { contractor, job, boss } = await resolveReferences(connection, body, { lock: true });
      const empId = await repository.generateEmployeeId(connection);
      const employeeNumber = await repository.generateEmployeeNumber(
        connection,
        contractor.conNumber,
      );
      if (
        empId === null ||
        empId === undefined ||
        employeeNumber === null ||
        employeeNumber === undefined
      ) {
        throw new AppError(
          500,
          'ID_GENERATION_FAILED',
          'Employee identifiers could not be generated',
        );
      }
      await repository.insertEmployee(connection, {
        ...employeeBinds(body, contractor, job, boss, {
          empId,
          employeeNumber,
          createdBy: actor.userId,
        }),
      });
      return { emp_id: String(empId) };
    });
  }

  return {
    async list(_actor, query) {
      const filters = {
        division: !query.division || query.division === 'ALL' ? null : query.division,
        department: !query.department || query.department === 'ALL' ? null : query.department,
        contractorNumber: query.contractor_number || null,
        status: !query.status || query.status === 'ALL' ? null : query.status,
        dateFrom: query.date_from || null,
        dateTo: query.date_to || null,
      };
      return read((connection) =>
        repository.listEmployees(connection, {
          filters,
          limit: query.limit,
          offset: (query.page - 1) * query.limit,
          sort: query.sort,
          order: query.order,
        }),
      );
    },

    async get(empId) {
      const employee = await read((connection) => repository.findEmployee(connection, empId));
      if (!employee) throw notFound();
      return employee;
    },

    create(actor, body) {
      return (async () => {
        try {
          return await insertOnce(actor, body);
        } catch (error) {
          if (!duplicate(error)) throw error;
          try {
            return await insertOnce(actor, body);
          } catch (retryError) {
            if (!duplicate(retryError)) throw retryError;
            throw new AppError(
              409,
              'EMPLOYEE_NUMBER_CONFLICT',
              'Employee identifiers conflicted; retry the request',
            );
          }
        }
      })();
    },

    async update(actor, empId, body) {
      return withTransaction(POOLS.LOW, async (connection) => {
        if (!(await repository.findEmployee(connection, empId))) throw notFound();
        const { contractor, job, boss } = await resolveReferences(connection, body);
        const changed = await repository.updateEmployee(connection, {
          ...employeeBinds(body, contractor, job, boss, { empId, updatedBy: actor.userId }),
        });
        if (!changed) throw notFound();
        return { emp_id: String(empId) };
      });
    },

    async remove(empId) {
      return withTransaction(POOLS.LOW, async (connection) => {
        if (!(await repository.deleteEmployee(connection, empId))) throw notFound();
      });
    },

    async lookup(name) {
      if (name === 'divisions') return repository.listDivisions();
      const method = {
        departments: 'listDepartments',
        contractors: 'listContractors',
        jobs: 'listJobs',
        bosses: 'listBosses',
        sections: 'listSections',
      }[name];
      if (!method) throw new AppError(400, 'VALIDATION_ERROR', 'Unknown lookup name');
      return read((connection) => repository[method](connection));
    },

    async contractorDetails(conNumber) {
      const contractor = await read((connection) =>
        repository.findContractor(connection, conNumber),
      );
      if (!contractor) throw notFound('Contractor');
      return {
        con_name: contractor.conName,
        status: contractor.status,
        rate: contractor.rate,
      };
    },
  };
}
