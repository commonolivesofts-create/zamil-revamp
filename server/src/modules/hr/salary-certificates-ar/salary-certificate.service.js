import { randomUUID } from 'node:crypto';

import {
  POOLS,
  withConnection as defaultConn,
  withTransaction as defaultTx,
} from '../../../database/oracle.js';

import { AppError } from '../../../shared/errors/AppError.js';

import { repository as defaultRepository } from './salary-certificate.repository.js';

import { ascii } from './salary-certificate.validation.js';

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
  m.NATION_EN === 'Saudi' ? m.NATIONAL_IDENTIFIER || m.PASSPORT_NUMBER : m.IQAMA_NUMBER;

const snapshot = (m) => {
  if (
    !m.FULL_NAME_AR?.trim() ||
    !m.POSITION_ARABIC?.trim() ||
    !m.NATIONALITY_AR?.trim() ||
    !m.JOINING_DATE
  ) {
    throw error(
      400,
      'AR_TRANSLATION_REQUIRED',
      'Employee requires complete Arabic name, nationality, position and joining date',
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

    employeeName: m.FULL_NAME_AR,

    nationality: m.NATIONALITY_AR,

    nationalIdentifier: String(nationalIdentifier),

    jobTitle: m.POSITION_ARABIC,

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

const arabic = (s) => String(s ?? '').replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

const actor = (auth) => String(auth?.userId ?? auth?.id ?? auth?.user?.id ?? auth?.username ?? '');

export function createSalaryCertificateService({
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
        matches.length ? 'Employee translation is ambiguous' : 'Employee not found',
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

    const matched = eligible.filter((s) => s.FULL_NAME_AR === body.approvalName);

    if (matched.length !== 1 || !matched[0].POSITION_ARABIC) {
      throw error(400, 'INVALID_APPROVER', 'Select an eligible approver with an Arabic position');
    }

    const certDate = Object.hasOwn(body, 'certDate') ? body.certDate : today();

    return {
      ...data,

      certDate,

      toEmpName: ascii(body.toEmpName),

      approvalName: matched[0].FULL_NAME_AR,

      approvalPosition: matched[0].POSITION_ARABIC,

      ...(Object.hasOwn(body, 'empNameList')
        ? {
            empNameList: ascii(body.empNameList),
          }
        : {}),
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

        // Existing database-generated identity.
        // No new sequence or table is created.

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
          throw error(409, 'AMBIGUOUS_EMPLOYEE', 'Employee translation is ambiguous');
        }

        const m = matches[0];
        const s = snapshot(m);

        return {
          ...s,

          name: m.FULL_NAME,
          nameAr: s.employeeName,

          nationality: m.NATION_EN,
          nationalityAr: s.nationality,

          position: m.POSITION_NAME,
          positionAr: s.jobTitle,

          joiningDateAr: m.JOINING_DATE_AR,
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

          nameAr: r.FULL_NAME_AR,

          positionAr: r.POSITION_ARABIC,
        })),
      ),

    print: async (id) => {
      const r = await read(id);

      const a = (v) => safe(arabic(v));

      const tr = (label, value) =>
        `<tr>
          <th>${safe(label)}</th>
          <td>${a(value)}</td>
        </tr>`;

      return `
<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>شهادة الراتب</title>

  <style>
    @page {
      size: A4;
      margin: 10mm;
    }

    body {
      font-family: Arial, sans-serif;
      direction: rtl;
      margin: 25mm auto;
      max-width: 180mm;
      color: #222;
    }

    h1 {
      text-align: center;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0;
    }

    th, td {
      border: 1px solid #aaa;
      padding: 8px;
      text-align: right;
    }

    th {
      width: 43%;
    }

    .note {
      color: #b22;
      margin-top: 25px;
    }
  </style>
</head>

<body>
  <h1>شهادة الراتب</h1>

  <p>
    الرقم المرجعي: ${a(r.refNo)}
    التاريخ: ${a(r.certDate)}
  </p>

  <p>
    <b>إلى</b> ${safe(r.toEmpName)}
  </p>

  <h2>المعلومات الشخصية</h2>

  <table>
    ${tr('الاسم', r.employeeName)}
    ${tr('رقم الموظف', r.employeeNo)}
    ${tr('الجنسية', r.nationality)}
    ${tr('رقم الهوية', r.nationalIdentifier)}
  </table>

  <h2>معلومات الوظيفة</h2>

  <table>
    ${tr('المسمى الوظيفي', r.jobTitle)}
    ${tr('تاريخ التعيين', r.joiningDate)}
    ${tr('القسم', r.division)}
  </table>

  <h2>معلومات الراتب</h2>

  <table>
    ${tr('الراتب الأساسي', r.basicSalary)}
    ${tr('بدل السكن', r.housingAllowance)}
    ${tr('بدل المواصلات', r.transportAllowance)}
    ${tr('بدل الاتصال', r.commAllowance)}
    ${tr('بدل السيارة', r.carAllowance)}
    ${tr('إجمالي الراتب (ريال سعودي)', r.totalSalary)}
  </table>

  <p>
    ${safe(r.approvalName)}
    —
    ${safe(r.positionName)}
  </p>

  <p class="note">
    هذه الشهادة صادرة بناءً على طلب الموظف
    دون أي مسؤولية على الشركة تجاه الغير.
  </p>
</body>
</html>`;
    },
  };
}
