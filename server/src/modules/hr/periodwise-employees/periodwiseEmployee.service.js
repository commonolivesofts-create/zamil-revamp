import { POOLS, withConnection as defaultWithConnection } from '../../../database/oracle.js';
import * as defaultRepository from './periodwiseEmployee.repository.js';
import { AGE_BANDS } from './periodwiseEmployee.validation.js';

// Report rules (formerly computed in the browser, client report/periodwiseModel.js).
export const RETIREMENT_AGE = 60;
export const MINIMUM_AGE = 16;
export const SAUDI = 'Saudi';
export const FLOW_YEARS = 6;
export const FLAGS = Object.freeze({ BIRTH_DATE: 'BIRTH_DATE', NATIONAL_ID: 'NATIONAL_ID' });

const utc = (iso) => new Date(`${iso}T00:00:00Z`);
const oneDecimal = (value) => Math.round(value * 10) / 10;
const average = (items, key) =>
  items.length ? items.reduce((sum, item) => sum + (item[key] || 0), 0) / items.length : 0;

/** Completed years on `on` (both YYYY-MM-DD); null without a birth date. */
export function ageOn(birthDate, on) {
  if (!birthDate) return null;
  const birth = utc(birthDate);
  const day = utc(on);
  let age = day.getUTCFullYear() - birth.getUTCFullYear();
  if (
    day.getUTCMonth() < birth.getUTCMonth() ||
    (day.getUTCMonth() === birth.getUTCMonth() && day.getUTCDate() < birth.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}

/** Years between two dates (365.25-day years), 2 decimals; 0 when reversed. */
export function yearsBetween(from, to) {
  if (!from || !to || to < from) return 0;
  return Math.round(((utc(to) - utc(from)) / (365.25 * 864e5)) * 100) / 100;
}

/** Age (today), service (start to the earlier of end and dateTo), active, 60+ and flags. */
export function deriveRow(row, { dateTo }, today) {
  const age = ageOn(row.birthDate, today);
  const flags = [];
  if (age !== null && age < MINIMUM_AGE) flags.push(FLAGS.BIRTH_DATE);
  if (!row.hasNationalId) flags.push(FLAGS.NATIONAL_ID);
  return {
    employeeNumber: String(row.employeeNumber),
    name: row.name ?? '',
    birthDate: row.birthDate ?? null,
    age,
    nationality: row.nationality ?? '',
    jobTitle: row.jobTitle ?? '',
    position: row.position ?? '',
    departmentCode: row.departmentCode ?? null,
    departmentName: row.departmentName ?? '',
    hasNationalId: Boolean(row.hasNationalId),
    startDate: row.startDate,
    endDate: row.endDate ?? null,
    years: yearsBetween(row.startDate, row.endDate && row.endDate < dateTo ? row.endDate : dateTo),
    leavingReason: row.leavingReason ?? '',
    active: !row.endDate || row.endDate > dateTo,
    senior: age !== null && age >= RETIREMENT_AGE,
    flags,
  };
}

const countBy = (items, keyOf) => {
  const counts = new Map();
  for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || String(a[0] ?? '').localeCompare(String(b[0] ?? '')),
  );
};
const inBand = (age, [, min, max]) => age !== null && age >= min && age <= max;

/**
 * KPIs and chart data for every row in scope. Turnover = leavers ÷ the average of the period
 * headcount and the active headcount. Nationality and age bands count active employees only.
 */
export function summarise(items, { dateFrom, dateTo }, today) {
  const active = items.filter((item) => item.active);
  const leavers = items.filter(
    (item) => item.endDate && item.endDate >= dateFrom && item.endDate <= dateTo,
  );
  const averageHeadcount = (items.length + active.length) / 2 || 1;
  const names = new Map(items.map((item) => [item.departmentCode, item.departmentName]));
  const year = Number(today.slice(0, 4));
  return {
    total: items.length,
    active: active.length,
    joiners: items.filter((item) => item.startDate >= dateFrom && item.startDate <= dateTo).length,
    leavers: leavers.length,
    turnover: oneDecimal((leavers.length / averageHeadcount) * 100),
    saudization: active.length
      ? oneDecimal(
          (active.filter((item) => item.nationality === SAUDI).length / active.length) * 100,
        )
      : 0,
    averageAge: oneDecimal(
      average(
        active.filter((item) => item.age !== null && item.age >= MINIMUM_AGE),
        'age',
      ),
    ),
    senior: active.filter((item) => item.senior).length,
    averageService: oneDecimal(average(active, 'years')),
    flagged: items.filter((item) => item.flags.length).length,
    byDepartment: countBy(items, (item) => item.departmentCode).map(([code, count]) => ({
      code,
      name: names.get(code) ?? '',
      count,
    })),
    byNationality: countBy(active, (item) => item.nationality).map(([name, count]) => ({
      name,
      count,
    })),
    ageBands: AGE_BANDS.map((band) => ({
      band: band[0],
      count: active.filter((item) => inBand(item.age, band)).length,
    })),
    yearlyFlow: Array.from({ length: FLOW_YEARS }, (_, index) => {
      const label = String(year - FLOW_YEARS + 1 + index);
      return {
        year: label,
        joiners: items.filter((item) => item.startDate.startsWith(label)).length,
        leavers: items.filter((item) => item.endDate?.startsWith(label)).length,
      };
    }),
  };
}

/** Table refinements: search, a chart's nationality or age band, and "needs checking". */
export function refine(items, { search, nationality, ageBand, flagged }) {
  const term = (search ?? '').trim().toLowerCase();
  const band = AGE_BANDS.find(([code]) => code === ageBand);
  return items.filter(
    (item) =>
      (!nationality || item.nationality === nationality) &&
      (!band || inBand(item.age, band)) &&
      (!flagged || item.flags.length > 0) &&
      (!term ||
        `${item.employeeNumber} ${item.name} ${item.jobTitle} ${item.departmentName}`
          .toLowerCase()
          .includes(term)),
  );
}

/** Stable sort; empty values first ascending; numbers (and employee numbers) numerically. */
export function sortItems(items, sortBy, sortDir) {
  const direction = sortDir === 'asc' ? 1 : -1;
  const value = (item) => item[sortBy] ?? '';
  return items
    .map((item, index) => [item, index])
    .sort(([a, i], [b, j]) => {
      const x = value(a);
      const y = value(b);
      const order =
        typeof x === 'number' && typeof y === 'number'
          ? x - y
          : String(x).localeCompare(String(y), 'en', { numeric: true });
      return order * direction || i - j;
    })
    .map(([item]) => item);
}

const utcToday = () => new Date().toISOString().slice(0, 10);

export function createPeriodwiseEmployeeService({
  repository = defaultRepository,
  withConnection = defaultWithConnection,
  today = utcToday,
} = {}) {
  const read = (work) => withConnection(POOLS.LOW, work);
  return {
    /**
     * One page of rows (after refinements, sorted) and the summary of the full scope, which
     * the employee master bounds (one row per employee).
     */
    async report(query) {
      const day = today();
      const scope = await read((connection) =>
        repository.listScope(connection, {
          dateFrom: query.dateFrom,
          dateTo: query.dateTo,
          department: query.department,
          status: query.status,
        }),
      );
      const items = scope.map((row) => deriveRow(row, query, day));
      const rows = sortItems(refine(items, query), query.sortBy, query.sortDir);
      const offset = (query.page - 1) * query.pageSize;
      return {
        items: rows.slice(offset, offset + query.pageSize),
        total: rows.length,
        summary: summarise(items, query, day),
      };
    },

    departments() {
      return read((connection) => repository.listDepartments(connection));
    },
  };
}
