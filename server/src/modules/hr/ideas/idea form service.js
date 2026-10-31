import { randomUUID } from 'node:crypto';

import {
  POOLS,
  withConnection as defaultRead,
  withTransaction as defaultWrite,
} from '../../../database/oracle.js';

import { AppError } from '../../../shared/errors/AppError.js';

import * as repository from './idea form repository.js';

const years = {
  computer: 4,
  machine: 10,
  robot: 10,
  tools: 5,
  mold: 5,
  auxiliary: 5,
  building: 30,
  material: 0,
  exchange_rate: 0,
};

const divisions = [
  {
    id: '300000003618177',
    name: 'IPP BU',
  },
  {
    id: '300000003618190',
    name: 'FPP BU',
  },
];

const projectTypes = ['innovation', 'development', 'environmental', 'automation'];

const bad = (field, msg) => new AppError(400, 'VALIDATION_ERROR', msg, [{ field, message: msg }]);

const missing = () => new AppError(404, 'RESOURCE_NOT_FOUND', 'Idea not found');

const blocked = (s) => new AppError(409, 'IDEA_LOCKED', `Idea is ${s} and cannot be modified`);

const round = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

const number = (v) => {
  if (v === undefined || v === null || v === '') {
    return 0;
  }

  const n = Number(String(v).replaceAll(',', '').replaceAll("'", ''));

  return Number.isFinite(n) ? n : NaN;
};

// Server-side feasibility calculations
export function calculate(x) {
  const amt = x.hasInvestment === 'no' ? 0 : number(x.investmentValue);

  const saving = number(x.saving);
  const n = years[x.investmentCategory];

  if (!Number.isFinite(amt) || amt < 0 || !Number.isFinite(saving) || saving < 0) {
    throw bad('investmentValue', 'Investment value and saving must be nonnegative numbers');
  }

  if (x.hasInvestment === 'yes' && amt <= 0) {
    throw bad('investmentValue', 'Investment value must be positive');
  }

  // Confirmed legacy zero-year behavior.
  if (!n) {
    return {
      investmentValue: amt,
      saving,
      depreciation: 0,
      irr: 0,
      npv: 0,
      roi: 0,
    };
  }

  const depreciation = amt / n;
  const cash = saving + depreciation;

  // Corrected NPV formula with 8% discount.
  let npv = -amt;

  for (let t = 1; t <= n; t++) {
    npv += cash / 1.08 ** t;
  }

  // IRR using Newton-Raphson.
  let rate = 0.1;
  let irr = 0;

  for (let k = 0; k < 100; k++) {
    let val = -amt;
    let der = 0;

    for (let t = 1; t <= n; t++) {
      val += cash / (1 + rate) ** t;

      der -= (t * cash) / (1 + rate) ** (t + 1);
    }

    if (Math.abs(val) < 0.00001) {
      irr = round(rate * 100);
      break;
    }

    if (!Number.isFinite(der) || Math.abs(der) < 1e-12 || rate <= -0.999999) {
      break;
    }

    rate -= val / der;
  }

  // Confirmed standard ROI formula.
  return {
    investmentValue: amt,
    saving,
    depreciation: round(depreciation),
    irr,
    npv: round(npv),
    roi: amt > 0 ? round((saving * n - amt) / amt) : 0,
  };
}

export function createIdeaService({
  withConnection = defaultRead,
  withTransaction = defaultWrite,
  repo = repository,
} = {}) {
  const read = (fn) => withConnection(POOLS.LOW, fn);

  const write = (fn) => withTransaction(POOLS.LOW, fn);

  const check = (s) => {
    if (!['DRAFT', 'REJECTED'].includes(s)) {
      throw blocked(s);
    }
  };

  async function employee(c, empNo) {
    const e = await repo.employee(c, empNo);

    if (!e) {
      throw bad('empNo', 'Current employee not found');
    }

    return e;
  }

  async function prepared(c, x) {
    const e = await employee(c, x.empNo);

    return {
      ...x,
      empName: e.empName,
      department: e.department,
      ...calculate(x),
    };
  }

  async function owned(c, id, userId, lock = false) {
    const row = await repo.get(c, id, lock);

    if (!row) {
      throw missing();
    }

    if (!(await repo.isHr(c, userId)) && String(row.createdBy) !== String(userId)) {
      throw missing();
    }

    return row;
  }

  return {
    list: (auth, f) => read((c) => repo.list(c, auth.userId, f)),

    get: (auth, id) =>
      read(async (c) => ({
        ...(await owned(c, id, auth.userId)),
        attachments: await repo.attachments(c, id),
      })),

    create: (auth, x) =>
      write(async (c) => {
        const data = await prepared(c, x);

        const id = await repo.create(c, data, auth.userId, randomUUID());

        return {
          ...(await repo.get(c, id)),
          attachments: [],
        };
      }),

    update: (auth, id, x) =>
      write(async (c) => {
        const old = await owned(c, id, auth.userId, true);

        check(old.status);

        const data = await prepared(c, x);

        if (!(await repo.update(c, id, data))) {
          throw blocked(old.status);
        }

        return repo.get(c, id);
      }),

    feasibility: (auth, id) =>
      write(async (c) => {
        const old = await owned(c, id, auth.userId, true);

        check(old.status);

        const calc = calculate({
          hasInvestment: old.hasInvestment,
          investmentValue: old.investmentValue,
          saving: old.saving,
          investmentCategory: old.investmentCategory,
        });

        await repo.feasibility(c, id, calc);

        return repo.get(c, id);
      }),

    remove: async (auth, id) =>
      read(async (c) => {
        const old = await owned(c, id, auth.userId);

        check(old.status);

        throw new AppError(
          409,
          'SOFT_DELETE_SCHEMA_UNDEFINED',
          'Soft delete cannot be executed: the documented Idea table has no deletion marker or existing deletion mechanism',
        );
      }),

    employees: (q) => read((c) => repo.employees(c, q)),

    employee: (empNo) =>
      read(async (c) => {
        const e = await employee(c, empNo);

        const division =
          e.sourceDivision === '300000003618177'
            ? divisions[0]
            : ['300000002689307', '300000003618190'].includes(String(e.sourceDivision))
              ? divisions[1]
              : null;

        return {
          empNo: e.empNo,
          empName: e.empName,
          department: e.department,
          divisionId: division?.id ?? null,
          divisionName: division?.name ?? null,
        };
      }),

    divisions: () => divisions,

    categories: () => ({
      projectTypes: projectTypes.map((v) => ({
        value: v,
        label: v[0].toUpperCase() + v.slice(1),
      })),

      investmentCategories: Object.entries(years).map(([v, n]) => ({
        value: v,
        label: v
          .split('_')
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(' '),
        depreciationYears: n,
      })),
    }),

    attachments: (auth, id) =>
      read(async (c) => {
        await owned(c, id, auth.userId);

        return repo.attachments(c, id);
      }),

    upload: async () => {
      throw new AppError(
        409,
        'ATTACHMENT_KEY_UNDEFINED',
        'Attachment upload requires a verified database-generated attachment HEADER_ID mechanism',
      );
    },

    deleteAttachment: async () => {
      throw new AppError(
        409,
        'ATTACHMENT_KEY_UNDEFINED',
        'Attachment deletion requires verified file storage and attachment key behavior',
      );
    },
  };
}
