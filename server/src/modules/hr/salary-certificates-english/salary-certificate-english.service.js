import { randomUUID } from 'node:crypto';

import {
  POOLS,
  withConnection as defaultConn,
  withTransaction as defaultTx,
} from '../../../database/oracle.js';

import { AppError } from '../../../shared/errors/AppError.js';

import { repository as defaultRepository } from './salary-certificate-english.repository.js';

const ascii = (v) => v;

const error = (status, code, message) => new AppError(status, code, message);

const numeric = (value, name) => {
  const n = Number(ascii(value));

  if (value === null || value === undefined || value === '' || !Number.isFinite(n) || n < 0) {
    throw error(400, 'INVALID_SNAPSHOT', `${name} must be a nonnegative number`);
  }

  return n;
};

const cast = (row) =>
  row &&
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
      value,
    ]),
  );

const today = () => new Date().toISOString().slice(0, 10);

const view = (row) => {
  const o = cast(row);

  if (o) {
    o.nationalIdentifier = o.passportNo;

    delete o.passportNo;
    delete o.uuid;
  }

  return o;
};

const identity = (m) =>
  m.NATIONALITY === 'Saudi' ? m.NATIONAL_IDENTIFIER || m.PASSPORT_NUMBER : m.IQAMA_NUMBER;

const snapshot = (m) => {
  if (
    !m.FULL_NAME?.trim() ||
    !m.POSITION_NAME?.trim() ||
    !m.NATIONALITY?.trim() ||
    !m.JOINING_DATE
  ) {
    throw error(
      400,
      'EMPLOYEE_DATA_REQUIRED',
      'Employee requires complete name, nationality, position and joining date',
    );
  }

  const basicSalary = numeric(m.BASIC_SALARY, 'basicSalary');

  const housingAllowance = numeric(m.HOUSING_ALLOWANCE, 'housingAllowance');

  const transportAllowance = numeric(m.TRANSPORTATION_ALLOWANCE, 'transportAllowance');

  const commAllowance = numeric(m.COMMUNICATION_ALLOWANCE, 'commAllowance');

  const carAllowance = numeric(m.CAR_ALLOWANCE, 'carAllowance');

  const totalSalary =
    basicSalary + housingAllowance + transportAllowance + commAllowance + carAllowance;

  const nationalIdentifier = ascii(identity(m));

  if (!nationalIdentifier) {
    throw error(400, 'IDENTITY_REQUIRED', 'National identifier missing');
  }

  return {
    employeeNo: ascii(String(m.EMPLOYEE_NUMBER)),

    employeeName: m.FULL_NAME,

    nationality: m.NATIONALITY,

    nationalIdentifier: String(nationalIdentifier),

    jobTitle: m.POSITION_NAME,

    joiningDate: m.JOINING_DATE,

    division: m.DIVISION,

    basicSalary,
    housingAllowance,
    transportAllowance,
    commAllowance,
    carAllowance,
    totalSalary,

    allowanceFlag: [housingAllowance, transportAllowance, commAllowance, carAllowance].some(
      (n) => n !== 0,
    )
      ? 'Yes'
      : 'No',
  };
};

const safe = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const actor = (auth) => String(auth?.userId ?? auth?.id ?? auth?.user?.id ?? auth?.username ?? '');

export function createSalaryCertificateEnglishService({
  repository = defaultRepository,
  withConnection = defaultConn,
  withTransaction = defaultTx,
} = {}) {
  const read = (id) =>
    withConnection(POOLS.LOW, async (c) => {
      const r = await repository.read(c, id);

      if (!r) {
        throw error(404, 'NOT_FOUND', 'Salary certificate not found');
      }

      return view(r);
    });

  const prepare = async (c, body) => {
    const employeeNo = ascii(body.employeeNo);

    const matches = await repository.employee(c, employeeNo);

    if (matches.length !== 1) {
      throw error(
        matches.length ? 409 : 404,
        matches.length ? 'AMBIGUOUS_EMPLOYEE' : 'EMPLOYEE_NOT_FOUND',
        matches.length ? 'Employee master record is ambiguous' : 'Employee not found',
      );
    }

    const data = snapshot(matches[0]);

    if (ascii(body.joiningDate) !== data.joiningDate) {
      throw error(400, 'JOINING_DATE_MISMATCH', 'joiningDate must match the employee master');
    }

    if (body.allowanceFlag !== data.allowanceFlag) {
      throw error(400, 'ALLOWANCE_MISMATCH', 'allowanceFlag must match the employee master');
    }

    const eligible = await repository.signers(c);

    const matched = eligible.filter((s) => s.FULL_NAME === body.approvalName);

    if (matched.length !== 1 || !matched[0].POSITION_NAME) {
      throw error(400, 'INVALID_APPROVER', 'Select an eligible approver with a position');
    }

    const certDate = Object.hasOwn(body, 'certDate') ? body.certDate : today();

    return {
      ...data,

      certDate,

      toEmpName: ascii(body.toEmpName),

      approvalName: matched[0].FULL_NAME,

      approvalPosition: matched[0].POSITION_NAME,
    };
  };

  return {
    read,

    list: (q) =>
      withConnection(POOLS.LOW, async (c) => {
        const { items, total } = await repository.list(c, {
          ...q,

          employeeNo: q.employeeNo ? ascii(q.employeeNo) : undefined,
        });

        return {
          items: items.map(view),

          page: q.page,
          pageSize: q.pageSize,
          total,
        };
      }),

    create: (body, auth) =>
      withTransaction(POOLS.LOW, async (c) => {
        const data = await prepare(c, body);

        const id = await repository.create(c, data, actor(auth), randomUUID());

        const refNo = `ZPIL/${String(new Date().getFullYear()).slice(
          -2,
        )}/${String(id).padStart(3, '0')}`;

        const result = await repository.setReference(c, id, refNo);

        if (result.rowsAffected !== 1) {
          throw error(409, 'REFERENCE_FAILED', 'Cannot assign unique reference number');
        }

        return {
          id,
          refNo,
        };
      }),

    update: (id, body, auth) =>
      withTransaction(POOLS.LOW, async (c) => {
        const existing = await repository.read(c, id, true);

        if (!existing) {
          throw error(404, 'NOT_FOUND', 'Salary certificate not found');
        }

        if (existing.STATUS !== 'DRAFT') {
          throw error(409, 'STATE_CONFLICT', 'Only DRAFT certificates may be modified');
        }

        const data = await prepare(c, body);

        const result = await repository.update(c, id, data, actor(auth));

        if (result.rowsAffected !== 1) {
          throw error(409, 'STATE_CONFLICT', 'Certificate update was not applied');
        }

        return { id };
      }),

    remove: (id) =>
      withTransaction(POOLS.LOW, async (c) => {
        const existing = await repository.read(c, id, true);

        if (!existing) {
          throw error(404, 'NOT_FOUND', 'Salary certificate not found');
        }

        if (existing.STATUS !== 'DRAFT') {
          throw error(409, 'STATE_CONFLICT', 'Only DRAFT certificates may be deleted');
        }

        const result = await repository.delete(c, id);

        if (result.rowsAffected !== 1) {
          throw error(409, 'STATE_CONFLICT', 'Certificate deletion was not applied');
        }

        return {
          id,
          deleted: true,
        };
      }),

    employee: (empNo) =>
      withConnection(POOLS.LOW, async (c) => {
        const matches = await repository.employee(c, ascii(empNo));

        if (!matches.length) {
          throw error(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found');
        }

        if (matches.length !== 1) {
          throw error(409, 'AMBIGUOUS_EMPLOYEE', 'Employee master record is ambiguous');
        }

        const m = matches[0];
        const s = snapshot(m);

        return {
          ...s,

          name: m.FULL_NAME,

          nationality: m.NATIONALITY,

          position: m.POSITION_NAME,
        };
      }),

    employees: (q) =>
      withConnection(POOLS.LOW, async (c) =>
        (
          await repository.picker(c, {
            ...q,
            q: ascii(q.q || ''),
          })
        ).map((r) => ({
          employeeNo: ascii(String(r.EMPLOYEE_NUMBER)),
        })),
      ),

    approvers: () =>
      withConnection(POOLS.LOW, async (c) =>
        (await repository.signers(c)).map((r) => ({
          employeeNo: ascii(String(r.EMPLOYEE_NUMBER)),

          name: r.FULL_NAME,

          position: r.POSITION_NAME,
        })),
      ),

    print: async (id) => {
      const r = await read(id);

      const cell = (label, val) => `<tr><th>${safe(label)}</th><td>${safe(val)}</td></tr>`;

      return `<!doctype html>
      <html lang="en">
      <head>
      <meta charset="utf-8">
      <title>Salary Certificate</title>
      <style>
        @page { size: A4; margin: 10mm; }

        body {
          font: 14px Arial, sans-serif;
          color: #222;
          max-width: 180mm;
          margin: 20mm auto;
        }

        h1 { text-align: center; }

        table {
          width: 100%;
          border-collapse: collapse;
          margin: 12px 0;
        }

        th, td {
          border: 1px solid #bbb;
          padding: 9px;
          text-align: left;
        }

        th { width: 43%; }

        .note {
          color: #ae2020;
          margin-top: 24px;
        }

        @media print {
          body { margin: 0; }
        }
      </style>
      </head>

      <body>
        <h1>Salary Certificate</h1>

        <p>
          Date: ${safe(r.certDate)}
          &nbsp;
          Ref No: ${safe(r.refNo)}
        </p>

        <p>To: ${safe(r.toEmpName)}</p>

        <p>
          This is to certify that the employee named
          below is employed with our company.
        </p>

        <h2>Personal Information</h2>
        <table>
          ${cell('Name', r.employeeName)}
          ${cell('Nationality', r.nationality)}
          ${cell('ID / Passport No.', r.nationalIdentifier)}
        </table>

        <h2>Job Information</h2>
        <table>
          ${cell('Employee No.', r.employeeNo)}
          ${cell('Job Title', r.jobTitle)}
          ${cell('Joining Date', r.joiningDate)}
          ${cell('Division', r.division)}
        </table>

        <h2>Salary Details (SAR)</h2>
        <table>
          ${cell('Basic Salary', r.basicSalary)}
          ${cell('Housing Allowance', r.housingAllowance)}
          ${cell('Transport Allowance', r.transportAllowance)}
          ${cell('Communication Allowance', r.commAllowance)}
          ${cell('Car Allowance', r.carAllowance)}
          ${cell('Total Salary', r.totalSalary)}
        </table>

        <p>
          Issued on employee request without liability
          to third parties.
        </p>

        <p>
          Authorized Signatory:
          ${safe(r.approvalName)}
          ${safe(r.positionName)}
        </p>

        <p class="note">
          Valid for one month from the date of issue.
          Any alterations invalidate this certificate.
        </p>
      </body>
      </html>`;
    },
  };
}
