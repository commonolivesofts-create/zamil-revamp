import Joi from 'joi';

const id = Joi.string().pattern(/^[1-9]\d{0,18}$/);

const date = Joi.string()
  .pattern(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
  .custom((v, h) => {
    const [y, m, d] = v.split('-').map(Number);
    const z = new Date(Date.UTC(y, m - 1, d));

    return z.getUTCFullYear() === y && z.getUTCMonth() === m - 1 && z.getUTCDate() === d
      ? v
      : h.error('date.invalid');
  });

const nullableDate = date.allow(null, '');

const txt = (n = 1000) => Joi.string().trim().max(n).allow('', null);

const signature = Joi.string().valid('', 'Approved', 'Rejected', 'Hold').default('');

const sections = {
  employeeDept: [
    'files',
    'tools',
    'instruments',
    'book_manuals',
    'manuals',
    'office_keys',
    'documents',
    'locker_keys',
    'safety_items',
    'vehicle',
    'office_stationary',
    'others',
  ],
  quality: ['uniform', 'knife', 'documents', 'others'],
  warehouse: ['tools', 'others'],
  accounts: ['loans', 'others'],
  admin: [
    'iqama',
    'id_cards',
    'bank_loan',
    'driving_license',
    'gurantor',
    'mobile_chip',
    'medical_cards',
    'door_attendance',
    'others',
  ],
};

const section = (key) =>
  Joi.object({
    items: Joi.array()
      .items(Joi.string().valid(...sections[key]))
      .unique()
      .default([]),

    comments: txt(2000).default(''),

    ...(key !== 'admin' ? { cost: Joi.number().min(0).allow(null).default(null) } : {}),

    approver: txt(500).default(''),
    signature,

    ...(key === 'admin' ? { appDate: nullableDate, visaExpiry: nullableDate } : {}),
  }).default();

export const writeBodySchema = Joi.object({
  employee: Joi.object({
    empNo: Joi.number().integer().positive().required(),
  })
    .unknown(true)
    .required(),

  contact: Joi.string().trim().min(1).max(100).required(),
  purpose: Joi.string().trim().min(1).max(1000).required(),

  vacationFrom: nullableDate,
  vacationTo: nullableDate,

  departmentManager: Joi.object({
    name: Joi.string().trim().min(1).max(500).required(),
    empNo: Joi.any().strip(),
    date: nullableDate,
    signature,
  }).required(),

  itManager: Joi.object({
    name: txt(500).default(''),
    date: nullableDate,
    signature,
  }).default(),

  computerReceivedBy: Joi.string().trim().min(1).max(500).required(),

  computerSignature: signature,

  sections: Joi.object(
    Object.fromEntries(Object.keys(sections).map((k) => [k, section(k)])),
  ).default(),

  itMatrix: Joi.array()
    .length(5)
    .items(
      Joi.object({
        lineId: Joi.any().strip(),
        action: Joi.string()
          .valid(
            'delete',
            'no action',
            'remote access',
            'copy give to',
            'forward copy to',
            'cisco jaber',
            'disabled untill',
          )
          .required(),
        accessTo: txt(500),
      }).unknown(true),
    )
    .required(),
})
  .custom((v, h) => {
    if (v.vacationFrom && v.vacationTo && v.vacationTo < v.vacationFrom) {
      return h.error('any.invalid', {
        message: 'vacationTo must be on or after vacationFrom',
      });
    }

    for (const row of v.itMatrix) {
      if (row.action === 'disabled untill') {
        if (!row.accessTo || date.validate(row.accessTo).error) {
          return h.error('any.invalid', {
            message: 'disabled untill requires an ISO date',
          });
        }
      } else if (row.accessTo && /^\d{4}-\d{2}-\d{2}$/.test(row.accessTo)) {
        return h.error('any.invalid', {
          message: 'accessTo date only valid for disabled untill',
        });
      }
    }

    return v;
  })
  .unknown(true);

export const headerIdParams = Joi.object({
  headerId: id.required(),
});

export const listQuerySchema = Joi.object({
  status: Joi.string()
    .valid('Draft', 'InProcess', 'Approved', 'Accepted', 'Rejected', 'ALL')
    .insensitive(),
  q: txt(150),
  empNo: Joi.number().integer().positive(),
  department: txt(150),
  purpose: txt(150),
  createdFrom: date,
  createdTo: date,
  pendingAt: txt(150),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(25),
});

export const employeesQuerySchema = Joi.object({
  scope: Joi.string().valid('scoped', 'all').default('scoped'),
  q: txt(150),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(50),
});

export const approversQuerySchema = Joi.object({
  section: Joi.string()
    .valid('department', 'quality', 'warehouse', 'accounts', 'admin')
    .default('department'),
});

export const emptyQuerySchema = Joi.object({});

export const empParams = Joi.object({
  empNo: Joi.number().integer().positive().required(),
});

export const emptyBodySchema = Joi.object({});
