import oracledb from 'oracledb';

const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };

export const fields = [
  'cur_date',
  'cur_date_ar',
  'division',
  'country',
  'country_ar',
  'employee_no',
  'employee_no_ar',
  'nationality',
  'nationality_ar',
  'passport_no',
  'passport_no_ar',
  'pass_issue_date',
  'pass_issue_date_ar',
  'national_id',
  'national_id_ar',
  'nati_issue_date',
  'nati_issue_date_ar',
  'position',
  'position_ar',
  'position_start_date',
  'position_start_date_ar',
  'contract_expired',
  'contract_expired_ar',
  'contract',
  'contract_ar',
  'salary',
  'salary_ar',
  'salary_word',
  'salary_word_ar',
  'employee_name',
  'employee_name_ar',
  'employee_nationality',
  'employee_nationality_ar',
  'manager_passport',
  'manager_passport_ar',
  'tourism_to',
  'tourism_to_ar',
  'tourism_from',
  'tourism_from_ar',
  'approval_name',
  'position_name',
];

const dates = new Set([
  'cur_date',
  'pass_issue_date',
  'pass_issue_date_ar',
  'nati_issue_date',
  'nati_issue_date_ar',
  'position_start_date',
  'position_start_date_ar',
  'contract_expired',
  'contract_expired_ar',
]);

const columns = [
  'ID',
  'UUID',
  'REF_NO',
  ...fields.map((f) => f.toUpperCase()),
  'CREATED_BY',
  'CREATED_AT',
  'UPDATED_BY',
  'UPDATED_AT',
];

const dateSelect = new Set([...dates, 'created_at', 'updated_at']);

const projection = columns
  .map((column) =>
    dateSelect.has(column.toLowerCase())
      ? `TO_CHAR(${column}, '${
          ['CREATED_AT', 'UPDATED_AT'].includes(column) ? 'YYYY-MM-DD HH24:MI' : 'YYYY-MM-DD'
        }') AS ${column}`
      : column,
  )
  .join(', ');

const row = (record) =>
  record &&
  Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => key !== 'RN')
      .map(([key, value]) => [key.toLowerCase(), value]),
  );

const rows = (result) => result.rows.map(row);

export function createTouristVisaRepository() {
  const exec = (connection, sql, binds = {}) => connection.execute(sql, binds, opts);

  const get = async (connection, uuid, types) => {
    const cols = types
      ? columns
          .map((name) => {
            const type = types.get(name);
            const format = ['CREATED_AT', 'UPDATED_AT'].includes(name)
              ? 'YYYY-MM-DD HH24:MI'
              : 'YYYY-MM-DD';

            if (!dateSelect.has(name.toLowerCase())) {
              return name;
            }

            return type === 'VARCHAR2' || type === 'CHAR'
              ? `${name} AS ${name}`
              : `TO_CHAR(${name}, '${format}') AS ${name}`;
          })
          .join(', ')
      : projection;

    const result = row(
      (
        await exec(
          connection,
          `SELECT ${cols}
         FROM XX_DIGI_TOURIST_VISA
         WHERE UUID = :uuid`,
          { uuid },
        )
      ).rows[0],
    );

    if (result && types) {
      for (const field of dates) {
        if (types.get(field.toUpperCase()) === 'VARCHAR2' && result[field]) {
          const value = String(result[field]);

          const match = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);

          if (match) {
            const month =
              [
                'JAN',
                'FEB',
                'MAR',
                'APR',
                'MAY',
                'JUN',
                'JUL',
                'AUG',
                'SEP',
                'OCT',
                'NOV',
                'DEC',
              ].indexOf(match[2].toUpperCase()) + 1;

            if (month) {
              const yy = Number(match[3]);

              const year = match[3].length === 2 ? (yy <= 49 ? 2000 + yy : 1900 + yy) : yy;

              result[field] =
                `${year}-${String(month).padStart(2, '0')}` + `-${match[1].padStart(2, '0')}`;
            }
          }
        }
      }
    }

    return result;
  };

  const metadata = async (connection) =>
    rows(
      await exec(
        connection,
        `SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
       FROM USER_TAB_COLUMNS
       WHERE TABLE_NAME = 'XX_DIGI_TOURIST_VISA'`,
      ),
    );

  const selectDate = (field, types) => {
    const type = types.get(field.toUpperCase());

    return type === 'DATE' || type?.startsWith('TIMESTAMP')
      ? `TO_DATE(:${field}, 'YYYY-MM-DD')`
      : `:${field}`;
  };

  const sqlValue = (field, types) =>
    dates.has(field)
      ? `CASE WHEN :${field} IS NULL
           THEN NULL
           ELSE ${selectDate(field, types)}
         END`
      : `:${field}`;

  return {
    metadata,
    get,

    async insert(connection, data, types) {
      const cols = [
        'UUID',
        'REF_NO',
        ...fields.map((f) => f.toUpperCase()),
        'CREATED_BY',
        'CREATED_AT',
      ];

      const values = [
        ':uuid',
        ':ref_no',
        ...fields.map((f) => sqlValue(f, types)),
        ':created_by',
        'SYSDATE',
      ];

      const binds = Object.fromEntries(
        ['uuid', 'ref_no', ...fields, 'created_by'].map((key) => [key, data[key] ?? null]),
      );

      await exec(
        connection,
        `INSERT INTO XX_DIGI_TOURIST_VISA
         (${cols.join(',')})
         VALUES (${values.join(',')})`,
        binds,
      );
    },

    async update(connection, uuid, data, types) {
      const editable = fields.filter((field) => field !== 'employee_no');

      const assignments = editable.map(
        (field) => `${field.toUpperCase()} = ${sqlValue(field, types)}`,
      );

      const binds = Object.fromEntries(
        [...editable, 'updated_by', 'uuid'].map((key) => [
          key,
          key === 'uuid' ? uuid : (data[key] ?? null),
        ]),
      );

      const result = await exec(
        connection,
        `UPDATE XX_DIGI_TOURIST_VISA
         SET ${assignments.join(',')},
             UPDATED_BY = :updated_by,
             UPDATED_AT = SYSDATE
         WHERE UUID = :uuid`,
        binds,
      );

      return result.rowsAffected;
    },

    async remove(connection, uuid) {
      const result = await exec(
        connection,
        `DELETE FROM XX_DIGI_TOURIST_VISA
         WHERE UUID = :uuid`,
        { uuid },
      );

      return result.rowsAffected;
    },

    async countries(connection) {
      return rows(
        await exec(
          connection,
          `SELECT DISTINCT COUNTRY
         FROM XX_DIGI_COUNTRY_NATIONALITY_AR
         ORDER BY COUNTRY`,
        ),
      );
    },

    async country(connection, country) {
      const result = await exec(
        connection,
        `SELECT COUNTRY, COUNTRY_AR
         FROM XX_DIGI_COUNTRY_NATIONALITY_AR
         WHERE UPPER(COUNTRY) = UPPER(:country)
         FETCH FIRST 1 ROW ONLY`,
        { country },
      );

      return row(result.rows[0]);
    },

    async employees(connection, q) {
      return rows(
        await exec(
          connection,
          `SELECT DISTINCT
            M.EMPLOYEE_NUMBER EMPLOYEE_NO,
            M.FULL_NAME EMPLOYEE_NAME
         FROM XX_DIGI_EMP_DETAILS D
         JOIN XX_DIGI_EMP_MASTER M
           ON M.EMPLOYEE_NUMBER = D.EMPLOYEE_NUMBER
         WHERE UPPER(M.FULL_NAME) LIKE :q
            OR UPPER(TO_CHAR(M.EMPLOYEE_NUMBER)) LIKE :q
         ORDER BY EMPLOYEE_NO
         FETCH FIRST 100 ROWS ONLY`,
          { q: `%${q.toUpperCase()}%` },
        ),
      );
    },

    async employee(connection, employee_no) {
      return rows(
        await exec(
          connection,
          `SELECT
            M.EMPLOYEE_NUMBER EMPLOYEE_NO,
            M.FULL_NAME EMPLOYEE_NAME,
            M.FULL_NAME_AR EMPLOYEE_NAME_AR,
            M.NATIONALITY,
            M.PASSPORT_NUMBER PASSPORT_NO,
            D.NATIONAL_IDENTIFIER NATIONAL_ID,
            M.POSITION_NAME POSITION,
            P.POSITION_NAME_AR POSITION_AR,
            N.NATIONALITY_AR,
            N.COUNTRY,
            N.COUNTRY_AR,
            M.TOTAL_SALARY SALARY,
            CASE M.MARITAL_STATUS
              WHEN 'S' THEN 'Single'
              WHEN 'M' THEN 'Married'
              ELSE M.MARITAL_STATUS
            END CONTRACT
         FROM XX_DIGI_EMP_MASTER M
         JOIN XX_DIGI_EMP_DETAILS D
           ON M.EMPLOYEE_NUMBER = D.EMPLOYEE_NUMBER
         LEFT JOIN XX_DIGI_POSITION_NAME_AR P
           ON P.POSITION_NAME = M.POSITION_NAME
         LEFT JOIN XX_DIGI_COUNTRY_NATIONALITY_AR N
           ON (
             N.COUNTRY = M.NATIONALITY
             OR N.NATIONALITY = M.NATIONALITY
           )
         WHERE M.EMPLOYEE_NUMBER = :employee_no`,
          { employee_no },
        ),
      );
    },

    async approvers(connection) {
      return rows(
        await exec(
          connection,
          `SELECT DISTINCT
            FULL_NAME APPROVAL_NAME,
            POSITION_NAME
         FROM XX_DIGI_EMP_MASTER
         WHERE UPPER(POSITION_NAME) LIKE '%HR%'
            OR UPPER(POSITION_NAME) LIKE '%GENERAL MANAGER%'
         ORDER BY APPROVAL_NAME`,
        ),
      );
    },

    async list(connection, filter, types) {
      let where = ' WHERE 1=1';
      const binds = {};

      const like = (column, key) => {
        if (filter[key]) {
          where += ` AND UPPER(${column}) LIKE :${key}`;
          binds[key] = `%${filter[key].toUpperCase()}%`;
        }
      };

      if (filter.search) {
        where += `
          AND (
            UPPER(REF_NO) LIKE :search
            OR UPPER(EMPLOYEE_NO) LIKE :search
            OR UPPER(EMPLOYEE_NAME) LIKE :search
            OR UPPER(COUNTRY) LIKE :search
          )`;

        binds.search = `%${filter.search.toUpperCase()}%`;
      }

      like('REF_NO', 'ref_no');
      like('EMPLOYEE_NO', 'employee_no');
      like('APPROVAL_NAME', 'approval_name');

      for (const key of ['division', 'country']) {
        if (filter[key]) {
          where += ` AND UPPER(${key}) = UPPER(:${key})`;
          binds[key] = filter[key];
        }
      }

      const dateExpr =
        types.get('CUR_DATE') === 'VARCHAR2'
          ? `CASE
             WHEN REGEXP_LIKE(
               CUR_DATE,
               '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
             )
             THEN TO_DATE(CUR_DATE, 'YYYY-MM-DD')
             ELSE TO_DATE(
               CUR_DATE,
               'DD-MON-RR',
               'NLS_DATE_LANGUAGE=ENGLISH'
             )
           END`
          : 'CUR_DATE';

      for (const [key, operator] of [
        ['date_from', '>='],
        ['date_to', '<='],
      ]) {
        if (filter[key]) {
          where += `
            AND ${dateExpr}
            ${operator} TO_DATE(:${key}, 'YYYY-MM-DD')`;

          binds[key] = filter[key];
        }
      }

      const countResult = await exec(
        connection,
        'SELECT COUNT(*) TOTAL FROM XX_DIGI_TOURIST_VISA' + where,
        binds,
      );

      const total = Number(countResult.rows[0].TOTAL);

      const allowed = {
        id: 'ID',
        ref_no: 'REF_NO',
        employee_no: 'EMPLOYEE_NO',
        employee_name: 'EMPLOYEE_NAME',
        country: 'COUNTRY',
        division: 'DIVISION',
        cur_date: 'CUR_DATE',
        created_at: 'CREATED_AT',
      };

      const order =
        `${allowed[filter.sort || 'id']} ` + `${filter.order === 'asc' ? 'ASC' : 'DESC'}, ID DESC`;

      const listColumns = [
        'ID',
        'UUID',
        'REF_NO',
        'EMPLOYEE_NO',
        'EMPLOYEE_NAME',
        'NATIONALITY',
        'NATIONAL_ID',
        'DIVISION',
        'COUNTRY',
        'SALARY',
        `TO_CHAR(${dateExpr}, 'YYYY-MM-DD') CUR_DATE`,
        `TO_CHAR(${dateExpr}, 'DD-Mon-YYYY') CUR_DATE_DISPLAY`,
        'APPROVAL_NAME',
        'POSITION_NAME',
        `TO_CHAR(CREATED_AT, 'YYYY-MM-DD HH24:MI') CREATED_AT`,
      ].join(',');

      const paging = filter.limit === 0 ? '' : ' OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY';

      const queryBinds =
        filter.limit === 0
          ? binds
          : {
              ...binds,
              offset: (filter.page - 1) * filter.limit,
              limit: filter.limit,
            };

      const result = await exec(
        connection,
        `SELECT ${listColumns}
         FROM XX_DIGI_TOURIST_VISA
         ${where}
         ORDER BY ${order}
         ${paging}`,
        queryBinds,
      );

      return {
        rows: rows(result),
        pagination: {
          total_records: total,
          total_pages: filter.limit ? Math.ceil(total / filter.limit) : 1,
          current_page: filter.page,
          limit: filter.limit,
        },
      };
    },
  };
}

export const repository = createTouristVisaRepository();
