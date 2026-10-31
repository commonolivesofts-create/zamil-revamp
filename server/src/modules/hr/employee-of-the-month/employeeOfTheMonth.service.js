import { randomUUID } from 'node:crypto';

import {
  POOLS,
  withConnection as defaultRead,
  withTransaction as defaultTx,
} from '../../../database/oracle.js';

import { AppError } from '../../../shared/errors/AppError.js';

import * as defaultRepo from './employeeOfTheMonth.repository.js';

const labels = {
  production: [
    'Adherence to Core Values',
    'Demonstrates Excellence in Production',
    'Demonstrate Excellence in Quality - Production',
    'Demonstrate Excellence in Overall Work Performance',
  ],
  'shared-services': [
    'Adherence to Core Values',
    'Demonstrate Excellence in Cost Managemnet',
    'Demonstrate Excellence in Dealing with Internal and External Customers',
    'Demonstrate Excellence in Overall Work Performance',
    'Innovation',
    'Process Adherence',
  ],
};

const scale = [
  { code: 'A', label: 'At Standard' },
  { code: 'AS', label: 'Above Standard' },
  { code: 'BS', label: 'Below Standard' },
  { code: 'CS', label: 'Close to Standard' },
];

const fail = (status, code, message) => {
  throw new AppError(status, code, message);
};

const canonical = (d) => (d === 'Production' ? 'production' : 'shared-services');

const lineMap = (r, d) => ({
  lineNumber: r.LINE_NUMBER,
  criterion: labels[d][r.LINE_NUMBER],
  rating: r.RATING,
  remark: r.REMARK,
});

const map = (r) => ({
  headerId: r.HEADER_ID,
  uuid: r.UUID,
  requestNo: r.REQUEST_NO,
  department: r.DEPT_TYPE,
  employeeNumber: String(r.EMPLOYEE_NUMBER),
  employeeName: r.EMPLOYEE_NAME,
  employeeEmail: r.EMPLOYEE_EMAIL,
  employeePosition: r.EMPLOYEE_POSITION,
  employeeDepartment: r.EMPLOYEE_DEPARTMENT,
  activityDate: r.ACTIVITY_DATE,
  overallRating: r.OVERALL_RATING,
  remark: r.REMARK,
  status: r.STATUS,
  createdBy: String(r.CREATED_BY),
  createdByEmpNum: r.CREATED_BY_EMP_NUM,
  createdAt: r.CREATED_AT,
  updatedBy: r.UPDATED_BY,
});

export function createEmployeeOfTheMonthService({
  repository = defaultRepo,
  withConnection = defaultRead,
  withTransaction = defaultTx,
} = {}) {
  const read = (fn) => withConnection(POOLS.LOW, fn);
  const tx = (fn) => withTransaction(POOLS.LOW, fn);

  async function validatePayload(c, actor, b, old) {
    const d = b.department;

    if (!labels[d]) {
      fail(400, 'INVALID_DEPARTMENT', 'Invalid department');
    }

    if (old && canonical(old.DEPT_TYPE) !== d) {
      fail(400, 'INVALID_DEPARTMENT', 'Department cannot be changed');
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(b.activityDate) ||
      Number.isNaN(Date.parse(b.activityDate)) ||
      new Date(b.activityDate).toISOString().slice(0, 10) !== b.activityDate
    ) {
      fail(400, 'INVALID_DATE', 'Invalid activity date');
    }

    if (!['A', 'AS', 'BS', 'CS'].includes(b.overallRating)) {
      fail(400, 'INVALID_RATING', 'Invalid overall rating');
    }

    if (!b.remark?.trim()) {
      fail(400, 'REQUIRED_FIELD', 'Remark is required');
    }

    if (b.lines?.length !== labels[d].length || b.lines.some((x, i) => x.lineNumber !== i)) {
      fail(400, 'INVALID_LINE_COUNT', 'Invalid criterion lines');
    }

    for (const x of b.lines) {
      if (!scale.some((v) => v.code === x.rating)) {
        fail(400, 'INVALID_RATING', 'Invalid line rating');
      }

      if (!x.remark?.trim()) {
        fail(400, 'REQUIRED_FIELD', 'Line remark is required');
      }

      if (x.remark.length > 500) {
        fail(400, 'LINE_REMARK_TOO_LONG', 'Line remark must not exceed 500 characters');
      }
    }

    const e = await repository.employee(c, b.employee.number);

    if (!e) {
      fail(400, 'INVALID_EMPLOYEE', 'Employee is not active or does not exist');
    }

    const values = [
      ['name', 'FULL_NAME'],
      ['email', 'EMAIL_ADDRESS'],
      ['position', 'POSITION_NAME'],
      ['departmentName', 'DEPARTMENT'],
    ];

    if (values.some(([key, col]) => b.employee[key] !== e[col])) {
      fail(400, 'EMPLOYEE_DATA_MISMATCH', 'Employee details do not match the master');
    }

    const requester = await repository.requestor(c, actor.userId);

    if (!requester) {
      fail(404, 'RESOURCE_NOT_FOUND', 'Requestor not found');
    }

    if (String(e.EMPLOYEE_NUMBER) === String(requester.EMPLOYEE_NUMBER)) {
      fail(400, 'SELF_NOMINATION_NOT_ALLOWED', 'Self nomination is not allowed');
    }

    return {
      ...b.employee,
      activityDate: b.activityDate,
      overallRating: b.overallRating,
      remark: b.remark,
      deptType: d === 'production' ? 'Production' : 'Shared-services',
      createdBy: actor.userId,
      createdByEmpNum: requester.EMPLOYEE_NUMBER,
      updatedBy: actor.userId,
    };
  }

  async function detail(c, id, header) {
    const h = header ?? (await repository.get(c, id));

    if (!h) {
      fail(404, 'RESOURCE_NOT_FOUND', 'Nomination not found');
    }

    const d = canonical(h.DEPT_TYPE);
    const saved = await repository.getLines(c, id);

    const byIndex = new Map(saved.map((x) => [x.LINE_NUMBER, x]));

    return {
      ...map(h),
      lines: labels[d].map((criterion, i) =>
        lineMap(
          byIndex.get(i) || {
            LINE_NUMBER: i,
            RATING: null,
            REMARK: null,
          },
          d,
        ),
      ),
    };
  }

  async function assertRecordScope(c, actor, header) {
    const isHrUser = await repository.isHrUser(c, actor.userId);

    if (!isHrUser && String(header.CREATED_BY) !== String(actor.userId)) {
      fail(404, 'RESOURCE_NOT_FOUND', 'Nomination not found');
    }
  }

  return {
    async get(actor, id) {
      return read(async (c) => {
        const header = await repository.get(c, id);

        if (!header) {
          fail(404, 'RESOURCE_NOT_FOUND', 'Nomination not found');
        }

        await assertRecordScope(c, actor, header);

        return detail(c, id, header);
      });
    },

    async create(actor, b) {
      return tx(async (c) => {
        const h = await validatePayload(c, actor, b);

        const id = await repository.insert(c, {
          ...h,
          uuid: randomUUID(),
        });

        await repository.setRequestNo(c, id, b.department === 'production' ? 'PROD' : 'SS');

        await repository.replaceLines(c, id, b.lines);

        return detail(c, id);
      });
    },

    async update(actor, id, b) {
      return tx(async (c) => {
        const old = await repository.get(c, id, true);

        if (!old) {
          fail(404, 'RESOURCE_NOT_FOUND', 'Nomination not found');
        }

        await assertRecordScope(c, actor, old);

        if (old.STATUS === 'INPROCESS') {
          fail(409, 'CONFLICT', 'Cannot update nomination while it is In Process');
        }

        const h = await validatePayload(c, actor, b, old);

        await repository.update(c, id, h, old.STATUS === 'APPROVED' ? 'DRAFT' : old.STATUS);

        await repository.replaceLines(c, id, b.lines);

        return detail(c, id);
      });
    },

    async remove(actor, id) {
      return tx(async (c) => {
        const old = await repository.get(c, id, true);

        if (!old) {
          fail(404, 'RESOURCE_NOT_FOUND', 'Nomination not found');
        }

        await assertRecordScope(c, actor, old);

        if (!['DRAFT', 'REJECTED'].includes(old.STATUS)) {
          fail(409, 'CONFLICT', 'Cannot delete nomination in its current status');
        }

        await repository.remove(c, id);

        return {
          headerId: Number(id),
        };
      });
    },

    async list(actor, q) {
      return read(async (c) => {
        const hr = await repository.isHrUser(c, actor.userId);

        const r = await repository.list(c, q, actor.userId, hr);

        return {
          ...r,
          items: r.items.map((x) => ({
            headerId: x.HEADER_ID,
            requestNo: x.REQUEST_NO,
            department: x.DEPT_TYPE,
            employeeNumber: String(x.EMPLOYEE_NUMBER),
            employeeName: x.EMPLOYEE_NAME,
            employeePosition: x.EMPLOYEE_POSITION,
            employeeDepartment: x.EMPLOYEE_DEPARTMENT,
            activityDate: x.ACTIVITY_DATE,
            overallRating: x.OVERALL_RATING,
            remark: x.REMARK,
            ratings: {
              A: x.RATING_A_COUNT,
              AS: x.RATING_AS_COUNT,
              BS: x.RATING_BS_COUNT,
              CS: x.RATING_CS_COUNT,
            },
            status: x.STATUS,
            requestor: x.REQUESTOR,
            createdAt: x.CREATED_AT,
          })),
        };
      });
    },

    async employees(q) {
      return read(async (c) =>
        (await repository.employees(c, q)).map((x) => ({
          employeeNumber: String(x.EMPLOYEE_NUMBER),
          fullName: x.FULL_NAME,
          email: x.EMAIL_ADDRESS,
          position: x.POSITION_NAME,
          department: x.DEPARTMENT,
          personId: x.PERSON_ID,
        })),
      );
    },

    async requestor(actor) {
      return read(async (c) => {
        const x = await repository.requestor(c, actor.userId);

        if (!x) {
          fail(404, 'RESOURCE_NOT_FOUND', 'Requestor not found');
        }

        return {
          employeeNumber: String(x.EMPLOYEE_NUMBER),
          fullName: x.FULL_NAME,
          email: x.EMAIL_ADDRESS,
        };
      });
    },

    criteria(d) {
      if (!labels[d]) {
        fail(400, 'INVALID_DEPARTMENT', 'Invalid department');
      }

      return {
        department: d,
        criteria: labels[d].map((criterion, lineNumber) => ({
          lineNumber,
          criterion,
        })),
        ratingScale: scale,
      };
    },
  };
}
