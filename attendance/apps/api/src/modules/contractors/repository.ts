// Contractors (CI3 Contractor_model + Con_employee_model) over the EBS tables named in EbsSource.
// Numbers and dates are read as Oracle text (TO_CHAR) because that is what CI3 showed and exported.
import type {
  ConEmployeeFilters,
  ConEmployeeInput,
  ConEmployeeOptions,
  ConEmployeeRow,
  ContractorDetailRow,
  ContractorFilters,
  ContractorInput,
  ContractorRow,
  ContractorStatsRow,
  ContractorSummaryRow,
} from '@attendance/shared';
import { pageMeta } from '@attendance/shared';
import type { EbsSource } from '../../db/ebsSource';
import { clean, num, type Binds, type Db, type Row } from '../../db/oracle';
import {
  Binder,
  buildWhere,
  containsCi,
  rownumPage,
  type ListQuery,
  type ListSpec,
} from '../../db/sql';
import type { ReportRepository } from '../report';

const todayIso = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const dateOrNull = (column: string, bind: string) =>
  `${column} = CASE WHEN :${bind} IS NULL THEN NULL ELSE TO_DATE(:${bind}, 'YYYY-MM-DD') END`;
const nullable = (value: string) => (value === '' ? null : value);
/** Oracle stores '' as NULL: compare both sides as "text or null". */
const same = (a: string | null, b: string | null) => (a ?? '').trim() === (b ?? '').trim();
const sameRate = (a: string | null, b: string | null) =>
  (a === null || a === '' ? null : Number(a)) === (b === null || b === '' ? null : Number(b));

/** A rule that ignores CI3's "ALL" choice. */
const exactUnlessAll =
  (expr: string) =>
  (value: string, b: Binder): string =>
    value.toUpperCase() === 'ALL' ? '1 = 1' : `${expr} = ${b.add(value)}`;

/* ------------------------------ contractors ------------------------------ */

export interface ContractorRepository extends ReportRepository<ContractorFilters, ContractorRow> {
  findById(id: number): Promise<ContractorRow | null>;
  findByNumber(conNumber: string): Promise<ContractorRow | null>;
  numberExists(conNumber: string, excludeId?: number): Promise<boolean>;
  insert(input: ContractorInput, userId: string): Promise<number>;
  update(
    id: number,
    input: ContractorInput,
    userId: string,
  ): Promise<{ found: boolean; changed: boolean }>;
  remove(id: number): Promise<boolean>;
  choices(): Promise<{ conNumber: string; conName: string | null }[]>;
}

const contractorColumns = `CON_ID, CON_NUMBER, CON_NAME, TO_CHAR(RATE) AS RATE, STATUS,
  TO_CHAR(START_DATE, 'YYYY-MM-DD') AS START_DATE, TO_CHAR(END_DATE, 'YYYY-MM-DD') AS END_DATE,
  TO_CHAR(CREATEB_BY) AS CREATEB_BY, TO_CHAR(CREATION_DATE, 'DD-MON-RR') AS CREATION_DATE,
  TO_CHAR(UPDATED_BY) AS UPDATED_BY, TO_CHAR(UPDATED_DATE, 'DD-MON-RR') AS UPDATED_DATE`;

const mapContractor = (r: Row): ContractorRow => ({
  id: num(r.CON_ID) ?? 0,
  conNumber: clean(r.CON_NUMBER),
  conName: clean(r.CON_NAME),
  rate: clean(r.RATE),
  status: clean(r.STATUS),
  startDate: clean(r.START_DATE),
  endDate: clean(r.END_DATE),
  createdBy: clean(r.CREATEB_BY),
  createdDate: clean(r.CREATION_DATE),
  updatedBy: clean(r.UPDATED_BY),
  updatedDate: clean(r.UPDATED_DATE),
});

export function oracleContractorRepository(db: Db, source: EbsSource): ContractorRepository {
  const table = source.tables.contractorInfo;
  const pool = source.pool;
  const spec: ListSpec<ContractorFilters> = {
    from: table,
    select: contractorColumns,
    filters: {
      conNumber: (v, b) => `UPPER(TRIM(CON_NUMBER)) = UPPER(TRIM(${b.add(v)}))`,
      conName: containsCi('CON_NAME'),
      status: (v, b) => `UPPER(TRIM(STATUS)) = UPPER(TRIM(${b.add(v)}))`,
    },
    search: ['TO_CHAR(CON_NUMBER)', 'CON_NAME', 'STATUS'],
    orderBy: 'CON_ID DESC',
  };
  const listSql = (query: ListQuery<ContractorFilters>) => {
    const b = new Binder();
    const where = buildWhere(spec, query, b);
    return {
      b,
      where,
      sql: `SELECT ${contractorColumns} FROM ${table}${where} ORDER BY CON_ID DESC`,
    };
  };
  const findOne = async (where: string, binds: Binds) => {
    const [row] = await db.query(
      pool,
      `SELECT ${contractorColumns} FROM ${table} WHERE ${where}`,
      binds,
    );
    return row ? mapContractor(row) : null;
  };

  return {
    async list(query) {
      const { b, where, sql } = listSql(query);
      const paged = rownumPage(sql, query.page, query.limit);
      const [count, rows] = await Promise.all([
        db.query(pool, `SELECT COUNT(1) AS TOTAL FROM ${table}${where}`, b.binds),
        db.query(pool, paged.sql, { ...b.binds, ...paged.binds }),
      ]);
      return {
        items: rows.map(mapContractor),
        pagination: pageMeta(query.page, query.limit, num(count[0]?.TOTAL) ?? 0),
      };
    },
    async exportRows(query) {
      const { b, sql } = listSql(query);
      return (await db.query(pool, sql, b.binds)).map(mapContractor);
    },
    findById: (id) => findOne('CON_ID = :id', { id }),
    findByNumber: (conNumber) => findOne('CON_NUMBER = :conNumber', { conNumber }),
    async numberExists(conNumber, excludeId) {
      const [row] = await db.query(
        pool,
        `SELECT COUNT(1) AS TOTAL FROM ${table} WHERE UPPER(TRIM(CON_NUMBER)) = UPPER(TRIM(:conNumber))${excludeId ? ' AND CON_ID <> :excludeId' : ''}`,
        excludeId ? { conNumber, excludeId } : { conNumber },
      );
      return (num(row?.TOTAL) ?? 0) > 0;
    },
    async insert(input, userId) {
      return db.transaction(pool, async (tx) => {
        const [next] = await tx.query(`SELECT NVL(MAX(CON_ID), 0) + 1 AS ID FROM ${table}`);
        const id = num(next?.ID) ?? 1;
        await tx.execute(
          `INSERT INTO ${table} (CON_ID, CON_NUMBER, CON_NAME, RATE, STATUS, START_DATE, END_DATE, CREATEB_BY, CREATION_DATE)
           VALUES (:id, :conNumber, :conName, :rate, :status,
                   CASE WHEN :startDate IS NULL THEN NULL ELSE TO_DATE(:startDate, 'YYYY-MM-DD') END,
                   CASE WHEN :endDate IS NULL THEN NULL ELSE TO_DATE(:endDate, 'YYYY-MM-DD') END,
                   :userId, TO_DATE(:today, 'YYYY-MM-DD'))`,
          {
            id,
            conNumber: input.conNumber,
            conName: input.conName,
            rate: input.rate === '' ? null : Number(input.rate),
            status: input.status,
            startDate: nullable(input.startDate),
            endDate: nullable(input.endDate),
            userId,
            today: todayIso(),
          },
        );
        return id;
      });
    },
    async update(id, input, userId) {
      const current = await findOne('CON_ID = :id', { id });
      if (!current) return { found: false, changed: false };
      const sets: string[] = [];
      const binds: Binds = { id };
      if (!same(current.conNumber, input.conNumber)) {
        sets.push('CON_NUMBER = :conNumber');
        binds.conNumber = input.conNumber;
      }
      if (!same(current.conName, input.conName)) {
        sets.push('CON_NAME = :conName');
        binds.conName = input.conName;
      }
      if (!sameRate(current.rate, input.rate)) {
        sets.push('RATE = :rate');
        binds.rate = input.rate === '' ? null : Number(input.rate);
      }
      if (!same(current.status, input.status)) {
        sets.push('STATUS = :status');
        binds.status = input.status;
      }
      if (!same(current.startDate, input.startDate)) {
        sets.push(dateOrNull('START_DATE', 'startDate'));
        binds.startDate = nullable(input.startDate);
      }
      if (!same(current.endDate, input.endDate)) {
        sets.push(dateOrNull('END_DATE', 'endDate'));
        binds.endDate = nullable(input.endDate);
      }
      if (sets.length === 0) return { found: true, changed: false };
      sets.push('UPDATED_BY = :userId', `UPDATED_DATE = TO_DATE(:today, 'YYYY-MM-DD')`);
      await db.execute(pool, `UPDATE ${table} SET ${sets.join(', ')} WHERE CON_ID = :id`, {
        ...binds,
        userId,
        today: todayIso(),
      });
      return { found: true, changed: true };
    },
    async remove(id) {
      return (
        (await db.execute(pool, `DELETE FROM ${table} WHERE CON_ID = :id`, { id })).rowsAffected > 0
      );
    },
    async choices() {
      const rows = await db.query(
        pool,
        `SELECT CON_NUMBER, CON_NAME FROM ${table} ORDER BY CON_ID DESC`,
      );
      return rows.map((r) => ({
        conNumber: clean(r.CON_NUMBER) ?? '',
        conName: clean(r.CON_NAME),
      }));
    },
  };
}

/* --------------------------- contractor employees --------------------------- */

export interface ConEmployeeRepository extends ReportRepository<
  ConEmployeeFilters,
  ConEmployeeRow
> {
  findById(id: number): Promise<ConEmployeeRow | null>;
  insert(input: ConEmployeeInput, userId: string): Promise<number>;
  update(
    id: number,
    input: ConEmployeeInput,
    userId: string,
  ): Promise<{ found: boolean; changed: boolean }>;
  remove(id: number): Promise<boolean>;
  options(): Promise<Omit<ConEmployeeOptions, 'contractors'>>;
}

const employeeColumns = `EMP_ID, DIVISION AS DIVISION_CODE,
  DECODE(DIVISION, 'IBM', 'IPP', 'Z3P', 'FPP', DIVISION) AS DIVISION,
  CON_NUMBER, CON_NAME, TO_CHAR(EMPLOYEE_NUMBER) AS EMPLOYEE_NUMBER, EMPLOYEE_NAME, TO_CHAR(IQAMAH) AS IQAMAH,
  DEPARTMENT, TO_CHAR(PROD_DEP) AS PROD_DEP, DIRECT_BOSS, TO_CHAR(DIRECT_BOSS_ID) AS DIRECT_BOSS_ID,
  TO_CHAR(JOB) AS JOB, JOB_TITLE, PLACE, TO_CHAR(REPLACEMENT) AS REPLACEMENT, TO_CHAR(RATE) AS RATE,
  TO_CHAR(START_DATE, 'YYYY-MM-DD') AS START_DATE, TO_CHAR(END_DATE, 'YYYY-MM-DD') AS END_DATE,
  STATUS, AJEER, SFDA, BLACKLIST, REMARK,
  TO_CHAR(CREATEB_BY) AS CREATEB_BY, TO_CHAR(CREATION_DATE, 'DD-MON-RR') AS CREATION_DATE,
  TO_CHAR(UPDATED_BY) AS UPDATED_BY, TO_CHAR(UPDATED_DATE, 'DD-MON-RR') AS UPDATED_DATE`;

const mapEmployee = (r: Row): ConEmployeeRow => ({
  id: num(r.EMP_ID) ?? 0,
  divisionCode: clean(r.DIVISION_CODE),
  division: clean(r.DIVISION),
  conNumber: clean(r.CON_NUMBER),
  conName: clean(r.CON_NAME),
  employeeNumber: clean(r.EMPLOYEE_NUMBER),
  employeeName: clean(r.EMPLOYEE_NAME),
  iqamah: clean(r.IQAMAH),
  department: clean(r.DEPARTMENT),
  prodDep: clean(r.PROD_DEP),
  directBoss: clean(r.DIRECT_BOSS),
  directBossId: clean(r.DIRECT_BOSS_ID),
  job: clean(r.JOB),
  jobTitle: clean(r.JOB_TITLE),
  place: clean(r.PLACE),
  replacement: clean(r.REPLACEMENT),
  rate: clean(r.RATE),
  startDate: clean(r.START_DATE),
  endDate: clean(r.END_DATE),
  status: clean(r.STATUS),
  ajeer: clean(r.AJEER),
  sfda: clean(r.SFDA),
  blacklist: clean(r.BLACKLIST),
  remark: clean(r.REMARK),
  createdBy: clean(r.CREATEB_BY),
  createdDate: clean(r.CREATION_DATE),
  updatedBy: clean(r.UPDATED_BY),
  updatedDate: clean(r.UPDATED_DATE),
});

/** Columns written from the form (CI3 update_con_employee columnMap; contractor is not changed). */
const EMPLOYEE_FIELDS: [column: string, key: keyof ConEmployeeInput & keyof ConEmployeeRow][] = [
  ['DIVISION', 'division'],
  ['EMPLOYEE_NUMBER', 'employeeNumber'],
  ['EMPLOYEE_NAME', 'employeeName'],
  ['IQAMAH', 'iqamah'],
  ['DEPARTMENT', 'department'],
  ['PROD_DEP', 'prodDep'],
  ['DIRECT_BOSS', 'directBoss'],
  ['DIRECT_BOSS_ID', 'directBossId'],
  ['JOB', 'job'],
  ['JOB_TITLE', 'jobTitle'],
  ['PLACE', 'place'],
  ['REPLACEMENT', 'replacement'],
  ['STATUS', 'status'],
  ['AJEER', 'ajeer'],
  ['SFDA', 'sfda'],
  ['BLACKLIST', 'blacklist'],
  ['REMARK', 'remark'],
];

export function oracleConEmployeeRepository(db: Db, source: EbsSource): ConEmployeeRepository {
  const t = source.tables;
  const table = t.conEmployeeInfo;
  const pool = source.pool;
  const spec: ListSpec<ConEmployeeFilters> = {
    from: table,
    select: employeeColumns,
    filters: {
      division: exactUnlessAll('DIVISION'),
      department: exactUnlessAll('DEPARTMENT'),
      status: (v, b) =>
        v.toUpperCase() === 'ALL' ? '1 = 1' : `UPPER(TRIM(STATUS)) = UPPER(TRIM(${b.add(v)}))`,
      conNumber: (v, b) => `CON_NUMBER = ${b.add(v)}`,
      // CI3 legacy semantics: from <= START_DATE and END_DATE <= to.
      startDate: (v, b) => `START_DATE >= TO_DATE(${b.add(v)}, 'YYYY-MM-DD')`,
      endDate: (v, b) => `END_DATE <= TO_DATE(${b.add(v)}, 'YYYY-MM-DD')`,
    },
    search: ['EMPLOYEE_NAME', 'TO_CHAR(EMPLOYEE_NUMBER)', 'CON_NAME', 'DEPARTMENT'],
    orderBy: 'EMP_ID DESC',
  };
  const listSql = (query: ListQuery<ConEmployeeFilters>) => {
    const b = new Binder();
    const where = buildWhere(spec, query, b);
    return {
      b,
      where,
      sql: `SELECT ${employeeColumns} FROM ${table}${where} ORDER BY EMP_ID DESC`,
    };
  };
  const findById = async (id: number) => {
    const [row] = await db.query(
      pool,
      `SELECT ${employeeColumns} FROM ${table} WHERE EMP_ID = :id`,
      { id },
    );
    return row ? mapEmployee(row) : null;
  };

  return {
    async list(query) {
      const { b, where, sql } = listSql(query);
      const paged = rownumPage(sql, query.page, query.limit);
      const [count, rows] = await Promise.all([
        db.query(pool, `SELECT COUNT(1) AS TOTAL FROM ${table}${where}`, b.binds),
        db.query(pool, paged.sql, { ...b.binds, ...paged.binds }),
      ]);
      return {
        items: rows.map(mapEmployee),
        pagination: pageMeta(query.page, query.limit, num(count[0]?.TOTAL) ?? 0),
      };
    },
    async exportRows(query) {
      const { b, sql } = listSql(query);
      return (await db.query(pool, sql, b.binds)).map(mapEmployee);
    },
    findById,
    async insert(input, userId) {
      return db.transaction(pool, async (tx) => {
        const [next] = await tx.query(`SELECT NVL(MAX(EMP_ID), 0) + 1 AS ID FROM ${table}`);
        const id = num(next?.ID) ?? 1;
        // CI3: the next employee number of the contractor, or the contractor number for the first one.
        const [numberRow] = await tx.query(
          `SELECT TO_CHAR(NVL(MAX(EMPLOYEE_NUMBER) + 1, :conNumber)) AS NUM FROM ${table} WHERE CON_NUMBER = :conNumber`,
          { conNumber: input.conNumber },
        );
        const binds: Binds = {
          id,
          conNumber: input.conNumber,
          conName: nullable(input.conName),
          employeeNumber: clean(numberRow?.NUM) ?? input.conNumber,
          rate: input.rate === '' ? null : Number(input.rate),
          startDate: nullable(input.startDate),
          endDate: nullable(input.endDate),
          userId,
          today: todayIso(),
        };
        for (const [, key] of EMPLOYEE_FIELDS)
          if (key !== 'employeeNumber') binds[key] = nullable(String(input[key] ?? ''));
        await tx.execute(
          `INSERT INTO ${table} (EMP_ID, DIVISION, CON_NUMBER, CON_NAME, EMPLOYEE_NUMBER, EMPLOYEE_NAME, IQAMAH,
             DEPARTMENT, PROD_DEP, DIRECT_BOSS, DIRECT_BOSS_ID, JOB, JOB_TITLE, PLACE, REPLACEMENT, RATE,
             START_DATE, END_DATE, STATUS, AJEER, SFDA, BLACKLIST, REMARK, CREATEB_BY, CREATION_DATE)
           VALUES (:id, :division, :conNumber, :conName, :employeeNumber, :employeeName, :iqamah,
             :department, :prodDep, :directBoss, :directBossId, :job, :jobTitle, :place, :replacement, :rate,
             CASE WHEN :startDate IS NULL THEN NULL ELSE TO_DATE(:startDate, 'YYYY-MM-DD') END,
             CASE WHEN :endDate IS NULL THEN NULL ELSE TO_DATE(:endDate, 'YYYY-MM-DD') END,
             :status, :ajeer, :sfda, :blacklist, :remark, :userId, TO_DATE(:today, 'YYYY-MM-DD'))`,
          binds,
        );
        return id;
      });
    },
    async update(id, input, userId) {
      const current = await findById(id);
      if (!current) return { found: false, changed: false };
      const sets: string[] = [];
      const binds: Binds = { id };
      for (const [column, key] of EMPLOYEE_FIELDS) {
        const incoming = String(input[key] ?? '');
        // CI3 compared the stored code with the posted one; DIVISION is read as the code here.
        const existing =
          key === 'division' ? current.divisionCode : (current[key] as string | null);
        if (!same(existing, incoming)) {
          sets.push(`${column} = :${key}`);
          binds[key] = nullable(incoming.trim());
        }
      }
      if (!sameRate(current.rate, input.rate)) {
        sets.push('RATE = :rate');
        binds.rate = input.rate === '' ? null : Number(input.rate);
      }
      if (!same(current.startDate, input.startDate)) {
        sets.push(dateOrNull('START_DATE', 'startDate'));
        binds.startDate = nullable(input.startDate);
      }
      if (!same(current.endDate, input.endDate)) {
        sets.push(dateOrNull('END_DATE', 'endDate'));
        binds.endDate = nullable(input.endDate);
      }
      if (sets.length === 0) return { found: true, changed: false };
      sets.push('UPDATED_BY = :userId', `UPDATED_DATE = TO_DATE(:today, 'YYYY-MM-DD')`);
      await db.execute(pool, `UPDATE ${table} SET ${sets.join(', ')} WHERE EMP_ID = :id`, {
        ...binds,
        userId,
        today: todayIso(),
      });
      return { found: true, changed: true };
    },
    async remove(id) {
      return (
        (await db.execute(pool, `DELETE FROM ${table} WHERE EMP_ID = :id`, { id })).rowsAffected > 0
      );
    },
    async options() {
      const [departments, jobs, bosses, production] = await Promise.all([
        db.query(
          pool,
          `SELECT DISTINCT DEPARTMENT FROM ${table} WHERE DEPARTMENT IS NOT NULL UNION SELECT 'ALL' FROM DUAL ORDER BY 1`,
        ),
        db.query(
          pool,
          `SELECT DISTINCT JOB_ID, NAME FROM ${t.perJobsTl} WHERE LANGUAGE = 'US' ORDER BY 1`,
        ),
        db.query(
          pool,
          `SELECT DISTINCT PERSON_ID, FULL_NAME FROM ${t.perPeopleX}
            WHERE PERSON_ID IN (SELECT PERSON_ID FROM ${t.perAssignmentsX}
                                 WHERE ORGANIZATION_ID IN (SELECT ORGANIZATION_ID FROM ${t.hrOrganizationUnits} WHERE NAME LIKE '%Prod%')
                                   AND PAYROLL_ID IN (21, 22, 61) AND ASSIGNMENT_STATUS_TYPE_ID = 1)
           UNION SELECT 1190, 'AL ESSA, SAAD' FROM DUAL
           UNION SELECT 2519, 'ALGHAMDI, TURKY' FROM DUAL
           ORDER BY 1`,
        ),
        db.query(
          pool,
          `SELECT DISTINCT ORGANIZATION_ID, NAME FROM ${t.hrOrganizationUnits} WHERE TYPE = 'SEC' ORDER BY 1`,
        ),
      ]);
      const pair = (value: unknown, label: unknown) => ({
        value: clean(value) ?? '',
        label: clean(label) ?? '',
      });
      return {
        departments: departments.map((r) => clean(r.DEPARTMENT) ?? '').filter(Boolean),
        jobs: jobs.map((r) => pair(r.JOB_ID, r.NAME)),
        bosses: bosses.map((r) => pair(r.PERSON_ID, r.FULL_NAME)),
        productionDepartments: production.map((r) => pair(r.ORGANIZATION_ID, r.NAME)),
      };
    },
  };
}

/* ----------------------------- contractor summary ----------------------------- */

export interface SummaryQuery {
  from: string;
  to: string;
  dept: string;
  cont: string;
  div: string;
}

export interface ContractorSummaryRepository {
  options(): Promise<{ departments: string[]; contractors: string[] }>;
  summary(q: SummaryQuery): Promise<ContractorSummaryRow[]>;
  stats(q: SummaryQuery): Promise<ContractorStatsRow[]>;
  detail(q: SummaryQuery): Promise<ContractorDetailRow[]>;
}

/** Hours between the first and last punch of a day (CI3 X subquery, verbatim). */
const HOURS = `ROUND(
    NVL(TO_NUMBER(SUBSTR(MAX(TO_CHAR(T.PUNCH_TIME,'HH24:MI:SS')),1,2)) + TO_NUMBER(SUBSTR(MAX(TO_CHAR(T.PUNCH_TIME,'HH24:MI:SS')),4,2))/60, 0)
  - NVL(TO_NUMBER(SUBSTR(MIN(TO_CHAR(T.PUNCH_TIME,'HH24:MI:SS')),1,2)) + TO_NUMBER(SUBSTR(MIN(TO_CHAR(T.PUNCH_TIME,'HH24:MI:SS')),4,2))/60, 0),
  2)`;
const filterAll = (div: string) => div !== '' && div.toUpperCase() !== 'ALL';

export function oracleContractorSummaryRepository(
  db: Db,
  source: EbsSource,
): ContractorSummaryRepository {
  const t = source.tables;
  const pool = source.pool;
  const depName = `(SELECT DISTINCT NAME FROM ${t.hrOrganizationUnits}
      WHERE ORGANIZATION_ID = CASE WHEN REGEXP_LIKE(CE.PROD_DEP, '^[0-9]+$') THEN TO_NUMBER(CE.PROD_DEP) ELSE NULL END)`;
  const dailyHours = `(SELECT TO_NUMBER(TRIM(REGEXP_SUBSTR(T.EMP_CODE, '^[0-9]+'))) AS EMP_CODE,
         TO_DATE(TO_CHAR(T.PUNCH_TIME, 'DD-MON-RR')) AS T_DATE, ${HOURS} AS HRS
    FROM ${t.iclockTransaction} T
   WHERE REGEXP_LIKE(TRIM(T.EMP_CODE), '^[0-9]+$')
   GROUP BY TO_NUMBER(TRIM(REGEXP_SUBSTR(T.EMP_CODE, '^[0-9]+'))), TO_DATE(TO_CHAR(T.PUNCH_TIME, 'DD-MON-RR')))`;
  const range = `X.T_DATE BETWEEN TO_DATE(:fromDate, 'YYYY-MM-DD') AND TO_DATE(:toDate, 'YYYY-MM-DD')`;
  const active = `UPPER(TRIM(CO.STATUS)) = 'ACTIVE' AND UPPER(TRIM(CE.STATUS)) = 'ACTIVE'`;
  const groupBy = `CE.DIVISION, CO.CON_NUMBER, CO.CON_NAME, CE.EMPLOYEE_NUMBER, CE.EMPLOYEE_NAME, CE.RATE, CE.PROD_DEP, CE.JOB, CE.IQAMAH`;

  return {
    async options() {
      const [departments, contractors] = await Promise.all([
        db.query(pool, `SELECT DISTINCT DEPARTMENT FROM ${t.conEmployeeInfo} ORDER BY 1`),
        db.query(pool, `SELECT DISTINCT CON_NAME FROM ${t.contractorInfo} ORDER BY 1`),
      ]);
      return {
        departments: departments
          .map((r) => clean(r.DEPARTMENT))
          .filter((v): v is string => Boolean(v)),
        contractors: contractors
          .map((r) => clean(r.CON_NAME))
          .filter((v): v is string => Boolean(v)),
      };
    },

    async summary(q) {
      const binds: Binds = { fromDate: q.from, toDate: q.to };
      const where: string[] = [];
      // Fixed: CI3 compared the decoded label ("IPP BU") with the selected code ("IBM"), so choosing a
      // division always returned nothing. The code is compared here.
      if (filterAll(q.div)) {
        where.push('DIV_CODE = :div');
        binds.div = q.div;
      }
      if (q.dept) {
        where.push('DEP = :dept');
        binds.dept = q.dept;
      }
      if (q.cont) {
        where.push('CON_NAME = :cont');
        binds.cont = q.cont;
      }
      const rows = await db.query(
        pool,
        `SELECT DIVISION, CON_NO, CON_NAME, DEP, JOB_NM, EMPLOYEE_NUMBER, EMPLOYEE_NAME, IQAMAH, RATE, TOT_HRS, TOT_COST
           FROM (
             SELECT DECODE(CE.DIVISION, 'IBM', 'IPP BU', 'Z3P', 'FPP BU') AS DIVISION, CE.DIVISION AS DIV_CODE,
                    CO.CON_NUMBER AS CON_NO, CO.CON_NAME AS CON_NAME, ${depName} AS DEP,
                    (SELECT DISTINCT NAME FROM ${t.perJobsTl} WHERE JOB_ID = CE.JOB) AS JOB_NM,
                    TO_CHAR(CE.EMPLOYEE_NUMBER) AS EMPLOYEE_NUMBER, CE.EMPLOYEE_NAME, TO_CHAR(CE.IQAMAH) AS IQAMAH,
                    TO_CHAR(CE.RATE) AS RATE, TO_CHAR(NVL(SUM(X.HRS), 0)) AS TOT_HRS,
                    TO_CHAR(CE.RATE * NVL(SUM(X.HRS), 0)) AS TOT_COST
               FROM ${t.conEmployeeInfo} CE
               JOIN ${t.contractorInfo} CO ON CE.CON_NUMBER = CO.CON_NUMBER
               LEFT JOIN ${dailyHours} X ON CE.EMPLOYEE_NUMBER = X.EMP_CODE AND ${range}
              WHERE ${active}
              GROUP BY ${groupBy})
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY CON_NO, EMPLOYEE_NUMBER`,
        binds,
      );
      return rows.map((r) => ({
        division: clean(r.DIVISION),
        conNo: clean(r.CON_NO),
        conName: clean(r.CON_NAME),
        dep: clean(r.DEP),
        jobNm: clean(r.JOB_NM),
        employeeNumber: clean(r.EMPLOYEE_NUMBER),
        employeeName: clean(r.EMPLOYEE_NAME),
        iqamah: clean(r.IQAMAH),
        rate: clean(r.RATE),
        totHrs: clean(r.TOT_HRS),
        totCost: clean(r.TOT_COST),
      }));
    },

    async stats(q) {
      const binds: Binds = { fromDate: q.from, toDate: q.to };
      const divFilter = filterAll(q.div) ? ' AND CE.DIVISION = :div' : '';
      if (divFilter) binds.div = q.div;
      const outer: string[] = [];
      if (q.dept) {
        outer.push('DEP = :dept');
        binds.dept = q.dept;
      }
      if (q.cont) {
        outer.push('CON_NAME = :cont');
        binds.cont = q.cont;
      }
      const inner = `SELECT CE.DIVISION AS DIVISION, CO.CON_NUMBER AS CON_NO, CO.CON_NAME AS CON_NAME, ${depName} AS DEP,
              CE.EMPLOYEE_NUMBER AS EMP_CODE, CE.EMPLOYEE_NAME, CE.RATE, NVL(SUM(X.HRS), 0) AS TOT_HRS,
              (CE.RATE * NVL(SUM(X.HRS), 0)) AS TOTAL_COST
         FROM ${t.conEmployeeInfo} CE
         JOIN ${t.contractorInfo} CO ON CE.CON_NUMBER = CO.CON_NUMBER
         LEFT JOIN ${dailyHours} X ON CE.EMPLOYEE_NUMBER = X.EMP_CODE AND ${range}
        WHERE ${active}${divFilter}
        GROUP BY ${groupBy}`;
      const filtered = outer.length
        ? `SELECT * FROM (${inner}) WHERE ${outer.join(' AND ')}`
        : inner;
      const rows = await db.query(
        pool,
        `SELECT CON_NO, CON_NAME, TO_CHAR(COUNT(DISTINCT EMP_CODE)) AS TOTAL_EMP, TO_CHAR(SUM(TOTAL_COST)) AS TOTAL_COST
           FROM (${filtered})
          GROUP BY CON_NO, CON_NAME ORDER BY CON_NO`,
        binds,
      );
      return rows.map((r) => ({
        conNo: clean(r.CON_NO),
        conName: clean(r.CON_NAME),
        totalEmp: clean(r.TOTAL_EMP),
        totalCost: clean(r.TOTAL_COST),
      }));
    },

    async detail(q) {
      const binds: Binds = { fromDate: q.from, toDate: q.to };
      const inner: string[] = [];
      if (filterAll(q.div)) {
        inner.push('CE.DIVISION = :div');
        binds.div = q.div;
      }
      if (q.cont) {
        inner.push('CO.CON_NAME = :cont');
        binds.cont = q.cont;
      }
      // Fixed: CI3 filtered on the DEP alias inside the same query (ORA-00904 whenever a department
      // was chosen); the filter is applied on the outer query.
      const outer = q.dept ? ' WHERE DEP = :dept' : '';
      if (q.dept) binds.dept = q.dept;
      const rows = await db.query(
        pool,
        `SELECT * FROM (
           SELECT TO_CHAR(TRUNC(X.T_DATE), 'DD-MON-RR') AS T_DATE,
                  DECODE(CE.DIVISION, 'IBM', 'IPP BU', 'Z3P', 'FPP BU') AS DIVISION,
                  CO.CON_NUMBER AS CON_NO, CO.CON_NAME AS CON_NAME, TO_CHAR(CE.PROD_DEP) AS DEP_ID, ${depName} AS DEP,
                  TO_CHAR(CE.EMPLOYEE_NUMBER) AS EMP_NO, CE.EMPLOYEE_NAME, X.INN_P_IN, X.OUTT_P_OUT,
                  TO_CHAR(CASE WHEN X.HRS < 0 THEN 0 WHEN X.HRS > 11.5 THEN 11.5 ELSE X.HRS END) AS ACT_HRS
             FROM (SELECT TO_NUMBER(TRIM(REGEXP_SUBSTR(T.EMP_CODE, '^[0-9]+'))) AS EMP_CODE,
                          TRUNC(TO_DATE(TO_CHAR(T.PUNCH_TIME, 'DD-MON-RR'), 'DD-MON-RR')) AS T_DATE,
                          MIN(TO_CHAR(T.PUNCH_TIME, 'HH24:MI:SS')) AS INN_P_IN,
                          MAX(TO_CHAR(T.PUNCH_TIME, 'HH24:MI:SS')) AS OUTT_P_OUT, ${HOURS} AS HRS
                     FROM ${t.iclockTransaction} T
                    WHERE REGEXP_LIKE(TRIM(T.EMP_CODE), '^[0-9]+$')
                    GROUP BY TO_NUMBER(TRIM(REGEXP_SUBSTR(T.EMP_CODE, '^[0-9]+'))), TO_CHAR(T.PUNCH_TIME, 'DD-MON-RR')) X
             JOIN ${t.conEmployeeInfo} CE ON CE.EMPLOYEE_NUMBER = X.EMP_CODE
             JOIN ${t.contractorInfo} CO ON CE.CON_NUMBER = CO.CON_NUMBER
            WHERE ${active}
              AND TRUNC(X.T_DATE) BETWEEN TRUNC(TO_DATE(:fromDate, 'YYYY-MM-DD')) AND TRUNC(TO_DATE(:toDate, 'YYYY-MM-DD'))
              ${inner.length ? `AND ${inner.join(' AND ')}` : ''}
            ORDER BY CO.CON_NUMBER, CE.EMPLOYEE_NUMBER)${outer}`,
        binds,
      );
      return rows.map((r) => ({
        tDate: clean(r.T_DATE),
        division: clean(r.DIVISION),
        conNo: clean(r.CON_NO),
        conName: clean(r.CON_NAME),
        depId: clean(r.DEP_ID),
        dep: clean(r.DEP),
        empNo: clean(r.EMP_NO),
        employeeName: clean(r.EMPLOYEE_NAME),
        innPIn: clean(r.INN_P_IN),
        outtPOut: clean(r.OUTT_P_OUT),
        actHrs: clean(r.ACT_HRS),
      }));
    },
  };
}
