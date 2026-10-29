import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../../database/oracle.js';
import {
  PersonalStatusError,
  validateWrite,
  parseListing,
  positiveId,
  employeeNumber,
} from './personalStatusChange.validation.js';
import { createPersonalStatusRepository } from './personalStatusChange.repository.js';

const defaultRepository = createPersonalStatusRepository();

const notFound = () =>
  new PersonalStatusError(404, 'NOT_FOUND', 'Personnel record change not found');

const noEmployee = () =>
  new PersonalStatusError(404, 'EMP_NOT_FOUND', 'No Data Available for given Employee Number');

const group = (row, prefix) => ({
  position: row[`${prefix}_POSITION`] ?? null,
  basicSal: row[`${prefix}_BASIC_SAL`] ?? null,
  houseAll: row[`${prefix}_HOUSE_ALL`] ?? null,
  transAll: row[`${prefix}_TRANS_ALL`] ?? null,
  otherAll: row[`${prefix}_OTHER_ALL`] ?? null,
  communAll: row[`${prefix}_COMMUN_ALL`] ?? null,
  carAll: row[`${prefix}_CAR_ALL`] ?? null,
  total: row[`${prefix}_TOTAL`] ?? null,
  maritalStatus: row[`${prefix}_MARITAL_STATUS`] ?? null,
  grade: row[`${prefix}_GRADE`] ?? null,
  level: row[`${prefix}_LEVEL`] ?? null,
});

export const mapRecord = (row) =>
  row && {
    headerId: row.HEADER_ID,
    refNo: row.REF_NO,
    formDate: row.FORM_DATE_ISO,
    arbDate: row.ARB_DATE,
    effectiveDate: row.EFFECTIVE_DATE_ISO,

    empNo: row.EMP_NO,
    empName: row.EMP_NAME,
    nationality: row.NATIONALITY,
    section: row.SECTION,
    department: row.DEPT,
    startDate: row.START_DATE_ISO,

    old: group(row, 'OLD'),
    new: group(row, 'NEW'),

    remarks: row.REMARKS,
    views: row.VIEWS,

    status: row.STATUS?.toUpperCase() ?? null,

    signatures: {
      hrAdmin: row.HR_ADMIN,
      hrAdminSign: row.HR_ADMIN_SIGN_ISO,
      vp: row.VP,
      vpSign: row.VP_SIGN_ISO,
      president: row.PRESIDENT,
      presidentSign: row.PRESIDENT_SIGN_ISO,
    },

    createdBy: row.CREATED_BY,
    createdAt: row.CREATED_AT_ISO,

    updatedBy: row.UPDATED_BY,
    updatedAt: row.UPDATED_AT_ISO,
  };

const mapList = (row) => ({
  headerId: row.HEADER_ID,
  refNo: row.REF_NO,
  formDate: row.FORM_DATE_ISO,
  effectiveDate: row.EFFECTIVE_DATE_ISO,

  empNo: row.EMP_NO,
  empName: row.EMP_NAME,

  position: row.NEW_POSITION,
  section: row.SECTION,
  department: row.DEPT,

  oldTotal: row.OLD_TOTAL,
  newTotal: row.NEW_TOTAL,

  remarks: row.REMARKS,
  status: row.STATUS?.toUpperCase() ?? null,
  requestor: row.REQUESTOR,
});

const oldFromMaster = (master) => {
  const allowances = [
    master.BASIC_SALARY,
    master.HOUSING_ALLOWANCE,
    master.TRANSPORTATION_ALLOWANCE,
    master.OTHER_ALLOWANCE,
    master.COMMUNICATION_ALLOWANCE,
    master.CAR_ALLOWANCE,
  ];

  return {
    position: master.JOB_NAME,
    basicSal: master.BASIC_SALARY,
    houseAll: master.HOUSING_ALLOWANCE,
    transAll: master.TRANSPORTATION_ALLOWANCE,
    otherAll: master.OTHER_ALLOWANCE,
    communAll: master.COMMUNICATION_ALLOWANCE,
    carAll: master.CAR_ALLOWANCE,
    total: allowances.reduce((sum, amount) => sum + Math.round(Number(amount ?? 0) * 100), 0) / 100,
    maritalStatus: master.MARITAL_STATUS,
    grade: null,
    level: null,
  };
};

const toPrefill = (source, empNo, old, branch) => ({
  branch,
  empNo,

  empName: source.FULL_NAME,
  nationality: source.NATIONALITY,
  section: source.DIVISION,
  department: source.DEPARTMENT_NAME,
  startDate: source.JOINING_DATE_ISO,

  old,

  new: {
    position: old.position,
    maritalStatus: old.maritalStatus,
  },
});

const idFromAuth = (auth) => {
  const id = auth?.userId ?? auth?.user?.id ?? auth?.id;

  if (!/^[1-9]\d{0,18}$/.test(String(id))) {
    throw new PersonalStatusError(401, 'UNAUTHENTICATED', 'Authentication is required');
  }

  return String(id);
};

export const createPersonalStatusService = ({
  repository = defaultRepository,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
} = {}) => {
  const read = (work) => withConnection(POOLS.LOW, work);
  const write = (work) => withTransaction(POOLS.LOW, work);

  const autoFillOnConnection = async (connection, empNo) => {
    const latest = await repository.latest(connection, empNo);

    // Branch B: Employee already has a previous request.
    if (latest) {
      const old = group(latest, 'NEW');

      // README §6.3:
      // Previous-request branch does not supply marital status.
      old.maritalStatus = null;

      return toPrefill(
        {
          FULL_NAME: latest.EMP_NAME,
          NATIONALITY: latest.NATIONALITY,
          DIVISION: latest.SECTION,
          DEPARTMENT_NAME: latest.DEPT,
          JOINING_DATE_ISO: latest.START_DATE_ISO,
        },
        empNo,
        old,
        'previousRequest',
      );
    }

    // Branch A: No previous request.
    const master = await repository.master(connection, empNo);

    if (!master) {
      throw noEmployee();
    }

    return toPrefill(master, empNo, oldFromMaster(master), 'employeeMaster');
  };

  const checkWrite = async (connection, body) => {
    const values = validateWrite(body);

    try {
      await autoFillOnConnection(connection, values.empNo);
    } catch (error) {
      if (error.code === 'EMP_NOT_FOUND') {
        throw new PersonalStatusError(400, 'EMP_NOT_FOUND', 'Validation failed');
      }

      throw error;
    }

    const positionExists = await repository.positionExists(connection, values.newPosition);

    if (!positionExists) {
      throw new PersonalStatusError(400, 'POSITION_INVALID', 'Validation failed');
    }

    return values;
  };

  return {
    // CREATE
    async create(body, auth) {
      const createdBy = idFromAuth(auth);

      // Retry on Oracle ORA-00001.
      // Each attempt uses a fresh connection and transaction.
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          return await write(async (connection) => {
            const values = await checkWrite(connection, body);

            const headerId = await repository.nextId(connection);

            const refNo = `${String(headerId).padStart(4, '0')}-${values.section ?? ''}`;

            await repository.insert(connection, headerId, refNo, values, createdBy);

            const row = await repository.read(headerId, connection);

            return mapRecord(row);
          });
        } catch (error) {
          if (error.errorNum === 1 && attempt < 4) {
            continue;
          }

          throw error;
        }
      }
    },

    // READ
    async read(rawId) {
      const headerId = positiveId(rawId);

      return read(async (connection) => {
        const row = await repository.read(headerId, connection);

        if (!row) {
          throw notFound();
        }

        return mapRecord(row);
      });
    },

    // UPDATE
    async update(rawId, body, auth) {
      const headerId = positiveId(rawId);
      const updatedBy = idFromAuth(auth);

      return write(async (connection) => {
        const lockedRow = await repository.lockRow(connection, headerId);

        if (!lockedRow) {
          throw notFound();
        }

        const values = await checkWrite(connection, body);

        const result = await repository.update(connection, headerId, values, updatedBy);

        if (!result.rowsAffected) {
          throw notFound();
        }

        const row = await repository.read(headerId, connection);

        return mapRecord(row);
      });
    },

    // DELETE
    async delete(rawId) {
      const headerId = positiveId(rawId);

      return write(async (connection) => {
        const row = await repository.lockRow(connection, headerId);

        if (!row) {
          throw notFound();
        }

        const result = await repository.delete(connection, headerId);

        if (!result.rowsAffected) {
          throw notFound();
        }

        return { headerId };
      });
    },

    // LISTING
    async list(query) {
      const filters = parseListing(query);

      const { total, rows } = await read((connection) => repository.list(connection, filters));

      return {
        meta: {
          page: filters.page,
          pageSize: filters.pageSize,
          total,
          sort: filters.sort,
          order: filters.order,
        },

        rows: rows.map(mapList),
      };
    },

    // EMPLOYEE DATALIST
    employees: () => read((connection) => repository.employees(connection)),

    // POSITION DATALIST
    positions: () => read((connection) => repository.positions(connection)),

    // EMPLOYEE AUTO-FILL
    async autoFill(rawEmpNo) {
      const empNo = employeeNumber(rawEmpNo);

      return read((connection) => autoFillOnConnection(connection, empNo));
    },
  };
};
