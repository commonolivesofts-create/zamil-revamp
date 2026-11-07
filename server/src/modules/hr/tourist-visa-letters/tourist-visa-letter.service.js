import { randomUUID, randomInt } from 'node:crypto';

import {
  POOLS,
  withConnection as defaultConnection,
  withTransaction as defaultTransaction,
} from '../../../database/oracle.js';

import { AppError } from '../../../shared/errors/AppError.js';

import { repository as defaultRepository } from './tourist-visa.repository.js';

const fail = (status, code, message) => new AppError(status, code, message);

const digits = (value) =>
  String(value ?? '').replace(/[0-9]/g, (digit) =>
    String.fromCharCode(digit.charCodeAt(0) + 0x630),
  );

const number = (value) => {
  const cleaned = String(value ?? '')
    .replace(/,/g, '')
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x660))
    .replace(/[^0-9.-]/g, '');

  // A blank or non-numeric salary is rejected, not silently stored as 0.
  if (!/\d/.test(cleaned)) return null;

  const parsed = Number(cleaned);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const small = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function en(n) {
  if (n < 20) return small[n];

  if (n < 100) {
    return tens[Math.floor(n / 10)] + (n % 10 ? ` ${en(n % 10)}` : '');
  }

  if (n < 1000) {
    return `${en(Math.floor(n / 100))} Hundred` + (n % 100 ? ` ${en(n % 100)}` : '');
  }

  for (const [value, label] of [
    [1e9, 'Billion'],
    [1e6, 'Million'],
    [1000, 'Thousand'],
  ]) {
    if (n >= value) {
      return `${en(Math.floor(n / value))} ${label}` + (n % value ? ` ${en(n % value)}` : '');
    }
  }

  return 'Zero';
}

const arSmall = [
  'صفر',
  'واحد',
  'اثنان',
  'ثلاثة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'ثمانية',
  'تسعة',
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر',
];

const arTens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];

function ar(n) {
  if (n < 20) return arSmall[n];

  if (n < 100) {
    return (n % 10 ? `${ar(n % 10)} و ` : '') + arTens[Math.floor(n / 10)];
  }

  if (n < 1000) {
    return (
      (Math.floor(n / 100) === 1 ? 'مائة' : `${ar(Math.floor(n / 100))} مائة`) +
      (n % 100 ? ` و ${ar(n % 100)}` : '')
    );
  }

  for (const [value, label] of [
    [1e9, 'مليار'],
    [1e6, 'مليون'],
    [1000, 'ألف'],
  ]) {
    if (n >= value) {
      return `${ar(Math.floor(n / value))} ${label}` + (n % value ? ` و ${ar(n % value)}` : '');
    }
  }

  return 'صفر';
}

function words(value, arabic = false) {
  const major = Math.floor(value);
  const minor = Math.round((value - major) * 100);

  if (major > 999999999999) {
    throw fail(400, 'SALARY_INVALID', 'Salary exceeds supported word range');
  }

  if (arabic) {
    return `${ar(major)} ريال سعودي` + (minor ? ` و ${ar(minor)} هللة` : '') + ' فقط';
  }

  return `${en(major)} Saudi Riyals` + (minor ? ` and ${en(minor)} Halalas` : '') + ' Only';
}

function mapEmployee(employee) {
  return {
    employee_no: String(employee.employee_no),
    employee_name: employee.employee_name,
    employee_name_ar: employee.employee_name_ar,

    nationality: employee.nationality,
    nationality_ar: employee.nationality_ar,

    passport_no: employee.passport_no,
    national_id: employee.national_id,

    position: employee.position,
    position_ar: employee.position_ar,

    employee_nationality: employee.nationality,
    employee_nationality_ar: employee.nationality_ar,

    manager_passport: employee.passport_no,
    manager_passport_ar: digits(employee.passport_no),

    salary: employee.salary,

    contract: employee.contract,
    contract_ar: employee.contract,

    tourism_from: employee.country,
    tourism_from_ar: employee.country_ar,

    employee_no_ar: digits(employee.employee_no),
    passport_no_ar: digits(employee.passport_no),
    national_id_ar: digits(employee.national_id),
  };
}

const actor = (auth) => {
  const currentActor = String(auth?.userId ?? auth?.id ?? auth?.user?.id ?? auth?.username ?? '');

  if (!currentActor) {
    throw fail(401, 'UNAUTHENTICATED', 'Authentication required');
  }

  return currentActor;
};

const required = ['employee_name', 'nationality', 'passport_no', 'national_id', 'position'];

const iso = () => new Date().toISOString().slice(0, 10);

export function createTouristVisaService({
  repository = defaultRepository,
  withConnection = defaultConnection,
  withTransaction = defaultTransaction,
} = {}) {
  const types = async (connection) => {
    const cols = await repository.metadata(connection);

    if (!cols.length) {
      throw fail(503, 'SCHEMA_UNVERIFIED', 'Tourist visa table metadata is unavailable');
    }

    return new Map(cols.map((column) => [column.column_name, column.data_type]));
  };

  const read = (uuid) =>
    withConnection(POOLS.LOW, async (connection) => {
      const result = await repository.get(connection, uuid, await types(connection));

      if (!result) {
        throw fail(404, 'NOT_FOUND', 'Tourist visa letter not found');
      }

      return result;
    });

  const prepare = async (connection, body, existing) => {
    const result = { ...existing, ...body };

    const employeeRows = await repository.employee(
      connection,
      existing?.employee_no ?? body.employee_no,
    );

    if (employeeRows.length !== 1) {
      throw fail(
        employeeRows.length ? 409 : 400,
        'EMP_NOT_FOUND',
        'Employee not found or ambiguous',
      );
    }

    const snapshot = mapEmployee(employeeRows[0]);

    if (!existing) {
      Object.assign(result, snapshot);

      // The origin is the requester's answer, not the employee's home country;
      // the snapshot only supplies it as a default.
      if (body.tourism_from !== undefined) {
        result.tourism_from = body.tourism_from;
      }

      if (body.tourism_from_ar !== undefined) {
        result.tourism_from_ar = body.tourism_from_ar;
      }
    } else {
      result.employee_no = existing.employee_no;

      for (const key of [
        'employee_no',
        'employee_no_ar',
        'employee_name',
        'employee_name_ar',
        'nationality',
        'nationality_ar',
        'passport_no',
        'passport_no_ar',
        'national_id',
        'national_id_ar',
        'position',
        'position_ar',
        'employee_nationality',
        'employee_nationality_ar',
        'manager_passport',
        'manager_passport_ar',
        'contract',
        'contract_ar',
      ]) {
        result[key] = existing[key];
      }
    }

    if (!result.cur_date) {
      result.cur_date = iso();
    }

    if (!result.cur_date_ar) {
      try {
        const formatted = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(new Date(`${result.cur_date}T12:00:00Z`));

        const [month, day, year] = formatted.match(/\d+/g) ?? [];

        if (month && day && year) {
          result.cur_date_ar = `${day}/${month}/${year}`;
        }
      } catch {
        // Never substitute a fake Gregorian-to-Hijri conversion.
      }
    }

    const salary = number(!existing ? snapshot.salary : result.salary);

    if (salary === null) {
      throw fail(400, 'SALARY_INVALID', 'Valid salary required');
    }

    result.salary = salary;
    result.salary_ar = salary;

    result.salary_word = result.salary_word || words(salary);

    result.salary_word_ar = result.salary_word_ar || words(salary, true);

    for (const key of required) {
      if (!result[key]) {
        throw fail(400, 'FIELD_REQUIRED', `${key} is missing from employee master`);
      }
    }

    const countries = await repository.countries(connection);

    const found = (value) =>
      countries.some(
        (country) => country.country?.toUpperCase() === String(value ?? '').toUpperCase(),
      );

    if (!found(result.country) || !found(result.tourism_to) || !found(result.tourism_from)) {
      throw fail(400, 'COUNTRY_INVALID', 'Country, origin or destination is invalid');
    }

    result.country_ar = (await repository.country(connection, result.country))?.country_ar;

    if (!result.tourism_to_ar) {
      result.tourism_to_ar = (await repository.country(connection, result.tourism_to))?.country_ar;
    }

    if (!result.tourism_from_ar) {
      result.tourism_from_ar = (
        await repository.country(connection, result.tourism_from)
      )?.country_ar;
    }

    const approvers = await repository.approvers(connection);

    const signer = approvers.find(
      (entry) =>
        entry.approval_name === result.approval_name &&
        entry.position_name === result.position_name,
    );

    if (!signer) {
      throw fail(400, 'APPROVER_INVALID', 'Approver name and position are invalid');
    }

    return result;
  };

  return {
    read,

    async create(body, auth) {
      const currentActor = actor(auth);

      return withTransaction(POOLS.LOW, async (connection) => {
        const schema = await types(connection);

        const data = await prepare(connection, body);

        data.uuid = randomUUID();
        data.created_by = currentActor;

        for (let attempt = 0; attempt < 3; attempt++) {
          data.ref_no =
            `ZPIL/${String(new Date().getFullYear()).slice(-2)}` + `/${randomInt(100, 1000)}`;

          try {
            await repository.insert(connection, data, schema);

            return await repository.get(connection, data.uuid, schema);
          } catch (error) {
            if (error.errorNum !== 1) {
              throw error;
            }

            if (attempt === 2) {
              throw fail(409, 'REF_COLLISION', 'Reference number collision');
            }
          }
        }
      });
    },

    async update(uuid, body, auth) {
      const currentActor = actor(auth);

      return withTransaction(POOLS.LOW, async (connection) => {
        const schema = await types(connection);

        const previous = await repository.get(connection, uuid, schema);

        if (!previous) {
          throw fail(404, 'NOT_FOUND', 'Tourist visa letter not found');
        }

        if (
          body.employee_no !== undefined &&
          String(body.employee_no) !== String(previous.employee_no)
        ) {
          throw fail(409, 'IMMUTABLE_EMPLOYEE', 'Employee reassignment is forbidden');
        }

        const data = await prepare(connection, body, previous);

        data.updated_by = currentActor;

        await repository.update(connection, uuid, data, schema);

        return repository.get(connection, uuid, schema);
      });
    },

    async remove(uuid) {
      return withTransaction(POOLS.LOW, async (connection) => {
        const affected = await repository.remove(connection, uuid);

        if (!affected) {
          throw fail(404, 'NOT_FOUND', 'Tourist visa letter not found');
        }

        return { uuid };
      });
    },

    list: (query) =>
      withConnection(POOLS.LOW, async (connection) =>
        repository.list(connection, query, await types(connection)),
      ),

    countries: () => withConnection(POOLS.LOW, (connection) => repository.countries(connection)),

    country: (country) =>
      withConnection(POOLS.LOW, async (connection) => {
        const result = await repository.country(connection, country);

        if (!result) {
          throw fail(404, 'NOT_FOUND', 'Country not found');
        }

        return result;
      }),

    employees: (query) =>
      withConnection(POOLS.LOW, (connection) => repository.employees(connection, query)),

    employee: (employeeNo) =>
      withConnection(POOLS.LOW, async (connection) => {
        const result = await repository.employee(connection, employeeNo);

        if (!result.length) {
          throw fail(404, 'EMP_NOT_FOUND', 'Employee not found');
        }

        if (result.length > 1) {
          throw fail(409, 'AMBIGUOUS_EMPLOYEE', 'Employee lookup is ambiguous');
        }

        return {
          ...result[0],
          ...mapEmployee(result[0]),
        };
      }),

    approvers: () => withConnection(POOLS.LOW, (connection) => repository.approvers(connection)),

    print: async (uuid) => ({
      title: 'Tourist Visa Letter',
      record: await read(uuid),

      labels: {
        to: 'To,',
        to_ar: 'إلى',
        salutation: 'His Excellency Consul General, Riyadh - Kingdom of Saudi Arabia',
        salutation_ar: 'سعادة القنصل العام المحترم الرياض – المملكة العربية السعودية',
        greeting: 'With Compliments',
        greeting_ar: 'بعد التحية ،،،',
        closing: 'Anticipating your assistance in this regard.',
        closing_ar: 'وتفضلوا بقبول فائق الاحترام ،،،',
      },

      direction: {
        tourism_to: 'destination',
        tourism_from: 'origin',
      },
    }),
  };
}
