import { randomUUID } from 'node:crypto';

import {
  POOLS,
  withConnection as defaultRead,
  withTransaction as defaultWrite,
} from '../../../database/oracle.js';

import { AppError } from '../../../shared/errors/AppError.js';

import * as defaultRepository from './employee_clearance_repository.js';

const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};

const user = (a) => {
  const id = a?.userId ?? a?.user?.id ?? a?.id;

  if (!/^[1-9]\d{0,18}$/.test(String(id))) {
    fail(401, 'UNAUTHENTICATED', 'Authentication is required');
  }

  return String(id);
};

const flag = (v) => (v === 1 || v === '1' || String(v ?? '').toLowerCase() === 'on' ? 1 : 0);

const itemsByColumn = {
  employeeDept: {
    book_manuals: 'BOOK_MANUALS',
  },
  admin: {
    bank_loan: 'BANK_LOAN',
  },
};

const dateOut = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? null));

const toJsonSection = (key, row) => {
  if (!row) return null;

  const items = [];
  const flags = {};

  for (const col of defaultRepository.columns[key]) {
    flags[col] = flag(row[col]);

    if (flags[col]) {
      items.push(
        Object.entries(itemsByColumn[key] ?? {}).find(([, v]) => v === col)?.[0] ??
          col.toLowerCase(),
      );
    }
  }

  return {
    items,
    flags,
    comments: row.COMMENTS,
    cost: row.COST ?? null,
    approver: row.APPROVER,
    signature: row.APP_SIG,

    managerUserId:
      row[
        {
          employeeDept: 'EMP_MGR_USERID',
          quality: 'QLTY_MGR_USERID',
          warehouse: 'WH_MGR_USERID',
          accounts: 'ACC_MGR_USERID',
          admin: 'ADMIN_MGR_USERID',
        }[key]
      ],

    ...(key === 'employeeDept'
      ? {
          vacationFrom: dateOut(row.ATTRIBUTE1),
          vacationTo: dateOut(row.ATTRIBUTE2),
        }
      : {}),

    ...(key === 'admin'
      ? {
          appDate: dateOut(row.APP_DATE),
          visaExpiry: dateOut(row.ATTRIBUTE5),
        }
      : {}),
  };
};

const SUBJECTS = ['Email:', 'Oracle Access:', 'Tel. Extension:', 'Computer Data:', 'Domain User:'];

const state = (s) => String(s ?? '').toUpperCase();

const canEdit = (s) => ['DRAFT', 'REJECTED'].includes(state(s));

export function createEmployeeClearanceService({
  repository = defaultRepository,
  withConnection = defaultRead,
  withTransaction = defaultWrite,
  holds = async () => false,
} = {}) {
  const read = (fn) => withConnection(POOLS.LOW, fn);
  const write = (fn) => withTransaction(POOLS.LOW, fn);

  // Privileged access is separate from ordinary VIEW permission.
  const privileged = async (auth) =>
    holds(user(auth), {
      moduleCode: 'EMPLOYEE_CLEARANCE',
      resourceCode: 'EMPLOYEE_CLEARANCE',
      actionCode: 'VIEW_ALL',
    });

  const assertScope = async (c, auth, empNo) => {
    if (!(await repository.isInScope(c, user(auth), empNo, await privileged(auth)))) {
      fail(403, 'FORBIDDEN', 'Employee is outside your clearance scope');
    }
  };

  const assertVisible = async (c, auth, h) => {
    if (await privileged(auth)) return;

    if (!(await repository.isInScope(c, user(auth), h.EMP_NO, false))) {
      fail(404, 'RESOURCE_NOT_FOUND', 'Employee clearance request not found');
    }
  };

  const normalize = async (c, auth, b) => {
    await assertScope(c, auth, b.employee.empNo);

    const e = await repository.employee(c, b.employee.empNo);

    if (!e) {
      fail(404, 'RESOURCE_NOT_FOUND', 'Employee not found');
    }

    const managers = await repository.approvers(c, 'department');

    const mgr = managers.find((x) => x.NAME === b.departmentManager.name);

    if (!mgr || managers.filter((x) => x.NAME === b.departmentManager.name).length !== 1) {
      fail(400, 'VALIDATION_ERROR', 'Select an unambiguous department manager from the lookup');
    }

    const dest = b.computerReceivedBy;
    let receiver;

    if (dest === 'it' || dest === 'none') {
      receiver = dest;
    } else {
      const allowed = await repository.computerDestinations(c, user(auth), await privileged(auth));

      receiver = allowed.some((x) => String(x.VALUE) === String(dest)) ? String(dest) : null;
    }

    if (!receiver) {
      fail(400, 'VALIDATION_ERROR', 'Invalid computer destination');
    }

    const managerUserIds = {
      employeeDept: (await repository.supervisorUserId(c, b.employee.empNo))?.USER_ID ?? null,
    };

    for (const key of ['quality', 'warehouse', 'accounts', 'admin']) {
      const options = await repository.approvers(c, key);

      managerUserIds[key] = options.length === 1 ? options[0].USER_ID : null;
    }

    const sections = {};

    for (const key of Object.keys(repository.columns)) {
      const s = b.sections?.[key] ?? {};
      const translations = itemsByColumn[key] ?? {};

      const selected = new Set((s.items ?? []).map((x) => translations[x] ?? x.toUpperCase()));

      sections[key] = {
        ...s,
        managerUserId: managerUserIds[key],
        vacationFrom: b.vacationFrom ?? null,
        vacationTo: b.vacationTo ?? null,

        flags: Object.fromEntries(
          repository.columns[key].map((col) => [col, selected.has(col) ? 1 : 0]),
        ),
      };
    }

    return {
      userId: user(auth),
      personId: e.PERSON_ID,
      empNo: e.EMPLOYEE_NUMBER,
      empName: e.FULL_NAME,
      jobTitle: e.JOB_TITLE,
      department: e.DEPARTMENT_NAME,
      division: e.DIVISION,

      computerFlag: receiver === 'it' ? 0 : 99,

      purpose: b.purpose,
      contact: b.contact,

      depMgrName: mgr.NAME,
      depMgrNo: mgr.EMP_NO,
      depMgrDate: b.departmentManager.date ?? null,
      depMgrSig: b.departmentManager.signature ?? '',

      compRec: receiver,
      compSig: b.computerSignature ?? '',

      itMgr: b.itManager?.name ?? '',
      itMgrDate: b.itManager?.date ?? null,
      itMgrSig: b.itManager?.signature ?? '',

      sections,

      itMatrix: b.itMatrix.map((x, i) => ({
        ...x,
        lineId: i + 1,
        subject: SUBJECTS[i],
      })),
    };
  };

  const present = (r) => {
    if (!r) return null;

    const h = r.header;

    return {
      headerId: String(h.HEADER_ID),
      referenceNo: h.REFERENCE_NO,
      empNo: h.EMP_NO,
      empName: h.EMP_NAME,
      jobTitle: h.JOB_TITLE,
      department: h.DEPARTMENT,
      division: h.ATTRIBUTE1,
      contact: h.CONTACT,
      purpose: h.ATTRIBUTE3,

      computerReturned: Number(h.ATTRIBUTE2) === 0,

      status: state(h.STATUS) === 'ACCEPTED' ? 'Approved' : h.STATUS,

      createdBy: String(h.CREATED_BY),

      vacationFrom: dateOut(r.sections.employeeDept?.ATTRIBUTE1),

      vacationTo: dateOut(r.sections.employeeDept?.ATTRIBUTE2),

      departmentManager: {
        name: h.DEP_MGR,
        empNo: h.DEPMGR_NO,
        date: dateOut(h.DEPMGR_DATE),
        signature: h.DEPMGR_SIG,
      },

      computerReceivedBy: h.COM_REC,

      itManager: {
        name: h.IT_MGR,
        date: dateOut(h.ITMGR_DATE),
        signature: h.ITMGR_SIG,
      },

      itMatrix: r.itMatrix.map((x) => ({
        lineId: x.LINE_ID,
        subject: x.SUBJECT,
        action: x.SUBJECT_ACTION,
        accessTo: x.ACCESS_TO,
      })),

      sections: Object.fromEntries(
        Object.entries(r.sections).map(([k, v]) => [k, toJsonSection(k, v)]),
      ),
    };
  };

  return {
    async create(auth, body) {
      return write(async (c) => {
        const h = await normalize(c, auth, body);
        h.uuid = randomUUID();

        const id = await repository.insertHeader(c, h);

        const referenceNo =
          `${h.division}/` +
          `${String(new Date().getUTCFullYear()).slice(-2)}/` +
          `${id.padStart(3, '0')}`;

        await repository.setReference(c, id, referenceNo);

        await repository.insertWork(c, id, h.userId, randomUUID());

        for (const line of h.itMatrix) {
          await repository.insertIT(c, id, h, line);
        }

        for (const [k, s] of Object.entries(h.sections)) {
          await repository.writeSection(c, k, id, h, s, false);
        }

        return {
          headerId: id,
          referenceNo,
          status: 'Draft',
        };
      });
    },

    async get(auth, id) {
      return read(async (c) => {
        const r = await repository.getFull(c, id);

        if (!r) {
          fail(404, 'RESOURCE_NOT_FOUND', 'Employee clearance request not found');
        }

        await assertVisible(c, auth, r.header);

        return present(r);
      });
    },

    async update(auth, id, body) {
      return write(async (c) => {
        const row = await repository.getHeader(c, id, true);

        if (!row) {
          fail(404, 'RESOURCE_NOT_FOUND', 'Employee clearance request not found');
        }

        await assertVisible(c, auth, row);

        if (!canEdit(row.STATUS)) {
          fail(409, 'STATE_CONFLICT', 'Request cannot be modified in its current status');
        }

        const h = await normalize(c, auth, body);
        const updated = await repository.updateHeader(c, id, h);

        if (!updated.rowsAffected) {
          fail(409, 'STATE_CONFLICT', 'Request cannot be modified in its current status');
        }

        const existing = await repository.getFull(c, id);

        for (const line of h.itMatrix) {
          await repository.updateIT(c, id, h, line);
        }

        for (const [k, s] of Object.entries(h.sections)) {
          await repository.writeSection(c, k, id, h, s, !!existing.sections[k]);
        }

        return {
          headerId: String(id),
          updated: true,
        };
      });
    },

    async remove(auth, id) {
      return write(async (c) => {
        const h = await repository.getHeader(c, id, true);

        if (!h) {
          fail(404, 'RESOURCE_NOT_FOUND', 'Employee clearance request not found');
        }

        await assertVisible(c, auth, h);

        if (!canEdit(h.STATUS)) {
          fail(409, 'STATE_CONFLICT', 'Request cannot be deleted in its current status');
        }

        return {
          headerId: String(id),
          deleted: await repository.remove(c, id),
        };
      });
    },

    async list(auth, q) {
      return read(async (c) => {
        const r = await repository.list(c, user(auth), await privileged(auth), q);

        return {
          page: q.page,
          pageSize: q.pageSize,
          total: r.total,

          items: r.items.map((x) => ({
            headerId: String(x.HEADER_ID),
            referenceNo: x.REFERENCE_NO,
            empNo: x.EMP_NO,
            empName: x.EMP_NAME,
            jobTitle: x.JOB_TITLE,
            department: x.DEPARTMENT,
            contact: x.CONTACT,
            division: x.DIVISION,
            purpose: x.PURPOSE,

            computerReturned: Number(x.COMPUTER_FLAG) === 0,

            status: state(x.STATUS) === 'ACCEPTED' ? 'Approved' : x.STATUS,

            vacationFrom: dateOut(x.VACATION_FROM),
            vacationTo: dateOut(x.VACATION_TO),

            pendingAt: null,
            workflowStarted: null,
            workflowEnded: null,

            createdAt: x.CREATION_DATE,
          })),
        };
      });
    },

    async employees(auth, q) {
      return read(async (c) => {
        const r = await repository.employees(c, user(auth), await privileged(auth), q);

        return {
          page: q.page,
          pageSize: q.pageSize,
          total: r.total,

          items: r.items.map((x) => ({
            empNo: x.EMPLOYEE_NUMBER,
            fullName: x.FULL_NAME,
            jobTitle: x.JOB_TITLE,
            department: x.DEPARTMENT,
            division: x.DIVISION,
            userEmail: x.EMAIL_ADDRESS,
          })),
        };
      });
    },

    async employee(auth, empNo) {
      return read(async (c) => {
        if (!(await repository.isInScope(c, user(auth), empNo, await privileged(auth)))) {
          fail(404, 'RESOURCE_NOT_FOUND', 'Employee not found');
        }

        const e = await repository.employee(c, empNo);

        if (!e) {
          fail(404, 'RESOURCE_NOT_FOUND', 'Employee not found');
        }

        return {
          empNo: e.EMPLOYEE_NUMBER,
          fullName: e.FULL_NAME,
          jobTitle: e.JOB_TITLE,
          department: e.DEPARTMENT_NAME,
          division: e.DIVISION,
          userEmail: e.EMAIL_ADDRESS,
          personId: e.PERSON_ID,
          directManager: e.SUPERVISOR_NAME,

          supervisorUserId: (await repository.supervisorUserId(c, empNo))?.USER_ID ?? null,
        };
      });
    },

    async approvers(auth, section) {
      user(auth);

      return read(async (c) => ({
        section,

        items: (await repository.approvers(c, section)).map((x) => ({
          name: x.NAME,
          empNo: x.EMP_NO,
          userId: x.USER_ID,
        })),
      }));
    },

    async computerDestinations(auth) {
      const userId = user(auth);
      const canViewAll = await privileged(auth);

      return read(async (c) =>
        [
          ...(await repository.computerDestinations(c, userId, canViewAll)).map((x) => ({
            value: String(x.VALUE),
            label: x.LABEL,
            kind: 'employee',
          })),

          {
            value: 'it',
            label: 'IT',
            kind: 'it',
          },

          {
            value: 'none',
            label: 'No Computer',
            kind: 'none',
          },
        ].sort((a, b) => a.label.localeCompare(b.label)),
      );
    },
  };
}
