import {
  POOLS,
  withConnection as defaultRead,
  withTransaction as defaultTx,
} from '../../../database/oracle.js';

import { AppError } from '../../../shared/errors/AppError.js';
import * as defaultRepo from './visitingVisa.repository.js';

const missing = () => new AppError(404, 'RESOURCE_NOT_FOUND', 'Business visa letter not found');

const invalid = (field, message) =>
  new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', [{ field, message }]);

const conflict = () => new AppError(409, 'CONFLICT', 'Reference number already exists');

const clean = (value) => (typeof value === 'string' ? value.trim() || null : value);

const actor = (auth) => {
  const id = auth?.userId ?? auth?.user?.id ?? auth?.id;

  // Fixed: use strict comparison
  if (id === null || id === undefined) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required');
  }

  return id;
};

const dateToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

const defaults = {
  status: 'DRAFT',
  visit_purpose: 'Business discussions.',
  visit_purpose_ar: 'زيارة تجارية',
  expense_borne_by: 'Company',
  return_statement: 'return to Saudi Arabia to resume his duties.',
  closing_text: 'Anticipating your assistance in this regard.',
};

const uniqueness = async (repository, connection, body, id) => {
  if (body.ref_no && (await repository.duplicate(connection, body.ref_no, id))) {
    throw conflict();
  }
};

const safe =
  (fn) =>
  async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error.errorNum === 1 || error.code === 'ORA-00001') {
        throw conflict();
      }

      throw error;
    }
  };

const dateDisplay = (dateString) =>
  dateString
    ? new Date(`${dateString}T12:00:00Z`).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null;

export function createVisitingVisaService({
  repository = defaultRepo,
  withConnection = defaultRead,
  withTransaction = defaultTx,
} = {}) {
  const read = (callback) => withConnection(POOLS.LOW, callback);

  const write = (callback) => withTransaction(POOLS.LOW, callback);

  return {
    // GET /:id
    get: (id) =>
      read(async (connection) => {
        const record = await repository.get(connection, id);

        if (!record) {
          throw missing();
        }

        return record;
      }),

    // POST /
    create: safe(async (auth, payload) =>
      write(async (connection) => {
        const body = Object.fromEntries(
          Object.entries(payload).map(([key, value]) => [key, clean(value)]),
        );

        for (const [key, value] of Object.entries(defaults)) {
          // Fixed: explicit strict null/undefined checks
          if (body[key] === null || body[key] === undefined) {
            body[key] = value;
          }
        }

        body.letter_date ??= dateToday();

        body.expense_employee_name ??= body.employee_name;

        body.return_employee_name ??= body.employee_name;

        for (const field of ['ref_no', 'division_id', 'employee_name', 'letter_date']) {
          if (!body[field]) {
            throw invalid(field, `${field} is required`);
          }
        }

        await uniqueness(repository, connection, body);

        const id = await repository.insert(connection, body, actor(auth));

        return repository.get(connection, id);
      }),
    ),

    // PUT /:id
    update: safe(async (auth, id, payload) =>
      write(async (connection) => {
        const existing = await repository.get(connection, id, true);

        if (!existing) {
          throw missing();
        }

        const changed = {};

        for (const [key, value] of Object.entries(payload)) {
          const normalizedValue = clean(value);

          const existingValue = existing[key] ?? null;

          const newValue = normalizedValue ?? null;

          const numericValuesEqual =
            typeof normalizedValue === 'number' && Number(existing[key]) === normalizedValue;

          if (existingValue !== newValue && !numericValuesEqual) {
            changed[key] = normalizedValue;
          }
        }

        if (Object.keys(changed).length === 0) {
          return {
            changed: false,
            message: 'No changes detected.',
          };
        }

        const allFields = {
          ...existing,
          ...changed,
        };

        for (const field of ['ref_no', 'division_id', 'employee_name', 'letter_date']) {
          if (!allFields[field]) {
            throw invalid(field, `${field} is required`);
          }
        }

        if (changed.ref_no) {
          await uniqueness(repository, connection, changed, id);
        }

        await repository.update(connection, id, changed, actor(auth));

        return {
          changed: true,
          letter: await repository.get(connection, id),
        };
      }),
    ),

    // DELETE /:id
    remove: (auth, id) =>
      write(async (connection) => {
        actor(auth);

        const rowsAffected = await repository.remove(connection, id);

        if (!rowsAffected) {
          throw missing();
        }

        return {
          deleted: true,
        };
      }),

    // GET /
    list: (query) =>
      read(async (connection) => {
        const result = await repository.list(connection, query);

        result.items = result.items.map((item) => ({
          ...item,
          status_display: item.status || 'DRAFT',
          letter_date_display: dateDisplay(item.letter_date),
        }));

        return result;
      }),

    // GET /lookups/employees
    employees: () => read((connection) => repository.employees(connection)),

    // GET /lookups/employee/:employeeNumber
    employee: (employeeNumber) =>
      read(async (connection) => {
        const employeeData = await repository.employee(connection, employeeNumber);

        if (!employeeData) {
          throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Employee not found');
        }

        return {
          employee_name: employeeData.full_name,
          nationality: employeeData.nationality,
          nationality_ar: employeeData.nationality_ar,
          passport_no: employeeData.passport_number,
          id_no: employeeData.iqama_number,
          id_expiration_date: employeeData.expiry_date,
          job_title: employeeData.job_title,
          job_title_ar: employeeData.job_name_ar,
          employed_since: employeeData.original_date_of_hire || employeeData.joining_date,
          contract_nature: employeeData.employment_category,
          monthly_salary: employeeData.total_salary ?? employeeData.basic_salary,
        };
      }),

    // GET /lookups/options
    options: () => ({
      divisions: [
        {
          value: '300000003618177',
          label: 'IPP BU',
        },
        {
          value: '300000003618190',
          label: 'FPP BU',
        },
      ],

      request_for: [
        {
          value: 'Business Single',
          label: 'Business Single',
          ar: 'مفردة',
        },
        {
          value: 'Business Multiple',
          label: 'Business Multiple',
          ar: 'متعددة',
        },
      ],

      embassies: [
        {
          value: 'Indian',
          label: 'Indian',
          ar: 'سفارة الهند',
        },
      ],
    }),

    // GET /:id/print
    print: async (id) => {
      const item = await read((connection) => repository.get(connection, id));

      if (!item) {
        throw missing();
      }

      return {
        ...item,

        division_label:
          item.division_id === '300000003618177'
            ? 'IPP BU'
            : item.division_id === '300000003618190'
              ? 'FPP BU'
              : null,

        request_for_arabic_label:
          item.request_for === 'Business Single'
            ? 'مفردة'
            : item.request_for === 'Business Multiple'
              ? 'متعددة'
              : null,

        letter_date_display: dateDisplay(item.letter_date),
      };
    },
  };
}
