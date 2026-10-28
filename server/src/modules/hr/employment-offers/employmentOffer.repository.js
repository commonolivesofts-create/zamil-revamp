import oracledb from 'oracledb';

/*
 * Employment Offer Form SQL (README_employment_offer_form.md §3–§8). Values are always bound;
 * sort columns and filter fragments come only from the fixed allowlists. IDs (NUMBER) are read
 * and bound as strings via fetchInfo. Business dates are bound as legacy 'DD-Mon-YYYY' strings
 * and matched with TO_DATE (§3.1); reads format them back to ISO 'YYYY-MM-DD' and filter dates
 * are ISO too. The PK columns are never written: the header is inserted without PK columns and
 * HEADER_ID is read back by the Node-generated UUID (§1.3, §3.1). Every statement runs on the
 * connection the service passes in — repositories never commit or roll back.
 */
const ID = { type: oracledb.STRING };

const rows = async (connection, sql, binds, fetchInfo) =>
  (
    await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchInfo,
    })
  ).rows;

const ID_FETCH = { HEADER_ID: ID, OFFER_LINE_ID: ID, CREATED_BY: ID, LAST_UPDATED_BY: ID };

// --- Insert (README §3) --------------------------------------------------------------------------

/** Header insert without PK columns (DB trigger/identity produces HEADER_ID; §3.1). */
export async function insertHeader(connection, h) {
  await connection.execute(
    `INSERT INTO XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T
       (UUID, OFFER_DATE, EMPLOYEE_NAME, POSITION, STATUS, EMPLOYEE_NAME_AR,
        CREATED_BY, CREATION_DATE, ATTRIBUTE1, ATTRIBUTE2, ATTRIBUTE3, ATTRIBUTE4,
        ATTRIBUTE10, ATTRIBUTE11)
     VALUES
       (:uuid, TO_DATE(:offerDate, 'DD-Mon-YYYY'), :employeeName, :position, 'Incomplete',
        :employeeNameAr, :createdBy, SYSDATE, :division, NVL(:applicant, '-'),
        :to, :toArabic, :intNo, NVL(:reqNo, 0))`,
    h,
  );
}

/** Read back the trigger-generated HEADER_ID by UUID, inside the caller's transaction. */
export async function findHeaderIdByUuid(connection, uuid) {
  const [row] = await rows(
    connection,
    `SELECT HEADER_ID FROM XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T WHERE UUID = :uuid`,
    { uuid },
    { HEADER_ID: ID },
  );
  return row ? row.HEADER_ID : null;
}

/** Exactly one line row, no PK column (DB trigger/identity produces OFFER_LINE_ID). */
export async function insertLine(connection, l) {
  await connection.execute(
    `INSERT INTO XXZP.XXZP_EMPLOYMENT_OFFER_LINES_T
       (HEADER_ID, BASIC_SALARY, BASIC_SALARY_AR,
        HOUSING_ALLOWANCE, HOUSING_ALLOWANCE_AR,
        TRANSPORTATION, TRANSPORTATION_AR,
        ANNUAL_VACATION, ANNUAL_VACATION_AR,
        TICKET, TICKET_AR, MEDICAL, MEDICAL_AR,
        CONTRACT_PERIOD, CONTRACT_PERIOD_AR,
        APPROXIMATE_STARTING_DATE, APPROXIMATE_STARTING_DATE_AR,
        PROBATIONARY_PERIOD, PROBATIONARY_PERIOD_AR,
        CREATED_BY, CREATION_DATE, ATTRIBUTE1, ATTRIBUTE2)
     VALUES
       (:headerId, NVL(:basicSalary, 0), :basicSalaryAr,
        :housingAllowance, :housingAllowanceAr,
        :transportation, :transportationAr,
        :annualVacation, :annualVacationAr,
        :ticket, :ticketAr, :medical, :medicalAr,
        :contractPeriod, :contractPeriodAr,
        TO_DATE(:approxStartingDate, 'DD-Mon-YYYY'), :approxStartingDateAr,
        NVL(:probationaryPeriod, '3 months with the possibility to be extend to 6 Months.'),
        NVL(:probationaryPeriodAr, 'ثلاثة أشهر مع قابلية تمديدها إلى ستة أشهر.'),
        :createdBy, SYSDATE, :comment, :basicSalaryAr)`,
    l,
  );
}

// --- Read (README §4) ----------------------------------------------------------------------------

const mapHeader = (row) => ({
  headerId: row.HEADER_ID,
  uuid: row.UUID,
  offerDate: row.OFFER_DATE,
  employeeName: row.EMPLOYEE_NAME,
  employeeNameAr: row.EMPLOYEE_NAME_AR,
  position: row.POSITION,
  status: row.STATUS,
  division: row.ATTRIBUTE1,
  applicant: row.ATTRIBUTE2,
  to: row.ATTRIBUTE3,
  toArabic: row.ATTRIBUTE4,
  intNo: row.ATTRIBUTE10,
  reqNo: row.ATTRIBUTE11,
  createdBy: row.CREATED_BY,
  createdAt: row.CREATION_DATE,
  updatedBy: row.LAST_UPDATED_BY,
  updatedAt: row.LAST_UPDATE_DATE,
});

/** Full header row (README §4.1); OFFER_DATE formatted to ISO 'YYYY-MM-DD' for the API. */
export async function findHeader(connection, headerId) {
  const [row] = await rows(
    connection,
    `SELECT HEADER_ID, UUID, TO_CHAR(OFFER_DATE, 'YYYY-MM-DD') AS OFFER_DATE,
            EMPLOYEE_NAME, EMPLOYEE_NAME_AR, POSITION, STATUS,
            ATTRIBUTE1, ATTRIBUTE2, ATTRIBUTE3, ATTRIBUTE4, ATTRIBUTE10, ATTRIBUTE11,
            CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
       FROM XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T
      WHERE HEADER_ID = :headerId`,
    { headerId },
    ID_FETCH,
  );
  return row ? mapHeader(row) : null;
}

/** HEADER_ID only — the existence check of README §5/§6 (404 before any write or delete). */
export async function findHeaderId(connection, headerId) {
  const [row] = await rows(
    connection,
    `SELECT HEADER_ID FROM XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T WHERE HEADER_ID = :headerId`,
    { headerId },
    { HEADER_ID: ID },
  );
  return row ? row.HEADER_ID : null;
}

const mapLine = (row) => ({
  offerLineId: row.OFFER_LINE_ID,
  headerId: row.HEADER_ID,
  basicSalary: row.BASIC_SALARY,
  basicSalaryAr: row.BASIC_SALARY_AR,
  housingAllowance: row.HOUSING_ALLOWANCE,
  housingAllowanceAr: row.HOUSING_ALLOWANCE_AR,
  transportation: row.TRANSPORTATION,
  transportationAr: row.TRANSPORTATION_AR,
  annualVacation: row.ANNUAL_VACATION,
  annualVacationAr: row.ANNUAL_VACATION_AR,
  ticket: row.TICKET,
  ticketAr: row.TICKET_AR,
  medical: row.MEDICAL,
  medicalAr: row.MEDICAL_AR,
  contractPeriod: row.CONTRACT_PERIOD,
  contractPeriodAr: row.CONTRACT_PERIOD_AR,
  approximateStartingDate: row.APPROXIMATE_STARTING_DATE,
  approximateStartingDateAr: row.APPROXIMATE_STARTING_DATE_AR,
  probationaryPeriod: row.PROBATIONARY_PERIOD,
  probationaryPeriodAr: row.PROBATIONARY_PERIOD_AR,
  comment: row.ATTRIBUTE1,
});

/** Single line row (README §4.2), or null when the header was saved without a line.
 *  Line ATTRIBUTE2 (salary-arabic duplicate) is intentionally never read. */
export async function findLine(connection, headerId) {
  const [row] = await rows(
    connection,
    `SELECT OFFER_LINE_ID, HEADER_ID, BASIC_SALARY, BASIC_SALARY_AR,
            HOUSING_ALLOWANCE, HOUSING_ALLOWANCE_AR, TRANSPORTATION, TRANSPORTATION_AR,
            ANNUAL_VACATION, ANNUAL_VACATION_AR, TICKET, TICKET_AR, MEDICAL, MEDICAL_AR,
            CONTRACT_PERIOD, CONTRACT_PERIOD_AR,
            TO_CHAR(APPROXIMATE_STARTING_DATE, 'YYYY-MM-DD') AS APPROXIMATE_STARTING_DATE,
            APPROXIMATE_STARTING_DATE_AR, PROBATIONARY_PERIOD, PROBATIONARY_PERIOD_AR,
            ATTRIBUTE1
       FROM XXZP.XXZP_EMPLOYMENT_OFFER_LINES_T
      WHERE HEADER_ID = :headerId`,
    { headerId },
    ID_FETCH,
  );
  return row ? mapLine(row) : null;
}

// --- Update (README §5) --------------------------------------------------------------------------

/** Header update (§5.1). STATUS, CREATED_BY and CREATION_DATE are never touched. */
export async function updateHeader(connection, h) {
  const result = await connection.execute(
    `UPDATE XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T
        SET OFFER_DATE = TO_DATE(:offerDate, 'DD-Mon-YYYY'),
            EMPLOYEE_NAME = :employeeName,
            EMPLOYEE_NAME_AR = :employeeNameAr,
            POSITION = :position,
            ATTRIBUTE1 = :division,
            ATTRIBUTE2 = :applicant,
            ATTRIBUTE3 = :to,
            ATTRIBUTE4 = :toArabic,
            ATTRIBUTE10 = :intNo,
            ATTRIBUTE11 = :reqNo,
            LAST_UPDATED_BY = :updatedBy,
            LAST_UPDATE_LOGIN = :updatedBy,
            LAST_UPDATE_DATE = SYSDATE
      WHERE HEADER_ID = :headerId`,
    h,
  );
  return result.rowsAffected === 1;
}

/**
 * Line upsert (§5.2 MERGE, used because a header may exist without a line). The MATCHED branch
 * never writes PROBATIONARY_PERIOD(_AR) or line ATTRIBUTE2 — those are insert-only legacy
 * columns (§5 rules). The NOT MATCHED branch is the §3.3 line insert (CREATED_BY = :createdBy).
 */
export async function mergeLine(connection, l) {
  await connection.execute(
    `MERGE INTO XXZP.XXZP_EMPLOYMENT_OFFER_LINES_T d
      USING (SELECT :headerId AS HEADER_ID FROM DUAL) s
      ON (d.HEADER_ID = s.HEADER_ID)
      WHEN MATCHED THEN UPDATE SET
        BASIC_SALARY = NVL(:basicSalary, 0),
        BASIC_SALARY_AR = :basicSalaryAr,
        HOUSING_ALLOWANCE = :housingAllowance,
        HOUSING_ALLOWANCE_AR = :housingAllowanceAr,
        TRANSPORTATION = :transportation,
        TRANSPORTATION_AR = :transportationAr,
        ANNUAL_VACATION = :annualVacation,
        ANNUAL_VACATION_AR = :annualVacationAr,
        TICKET = :ticket,
        TICKET_AR = :ticketAr,
        MEDICAL = :medical,
        MEDICAL_AR = :medicalAr,
        CONTRACT_PERIOD = :contractPeriod,
        CONTRACT_PERIOD_AR = :contractPeriodAr,
        APPROXIMATE_STARTING_DATE = TO_DATE(:approxStartingDate, 'DD-Mon-YYYY'),
        APPROXIMATE_STARTING_DATE_AR = :approxStartingDateAr,
        ATTRIBUTE1 = :comment,
        LAST_UPDATED_BY = :updatedBy,
        LAST_UPDATE_LOGIN = :updatedBy,
        LAST_UPDATE_DATE = SYSDATE
      WHEN NOT MATCHED THEN INSERT
        (HEADER_ID, BASIC_SALARY, BASIC_SALARY_AR,
         HOUSING_ALLOWANCE, HOUSING_ALLOWANCE_AR,
         TRANSPORTATION, TRANSPORTATION_AR,
         ANNUAL_VACATION, ANNUAL_VACATION_AR,
         TICKET, TICKET_AR, MEDICAL, MEDICAL_AR,
         CONTRACT_PERIOD, CONTRACT_PERIOD_AR,
         APPROXIMATE_STARTING_DATE, APPROXIMATE_STARTING_DATE_AR,
         PROBATIONARY_PERIOD, PROBATIONARY_PERIOD_AR,
         CREATED_BY, CREATION_DATE, ATTRIBUTE1, ATTRIBUTE2)
        VALUES
        (:headerId, NVL(:basicSalary, 0), :basicSalaryAr,
         :housingAllowance, :housingAllowanceAr,
         :transportation, :transportationAr,
         :annualVacation, :annualVacationAr,
         :ticket, :ticketAr, :medical, :medicalAr,
         :contractPeriod, :contractPeriodAr,
         TO_DATE(:approxStartingDate, 'DD-Mon-YYYY'), :approxStartingDateAr,
         NVL(:probationaryPeriod, '3 months with the possibility to be extend to 6 Months.'),
         NVL(:probationaryPeriodAr, 'ثلاثة أشهر مع قابلية تمديدها إلى ستة أشهر.'),
         :createdBy, SYSDATE, :comment, :basicSalaryAr)`,
    l,
  );
}

// --- Delete (README §6) --------------------------------------------------------------------------

/** Removes both rows of one offer, line first (FK); returns the number of header rows deleted. */
export async function deleteOffer(connection, headerId) {
  await connection.execute(
    `DELETE FROM XXZP.XXZP_EMPLOYMENT_OFFER_LINES_T WHERE HEADER_ID = :headerId`,
    { headerId },
  );
  const result = await connection.execute(
    `DELETE FROM XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T WHERE HEADER_ID = :headerId`,
    { headerId },
  );
  return result.rowsAffected;
}

// --- Listing (README §7) -------------------------------------------------------------------------

const SORT_COLUMNS = Object.freeze({
  HEADER_ID: 'H.HEADER_ID',
  OFFER_DATE: 'H.OFFER_DATE',
  EMPLOYEE_NAME: 'H.EMPLOYEE_NAME',
  CREATION_DATE: 'H.CREATION_DATE',
});

// Fixed fragments; only their values come from the validated request. The search pattern is
// already upper-cased and LIKE-escaped by the service (matches the interview module's ESCAPE
// form of the README's '%'||UPPER(:search)||'%' contains-search).
const FILTERS = Object.freeze({
  search: () => `(UPPER(H.EMPLOYEE_NAME) LIKE :search ESCAPE '\\'
                 OR UPPER(H.POSITION) LIKE :search ESCAPE '\\'
                 OR UPPER(H.EMPLOYEE_NAME_AR) LIKE :search ESCAPE '\\'
                 OR UPPER(H.ATTRIBUTE10) LIKE :search ESCAPE '\\'
                 OR UPPER(H.ATTRIBUTE11) LIKE :search ESCAPE '\\')`,
  intNo: () => 'UPPER(H.ATTRIBUTE10) = UPPER(:intNo)',
  requisitionNo: () => 'UPPER(H.ATTRIBUTE11) = UPPER(:requisitionNo)',
  division: () => 'H.ATTRIBUTE1 = :division',
  status: () => 'UPPER(H.STATUS) = UPPER(:status)',
  dateFrom: () => "H.OFFER_DATE >= TO_DATE(:dateFrom, 'YYYY-MM-DD')",
  dateTo: () => "H.OFFER_DATE < TO_DATE(:dateTo, 'YYYY-MM-DD') + 1",
});

const LIST_COLUMNS = `
  H.HEADER_ID,
  TO_CHAR(H.OFFER_DATE, 'YYYY-MM-DD') AS OFFER_DATE,
  H.EMPLOYEE_NAME, H.EMPLOYEE_NAME_AR, H.POSITION, H.STATUS,
  H.ATTRIBUTE1 AS DIVISION,
  H.ATTRIBUTE2 AS APPLICANT,
  H.ATTRIBUTE10 AS INT_NO,
  H.ATTRIBUTE11 AS REQUISITION_NO,
  H.CREATED_BY, TO_CHAR(H.CREATION_DATE, 'YYYY-MM-DD') AS CREATION_DATE,
  TO_CHAR(H.LAST_UPDATE_DATE, 'YYYY-MM-DD') AS LAST_UPDATE_DATE`;

const mapListItem = (row) => ({
  headerId: row.HEADER_ID,
  offerDate: row.OFFER_DATE,
  employeeName: row.EMPLOYEE_NAME,
  employeeNameAr: row.EMPLOYEE_NAME_AR,
  position: row.POSITION,
  division: row.DIVISION,
  applicant: row.APPLICANT,
  intNo: row.INT_NO,
  requisitionNo: row.REQUISITION_NO,
  status: row.STATUS,
  createdBy: row.CREATED_BY,
  creationDate: row.CREATION_DATE,
  lastUpdateDate: row.LAST_UPDATE_DATE,
});

/**
 * Paginated, filtered listing (README §7.2). `search` is an upper-case LIKE pattern already
 * escaped by the caller; `sortBy` must be a key of SORT_COLUMNS; `createdBy` is the server-side
 * scope resolved by the service (HR: optional filter; non-HR: always the actor's own userId).
 * The HEADER_ID tie-breaker keeps OFFSET/FETCH pages stable (docs/02 §7).
 */
export async function listOffers(
  connection,
  { limit, offset, filters = {}, createdBy, sortBy, sortDir },
) {
  const binds = {};
  const conditions = ['1 = 1'];
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (!FILTERS[key]) throw new Error(`Unsupported filter ${key}`);
    conditions.push(FILTERS[key](value));
    binds[key] = value;
  }
  if (createdBy !== undefined && createdBy !== null) {
    conditions.push('H.CREATED_BY = :createdBy');
    binds.createdBy = createdBy;
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const column = SORT_COLUMNS[sortBy];
  if (!column) throw new Error(`Unsupported sort ${sortBy}`);
  const direction = sortDir === 'desc' ? 'DESC' : 'ASC';

  const [{ TOTAL: total }] = await rows(
    connection,
    `SELECT COUNT(*) AS TOTAL FROM XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T H ${where}`,
    binds,
  );
  const result = await rows(
    connection,
    `SELECT ${LIST_COLUMNS}
       FROM XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T H
       ${where}
      ORDER BY ${column} ${direction}, H.HEADER_ID
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
    { ...binds, offset, limit },
    ID_FETCH,
  );
  return { total, items: result.map(mapListItem) };
}

// --- HR membership (README §7.4) ------------------------------------------------------------------

/** Whether the user is an HR user (XXZP_HR lookup tag) — decides listing scope. */
export async function isHrUser(connection, userId) {
  const result = await rows(
    connection,
    `SELECT LOOKUP_CODE
       FROM XX_DIGI_LOOKUP_VALUES
      WHERE LOOKUP_TYPE = 'XXZP_HR' AND TAG = :userId
      FETCH FIRST 1 ROWS ONLY`,
    { userId },
  );
  return result.length > 0;
}

// --- Lookups (README §8) -------------------------------------------------------------------------

/** Approved + passed interview candidates for the form datalist (README §8.1; §8.5 of the
 *  Interview README is the contract). `excludeOffered` adds the legacy commented-out dedupe. */
export async function listCandidates(connection, { excludeOffered = false } = {}) {
  const result = await rows(
    connection,
    `SELECT IAHT.HEADER_ID, IAHT.INT_NO, IAHT.CANDIDATE_NAME, IAHT.POSITION_NAME, IAHT.ATTRIBUTE4
       FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T IAHT,
            XXZP.XXZP_INTERVIEW_EVAL_T IVT
      WHERE IAHT.HEADER_ID = IVT.HEADER_ID
        AND IAHT.STATUS = 'Approved'
        AND IVT.STATUS = 'Passed'
        ${
          excludeOffered
            ? `AND IAHT.INT_NO NOT IN (SELECT NVL(ATTRIBUTE10, 0)
                                FROM XXZP.XXZP_EMPLOYMENT_OFFER_HEADER_T)`
            : ''
        }
      ORDER BY IAHT.ATTRIBUTE4 DESC`,
    {},
    { HEADER_ID: ID },
  );
  return result.map((row) => ({
    headerId: row.HEADER_ID,
    intNo: row.INT_NO,
    candidateName: row.CANDIDATE_NAME,
    positionName: row.POSITION_NAME,
    requisitionNo: row.ATTRIBUTE4,
  }));
}

/** Mr/Mrs titles (README §8.2). */
export async function listTitles(connection) {
  const result = await rows(
    connection,
    `SELECT MEANING, DESCRIPTION
       FROM XX_DIGI_LOOKUP_VALUES
      WHERE LOOKUP_TYPE = 'XXZP_TITLE'`,
    {},
  );
  return result.map((row) => ({ meaning: row.MEANING, description: row.DESCRIPTION }));
}

// §8.3–8.8: fixed SQL per validated type (medical/ticket keep the documented UNIONs verbatim).
const ALLOWANCE_SQL = Object.freeze({
  housing: `SELECT MEANING, DESCRIPTION
              FROM XX_DIGI_LOOKUP_VALUES
             WHERE LOOKUP_TYPE = 'XXZP_HOUSING_ALLOWANCE'
             ORDER BY LOOKUP_CODE`,
  transportation: `SELECT MEANING, DESCRIPTION
                     FROM XX_DIGI_LOOKUP_VALUES
                    WHERE LOOKUP_TYPE = 'XXZP_TRANSPORTATION'
                    ORDER BY LOOKUP_CODE`,
  'contract-period': `SELECT MEANING, DESCRIPTION
                        FROM XX_DIGI_LOOKUP_VALUES
                       WHERE LOOKUP_TYPE = 'XXZP_CONTRACT_PERIOD'
                       ORDER BY LOOKUP_CODE`,
  'annual-vacation': `SELECT MEANING, DESCRIPTION
                        FROM XX_DIGI_LOOKUP_VALUES
                       WHERE LOOKUP_TYPE = 'XXZP_ANNUAL_VACATION'
                       ORDER BY LOOKUP_CODE`,
  medical: `SELECT MEANING || ' qualified dependents (as per Company policy)' AS MEANING, DESCRIPTION
              FROM XX_DIGI_LOOKUP_VALUES
             WHERE LOOKUP_TYPE = 'XXZP_MEDICAL' AND LOOKUP_CODE = 1
            UNION
            SELECT MEANING, DESCRIPTION
              FROM XX_DIGI_LOOKUP_VALUES
             WHERE LOOKUP_TYPE = 'XXZP_MEDICAL' AND LOOKUP_CODE = 2`,
  ticket: `SELECT MEANING || ' to point of origin.' AS MEANING, DESCRIPTION
             FROM XX_DIGI_LOOKUP_VALUES
            WHERE LOOKUP_TYPE = 'XXZP_TICKET' AND LOOKUP_CODE = 1
           UNION
           SELECT MEANING, DESCRIPTION
             FROM XX_DIGI_LOOKUP_VALUES
            WHERE LOOKUP_TYPE = 'XXZP_TICKET' AND LOOKUP_CODE = 2
           UNION
           SELECT MEANING, DESCRIPTION
             FROM XX_DIGI_LOOKUP_VALUES
            WHERE LOOKUP_TYPE = 'XXZP_TICKET' AND LOOKUP_CODE = 3
           UNION
           SELECT MEANING, DESCRIPTION
             FROM XX_DIGI_LOOKUP_VALUES
            WHERE LOOKUP_TYPE = 'XXZP_TICKET' AND LOOKUP_CODE = 4`,
});

/** Benefit option list for one validated allowance type (README §8.3–§8.8). */
export async function listAllowances(connection, type) {
  const sql = ALLOWANCE_SQL[type];
  if (!sql) throw new Error(`Unsupported allowance type ${type}`);
  const result = await rows(connection, sql, {});
  return result.map((row) => ({ meaning: row.MEANING, description: row.DESCRIPTION }));
}

/** Salary in Arabic words (README §8.10). */
export async function numberToArabic(connection, number) {
  const [row] = await rows(
    connection,
    `SELECT CON_NUM_TO_ARABIC(:number) AS OUTPUT_STRING FROM DUAL`,
    { number },
  );
  return row.OUTPUT_STRING;
}

/** Gregorian → Hijri date via the NLS Arabic Hijrah calendar (README §8.11). */
export async function hijriDate(connection, date) {
  const [row] = await rows(
    connection,
    `SELECT TO_CHAR(TO_DATE(:date, 'YYYY-MM-DD'), 'YYYY/MM/DD',
               'NLS_CALENDAR=''Arabic Hijrah''') AS HIJRI
       FROM DUAL`,
    { date },
  );
  return row.HIJRI;
}
