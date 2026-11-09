import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../../database/oracle.js';
import { parsePermission } from '../../access-control/authorization.service.js';
import {
  PersonalStatusError,
  validateWrite,
  parseListing,
  positiveId,
  employeeNumber,
} from './personalStatusChange.validation.js';
import { createPersonalStatusRepository } from './personalStatusChange.repository.js';
import {
  businessToday,
  hijriDate,
  maritalCode,
  payTotal,
  referenceNumber,
} from './personalStatusChange.rules.js';

const defaultRepository = createPersonalStatusRepository();

const VIEW = parsePermission('HR.PERSONNEL_RECORD_CHANGES', 'VIEW');

const notFound = () =>
  new PersonalStatusError(404, 'NOT_FOUND', 'Personnel record change not found');

const noEmployee = () =>
  new PersonalStatusError(404, 'EMP_NOT_FOUND', 'No Data Available for given Employee Number');

const forbidden = () =>
  new PersonalStatusError(403, 'FORBIDDEN', 'You do not have permission for this action.');

const normalizedPosition = (value) =>
  String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

const notDraft = (action) =>
  new PersonalStatusError(
    409,
    'PERSONNEL_RECORD_CHANGE_NOT_DRAFT',
    `Only draft personnel record changes can be ${action}`,
  );

const group = (row, prefix) => ({
  position: row[`${prefix}_POSITION`] ?? null,
  basicSal: row[`${prefix}_BASIC_SAL`] ?? null,
  houseAll: row[`${prefix}_HOUSE_ALL`] ?? null,
  transAll: row[`${prefix}_TRANS_ALL`] ?? null,
  otherAll: row[`${prefix}_OTHER_ALL`] ?? null,
  communAll: row[`${prefix}_COMMUN_ALL`] ?? null,
  carAll: row[`${prefix}_CAR_ALL`] ?? null,
  total: row[`${prefix}_TOTAL`] ?? null,
  // S or M; legacy rows may hold free text.
  maritalStatus: maritalCode(row[`${prefix}_MARITAL_STATUS`]),
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
  requestor: row.REQUESTOR ?? null,
  pendingAt: row.PENDING_AT ?? null,
});

// Legacy getEmpDetails, first branch: the current master row. OLD_TOTAL is TOTAL_SALARY as stored
// (legacy shows the column, not a sum).
const oldFromMaster = (master) => ({
  position: master.JOB_NAME,
  basicSal: master.BASIC_SALARY,
  houseAll: master.HOUSING_ALLOWANCE,
  transAll: master.TRANSPORTATION_ALLOWANCE,
  otherAll: master.OTHER_ALLOWANCE,
  communAll: master.COMMUNICATION_ALLOWANCE,
  carAll: master.CAR_ALLOWANCE,
  total: master.TOTAL_SALARY ?? null,
  maritalStatus: maritalCode(master.MARITAL_STATUS),
  grade: null,
  level: null,
});

// The revised record of an approved request; a missing NEW_TOTAL is the sum of its six items.
const oldFromRequest = (request) => {
  const old = group(request, 'NEW');
  old.total ??= payTotal(old);
  return old;
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

  // Legacy auto-fill sets only the revised position and family status; revised amounts keep
  // what the form holds (0 on a new form).
  new: {
    position: old.position,
    maritalStatus: old.maritalStatus,
  },
});

// The session actor: application user ID and employee number.
const actorOf = (auth) => {
  const userId = auth?.userId ?? auth?.user?.id ?? auth?.id;

  if (!/^[1-9]\d{0,18}$/.test(String(userId))) {
    throw new PersonalStatusError(401, 'UNAUTHENTICATED', 'Authentication is required');
  }

  const employeeNumberValue = auth?.employeeNumber ?? auth?.user?.employeeNumber ?? null;

  return {
    userId: String(userId),
    employeeNumber: employeeNumberValue === null ? null : String(employeeNumberValue),
  };
};

const snapshotValues = (prefill) => ({
  empName: prefill.empName ?? null,
  nationality: prefill.nationality ?? null,
  section: prefill.section ?? null,
  department: prefill.department ?? null,
  startDate: prefill.startDate ?? null,

  oldPosition: prefill.old.position ?? null,
  oldBasicSal: prefill.old.basicSal ?? null,
  oldHouseAll: prefill.old.houseAll ?? null,
  oldTransAll: prefill.old.transAll ?? null,
  oldOtherAll: prefill.old.otherAll ?? null,
  oldCommunAll: prefill.old.communAll ?? null,
  oldCarAll: prefill.old.carAll ?? null,
  oldTotal: prefill.old.total ?? null,
});

export const createPersonalStatusService = ({
  repository = defaultRepository,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
  // `authorizationService.holds`; denies by default so a missing wiring never widens access.
  holds = async () => false,
} = {}) => {
  const read = (work) => withConnection(POOLS.LOW, work);
  const write = (work) => withTransaction(POOLS.LOW, work);

  /**
   * Legacy getEmpDetails, with its data gaps closed:
   * - the employee's information (name, nationality, section, department, start date) is the
   *   current master row; the latest approved request's snapshot only when there is no current row
   *   (legacy copied the latest request, and some were saved with a blank snapshot);
   * - the current record (position, pay, total, family status) is the revised record of the latest
   *   APPROVED request (legacy branch B took the latest request of any status, so a draft or
   *   rejected proposal became the "current" salary); without one, the master row (branch A);
   * - family status is S or M; when the request has none, the master's.
   */
  const autoFillOnConnection = async (connection, empNo) => {
    const master = await repository.master(connection, empNo);
    const approved = await repository.latest(connection, empNo);

    if (!master && !approved) {
      throw noEmployee();
    }

    const identity = master ?? {
      FULL_NAME: approved.EMP_NAME,
      NATIONALITY: approved.NATIONALITY,
      DIVISION: approved.SECTION,
      DEPARTMENT_NAME: approved.DEPT,
      JOINING_DATE_ISO: approved.START_DATE_ISO,
    };

    if (!approved) {
      return toPrefill(identity, empNo, oldFromMaster(master), 'employeeMaster');
    }

    const old = oldFromRequest(approved);
    old.maritalStatus ??= maritalCode(master?.MARITAL_STATUS);

    return toPrefill(identity, empNo, old, 'previousRequest');
  };

  /** Validated answers plus, when `withSnapshot`, the server-computed employee snapshot. */
  const checkWrite = async (connection, body, { withSnapshot, currentPosition = null }) => {
    const values = validateWrite(body);

    let prefill = null;

    if (withSnapshot) {
      try {
        prefill = await autoFillOnConnection(connection, values.empNo);
      } catch (error) {
        if (error.code === 'EMP_NOT_FOUND') {
          throw new PersonalStatusError(400, 'EMP_NOT_FOUND', 'Validation failed');
        }

        throw error;
      }
    }

    // Keep an employee's current position valid even when it is a historical approved title
    // missing from today's master lookup. New position choices still must exist in the lookup.
    const unchangedCurrentPosition =
      normalizedPosition(values.newPosition) &&
      normalizedPosition(values.newPosition) ===
        normalizedPosition(prefill?.old.position ?? currentPosition);
    const positionExists =
      unchangedCurrentPosition || (await repository.positionExists(connection, values.newPosition));

    if (!positionExists) {
      throw new PersonalStatusError(400, 'POSITION_INVALID', 'Validation failed', [
        { field: 'new.position', message: 'Position is invalid' },
      ]);
    }

    if (!prefill) return values;

    return {
      ...values,
      ...snapshotValues(prefill),
      // The current family status is editable; when the body leaves it out, the snapshot's.
      oldMaritalStatus:
        values.oldMaritalStatus === undefined
          ? (prefill.old.maritalStatus ?? null)
          : values.oldMaritalStatus,
    };
  };

  /**
   * Record-level access: the creator, an HR user (fail-closed XXZP_HR check), or a user in the
   * employee's department who holds HR.PERSONNEL_RECORD_CHANGES:VIEW. Other records are 403.
   */
  const authorizeRecord = async (connection, actor, facts) => {
    if (String(facts.CREATED_BY) === actor.userId) return;
    if (await repository.isHrUser(connection, actor.userId)) return;

    if (
      actor.employeeNumber &&
      facts.EMP_NO &&
      (await repository.isSameDepartment(connection, {
        actorEmployeeNumber: actor.employeeNumber,
        subjectEmployeeNumber: facts.EMP_NO,
      })) &&
      (await holds(actor.userId, VIEW))
    ) {
      return;
    }

    throw forbidden();
  };

  const lockForWrite = async (connection, actor, headerId, action) => {
    const facts = await repository.lockRow(connection, headerId);

    if (!facts) {
      throw notFound();
    }

    await authorizeRecord(connection, actor, facts);

    if (String(facts.STATUS ?? '').toUpperCase() !== 'DRAFT') {
      throw notDraft(action);
    }

    return facts;
  };

  return {
    // CREATE
    async create(body, auth) {
      const actor = actorOf(auth);

      return write(async (connection) => {
        const values = await checkWrite(connection, body, { withSnapshot: true });

        // FORM_DATE is the request date (read-only, today); ARB_DATE its Hijri date.
        const formDate = businessToday();

        const headerId = await repository.insert(
          connection,
          { ...values, formDate, arbDate: hijriDate(formDate) },
          actor.userId,
        );

        if (!headerId) {
          throw new Error('The insert did not return a HEADER_ID');
        }

        await repository.setReference(
          connection,
          headerId,
          referenceNumber(headerId, values.section),
        );

        return mapRecord(await repository.read(headerId, connection));
      });
    },

    // READ
    async read(rawId, auth) {
      const headerId = positiveId(rawId);
      const actor = actorOf(auth);

      return read(async (connection) => {
        const row = await repository.read(headerId, connection);

        if (!row) {
          throw notFound();
        }

        await authorizeRecord(connection, actor, row);

        return mapRecord(row);
      });
    },

    // UPDATE (drafts only). FORM_DATE, ARB_DATE and REF_NO keep their saved values; the employee
    // snapshot is recomputed only when the employee changes.
    async update(rawId, body, auth) {
      const headerId = positiveId(rawId);
      const actor = actorOf(auth);

      return write(async (connection) => {
        const facts = await lockForWrite(connection, actor, headerId, 'updated');

        const employeeChanged = String(facts.EMP_NO ?? '') !== String(body?.empNo ?? '');

        const values = await checkWrite(connection, body, {
          withSnapshot: employeeChanged,
          currentPosition: facts.OLD_POSITION,
        });

        if (values.oldMaritalStatus === undefined) {
          values.oldMaritalStatus = facts.OLD_MARITAL_STATUS ?? null;
        }

        const result = await repository.update(connection, headerId, values, actor.userId, {
          snapshot: employeeChanged,
        });

        if (!result.rowsAffected) {
          throw notFound();
        }

        return mapRecord(await repository.read(headerId, connection));
      });
    },

    // DELETE (drafts only; legacy has no record delete).
    async delete(rawId, auth) {
      const headerId = positiveId(rawId);
      const actor = actorOf(auth);

      return write(async (connection) => {
        await lockForWrite(connection, actor, headerId, 'deleted');

        const result = await repository.delete(connection, headerId);

        if (!result.rowsAffected) {
          throw notFound();
        }

        return { headerId };
      });
    },

    // LISTING: HR sees every request; others see what record access allows.
    async list(query, auth) {
      const filters = parseListing(query);
      const actor = actorOf(auth);

      const { total, rows } = await read(async (connection) => {
        const isHr = await repository.isHrUser(connection, actor.userId);

        return repository.list(connection, {
          ...filters,
          scope: isHr ? null : { userId: actor.userId, employeeNumber: actor.employeeNumber },
        });
      });

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
    employees: (search) => read((connection) => repository.employees(connection, search)),

    // POSITION DATALIST
    positions: () => read((connection) => repository.positions(connection)),

    // EMPLOYEE AUTO-FILL
    async autoFill(rawEmpNo) {
      const empNo = employeeNumber(rawEmpNo);

      return read((connection) => autoFillOnConnection(connection, empNo));
    },
  };
};
