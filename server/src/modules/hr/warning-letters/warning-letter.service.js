import { randomInt } from 'node:crypto';

import { POOLS, withConnection, withTransaction } from '../../../database/oracle.js';

import { AppError } from '../../../shared/errors/AppError.js';

import { repository as defaultRepository } from './warning-letter.repository.js';

import { normalizeBody } from './warning-letter.validation.js';

const fail = (status, code, message, details) => new AppError(status, code, message, details);

const actor = (auth) => String(auth?.userId ?? auth?.id ?? auth?.user?.id ?? auth?.username ?? '');

const check = (auth) => {
  const currentActor = actor(auth);

  if (!currentActor) {
    throw fail(401, 'UNAUTHENTICATED', 'Authentication required');
  }

  return currentActor;
};

const validation = (fn) => {
  try {
    return fn();
  } catch (error) {
    if (error.field) {
      throw fail(400, error.code, 'Validation failed', [
        {
          field: error.field,
          message: error.message,
        },
      ]);
    }

    throw error;
  }
};

const bilingual = {
  title: {
    en: 'Warning Letter',
    ar: 'إنذار خطي',
  },

  reference: {
    en: 'Ref. No',
    ar: 'رقم المرجع',
  },

  date: {
    en: 'Date',
    ar: 'التاريخ',
  },

  warning_no: {
    en: 'Warning No',
    ar: 'رقم الإنذار',
  },

  written: {
    en: 'Written',
    ar: 'إنذار كتابي',
  },

  employee_name: {
    en: 'Employee Name',
    ar: 'اسم الموظف',
  },

  job_title: {
    en: 'Job Title',
    ar: 'الوظيفة',
  },

  employee_no: {
    en: 'Employee No',
    ar: 'الرقم الوظيفي',
  },

  policy: {
    en: 'Due to not following company rules and regulations, this warning letter is issued as per the policy for the reason(s) ticked below:',
    ar: 'نظراً لعدم الالتزام بقوانين وأنظمة الشركة، تم إصدار هذا الإنذار حسب السياسة للأسباب الموضحة أدناه:',
  },

  reasons: {
    irregular_flag: {
      en: 'Irregular on Duty',
      ar: 'التأخير المتكرر في الحضور أو الانصراف',
    },

    absent_flag: {
      en: 'Absent without permission',
      ar: 'الغياب بدون إذن',
    },

    eating_flag: {
      en: 'Eating in prohibited place',
      ar: 'الأكل في غير المكان المحدد',
    },

    delaying_flag: {
      en: 'Delaying assigned job',
      ar: 'التأخير في أداء العمل',
    },

    make_problems_flag: {
      en: 'Creating problems at work',
      ar: 'إحداث مشاكل في مكان العمل',
    },
  },

  action: {
    en: 'Action',
    ar: 'الإجراء',
  },

  others: {
    en: 'Others',
    ar: 'أخرى',
  },
};

export function createWarningLetterService({
  repository = defaultRepository,
  withConnection: conn = withConnection,
  withTransaction: tx = withTransaction,
} = {}) {
  const read = async (id) =>
    conn(POOLS.LOW, async (connection) => {
      const row = await repository.read(connection, id);

      if (!row) {
        throw fail(404, 'NOT_FOUND', 'Warning letter not found');
      }

      return row;
    });

  return {
    read,

    print: async (id) => ({
      ...(await read(id)),
      labels: bilingual,
    }),

    employees: async (query) =>
      conn(POOLS.LOW, (connection) => repository.employees(connection, query)),

    employee: async (empNo) =>
      conn(POOLS.LOW, async (connection) => {
        const employee = await repository.employee(connection, empNo);

        if (!employee) {
          throw fail(404, 'EMP_NOT_FOUND', 'Employee not found');
        }

        return {
          ...employee,
          warning_no: await repository.nextWarning(connection, empNo),
        };
      }),

    list: async (query) => conn(POOLS.LOW, (connection) => repository.list(connection, query)),

    create: async (body, auth) => {
      const currentActor = check(auth);

      const payload = validation(() => normalizeBody(body, true));

      return tx(POOLS.LOW, async (connection) => {
        const employee = await repository.employee(connection, payload.emp_no, true);

        if (!employee) {
          throw fail(400, 'EMP_NOT_FOUND', 'Employee not found', [
            {
              field: 'emp_no',
              message: 'Employee not found',
            },
          ]);
        }

        const warningNo = await repository.nextWarning(connection, payload.emp_no);

        const id = await repository.insert(connection, payload, employee, warningNo, currentActor);

        let saved = false;

        for (let attempt = 0; attempt < 2; attempt++) {
          const referenceNo = `ZPIL/${id}/${randomInt(1000, 10000)}`;

          try {
            await repository.setReference(connection, id, referenceNo);

            saved = true;
            break;
          } catch (error) {
            if (error.errorNum !== 1) {
              throw error;
            }
          }
        }

        if (!saved) {
          throw fail(409, 'REFERENCE_CONFLICT', 'Reference number collision');
        }

        return repository.read(connection, id);
      });
    },

    update: async (id, body, auth) => {
      const currentActor = check(auth);

      return tx(POOLS.LOW, async (connection) => {
        const before = await repository.read(connection, id);

        if (!before) {
          throw fail(404, 'NOT_FOUND', 'Warning letter not found');
        }

        const payload = validation(() =>
          normalizeBody(
            {
              ...before,
              ...body,
            },
            false,
          ),
        );

        await repository.update(connection, id, payload, currentActor);

        return repository.read(connection, id);
      });
    },

    remove: async (id) =>
      tx(POOLS.LOW, async (connection) => {
        const result = await repository.remove(connection, id);

        if (!result.rowsAffected) {
          throw fail(404, 'NOT_FOUND', 'Warning letter not found');
        }

        return {
          id: Number(id),
        };
      }),
  };
}
