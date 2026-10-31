import oracledb from 'oracledb';

const T = 'XXZP.';

const run = (c, sql, b = {}) =>
  c.execute(sql, b, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
  });

const all = async (c, sql, b = {}) => (await run(c, sql, b)).rows;

const one = async (c, sql, b = {}) => (await all(c, sql, b))[0] ?? null;

const sectionTables = {
  employeeDept: 'XX_CLEARANCE_EMPLOYEES',
  quality: 'XX_CLEARANCE_QUALITY',
  warehouse: 'XX_CLEARANCE_WH',
  accounts: 'XX_CLEARANCE_ACCOUNTS',
  admin: 'XX_CLEARANCE_ADMIN',
};

export const columns = {
  employeeDept: [
    'FILES',
    'TOOLS',
    'INSTRUMENTS',
    'BOOK_MANUALS',
    'MANUALS',
    'OFFICE_KEYS',
    'DOCUMENTS',
    'LOCKER_KEYS',
    'SAFETY_ITEMS',
    'VEHICLE',
    'OFFICE_STATIONARY',
    'OTHERS',
  ],

  quality: ['UNIFORM', 'KNIFE', 'DOCUMENTS', 'OTHERS'],

  warehouse: ['TOOLS', 'OTHERS'],

  accounts: ['LOANS', 'OTHERS'],

  admin: [
    'IQAMA',
    'ID_CARDS',
    'BANK_LOAN',
    'DRIVING_LICENSE',
    'GURANTOR',
    'MOBILE_CHIP',
    'MEDICAL_CARDS',
    'DOOR_ATTENDANCE',
    'OTHERS',
  ],
};

const managerCols = {
  employeeDept: 'EMP_MGR_USERID',
  quality: 'QLTY_MGR_USERID',
  warehouse: 'WH_MGR_USERID',
  accounts: 'ACC_MGR_USERID',
  admin: 'ADMIN_MGR_USERID',
};

// SQL identifiers come from server-owned constants.
export async function actor(c, userId) {
  return one(
    c,
    `
    SELECT PERSON_ID, EMPLOYEE_NUMBER, FULL_NAME
    FROM XX_DIGI_EMP_MASTER
    WHERE USER_ID = :userId
      AND CURRENT_EMP_FLAG = 'Y'
      AND TRUNC(SYSDATE)
          BETWEEN PAPF_EFFECTIVE_START_DATE
              AND PAPF_EFFECTIVE_END_DATE
      AND TRUNC(SYSDATE)
          BETWEEN PAAF_EFFECTIVE_START_DATE
              AND PAAF_EFFECTIVE_END_DATE
    ORDER BY PAAF_EFFECTIVE_START_DATE DESC
    FETCH FIRST 1 ROW ONLY
  `,
    { userId },
  );
}

export async function employee(c, empNo) {
  return one(
    c,
    `
    SELECT
      PERSON_ID,
      EMPLOYEE_NUMBER,
      FULL_NAME,
      JOB_TITLE,
      ORGANIZATION_NAME AS DEPARTMENT_NAME,
      DIVISION,
      EMAIL_ADDRESS,
      SUPERVISOR_NAME,
      USER_ID
    FROM XX_DIGI_EMP_MASTER
    WHERE EMPLOYEE_NUMBER = :empNo
      AND CURRENT_EMP_FLAG = 'Y'
      AND TRUNC(SYSDATE)
          BETWEEN PAPF_EFFECTIVE_START_DATE
              AND PAPF_EFFECTIVE_END_DATE
      AND TRUNC(SYSDATE)
          BETWEEN PAAF_EFFECTIVE_START_DATE
              AND PAAF_EFFECTIVE_END_DATE
    ORDER BY PAAF_EFFECTIVE_START_DATE DESC
    FETCH FIRST 1 ROW ONLY
  `,
    { empNo },
  );
}

export async function isInScope(c, userId, empNo, privileged) {
  if (privileged) {
    return !!(await employee(c, empNo));
  }

  const a = await actor(c, userId);
  if (!a) return false;

  return !!(await one(
    c,
    `
    SELECT 1 AS OK
    FROM XX_DIGI_EMP_MASTER E
    WHERE E.EMPLOYEE_NUMBER = :empNo
      AND E.CURRENT_EMP_FLAG = 'Y'
      AND TRUNC(SYSDATE)
          BETWEEN E.PAPF_EFFECTIVE_START_DATE
              AND E.PAPF_EFFECTIVE_END_DATE
      AND TRUNC(SYSDATE)
          BETWEEN E.PAAF_EFFECTIVE_START_DATE
              AND E.PAAF_EFFECTIVE_END_DATE
      AND (
        E.EMPLOYEE_NUMBER = :myNo
        OR E.SUPERVISOR_ID = :myPersonId
      )
    FETCH FIRST 1 ROW ONLY
  `,
    {
      empNo,
      myNo: a.EMPLOYEE_NUMBER,
      myPersonId: a.PERSON_ID,
    },
  ));
}

export async function getHeader(c, id, lock = false) {
  return one(
    c,
    `
    SELECT *
    FROM XXZP.XX_CLEARANCE_HEADER
    WHERE HEADER_ID = :headerId
    ${lock ? 'FOR UPDATE' : ''}
  `,
    { headerId: id },
  );
}

export async function getFull(c, id) {
  const header = await getHeader(c, id);
  if (!header) return null;

  const itMatrix = await all(
    c,
    `
    SELECT *
    FROM XXZP.XX_CLEARANCE_IT
    WHERE HEADER_ID = :headerId
    ORDER BY LINE_ID
  `,
    { headerId: id },
  );

  const sections = {};

  for (const [key, t] of Object.entries(sectionTables)) {
    sections[key] = await one(
      c,
      `
      SELECT *
      FROM ${T + t}
      WHERE HEADER_ID = :headerId
    `,
      { headerId: id },
    );
  }

  return { header, itMatrix, sections };
}

export async function insertHeader(c, h) {
  const b = {
    uuid: h.uuid,
    personId: h.personId,
    createdBy: h.userId,
    empNo: h.empNo,
    empName: h.empName,
    jobTitle: h.jobTitle,
    department: h.department,
    division: h.division,
    computerFlag: h.computerFlag,
    purpose: h.purpose,
    contact: h.contact,

    depMgrName: h.depMgrName,
    depMgrDate: h.depMgrDate,
    depMgrSig: h.depMgrSig,
    depMgrNo: h.depMgrNo,

    compRec: h.compRec,
    compSig: h.compSig,

    itMgr: h.itMgr,
    itMgrDate: h.itMgrDate,
    itMgrSig: h.itMgrSig,

    headerId: {
      dir: oracledb.BIND_OUT,
      type: oracledb.NUMBER,
    },
  };

  const result = await run(
    c,
    `
    INSERT INTO XXZP.XX_CLEARANCE_HEADER (
      UUID,
      PERSON_ID,
      CREATED_BY,
      EMP_NO,
      EMP_NAME,
      JOB_TITLE,
      DEPARTMENT,
      CREATION_DATE,
      ATTRIBUTE1,
      ATTRIBUTE2,
      ATTRIBUTE3,
      CONTACT,
      DEP_MGR,
      DEPMGR_DATE,
      DEPMGR_SIG,
      DEPMGR_NO,
      COM_REC,
      COM_SIG,
      IT_MGR,
      ITMGR_DATE,
      ITMGR_SIG,
      STATUS
    )
    VALUES (
      :uuid,
      :personId,
      :createdBy,
      :empNo,
      :empName,
      :jobTitle,
      :department,
      SYSDATE,
      :division,
      :computerFlag,
      :purpose,
      :contact,
      :depMgrName,
      TO_DATE(:depMgrDate, 'YYYY-MM-DD'),
      :depMgrSig,
      :depMgrNo,
      :compRec,
      :compSig,
      :itMgr,
      TO_DATE(:itMgrDate, 'YYYY-MM-DD'),
      :itMgrSig,
      'Draft'
    )
    RETURNING HEADER_ID INTO :headerId
  `,
    b,
  );

  return String(result.outBinds.headerId[0]);
}

export async function setReference(c, id, ref) {
  await run(
    c,
    `
    UPDATE XXZP.XX_CLEARANCE_HEADER
    SET REFERENCE_NO = :ref
    WHERE HEADER_ID = :id
  `,
    { id, ref },
  );
}

export async function insertWork(c, id, userId, uuid) {
  await run(
    c,
    `
    INSERT INTO XXZP_EMCLFOR_WORK (
      UUID,
      FORM_ID,
      CREATED_BY,
      CREATED_ON,
      REQ_STATUS,
      CLOSED_ON
    )
    VALUES (
      :uuid,
      :id,
      :userId,
      SYSDATE,
      'Draft',
      NULL
    )
  `,
    { uuid, id, userId },
  );
}

export async function insertIT(c, id, h, line) {
  await run(
    c,
    `
    INSERT INTO XXZP.XX_CLEARANCE_IT (
      HEADER_ID,
      PERSON_ID,
      LINE_ID,
      SUBJECT_CODE,
      SUBJECT,
      SUBJECT_ACTION,
      ACCESS_TO,
      CREATION_DATE,
      CREATED_BY
    )
    VALUES (
      :id,
      :personId,
      :lineId,
      :code,
      :subject,
      :action,
      :accessTo,
      SYSDATE,
      :userId
    )
  `,
    {
      id,
      personId: h.personId,
      lineId: line.lineId,
      code: line.lineId,
      subject: line.subject,
      action: line.action,
      accessTo: line.accessTo ?? null,
      userId: h.userId,
    },
  );
}

export async function updateIT(c, id, h, line) {
  const r = await run(
    c,
    `
    UPDATE XXZP.XX_CLEARANCE_IT
    SET
      SUBJECT_ACTION = :action,
      ACCESS_TO = :accessTo,
      PERSON_ID = :personId,
      LAST_UPDATED_DATE = SYSDATE,
      UPDATED_BY = :userId
    WHERE HEADER_ID = :id
      AND LINE_ID = :lineId
  `,
    {
      id,
      action: line.action,
      accessTo: line.accessTo ?? null,
      personId: h.personId,
      userId: h.userId,
      lineId: line.lineId,
    },
  );

  if (!r.rowsAffected) {
    await insertIT(c, id, h, line);
  }
}

export async function writeSection(c, key, id, h, s, existing) {
  const values = {
    PERSON_ID: h.personId,

    ...Object.fromEntries(columns[key].map((col) => [col, s.flags[col]])),

    COMMENTS: s.comments ?? '',
    APPROVER: s.approver ?? '',
    APP_SIG: s.signature ?? '',

    [managerCols[key]]: s.managerUserId ?? null,
  };

  if (key !== 'admin') {
    values.COST = s.cost ?? null;
  }

  if (key === 'employeeDept') {
    values.ATTRIBUTE1 = s.vacationFrom ?? null;
    values.ATTRIBUTE2 = s.vacationTo ?? null;
  }

  if (key === 'admin') {
    values.APP_DATE = s.appDate ?? null;
    values.ATTRIBUTE5 = s.visaExpiry ?? null;
  }

  const table = T + sectionTables[key];

  if (existing) {
    const b = { ...values };

    const dateFields = ['ATTRIBUTE1', 'ATTRIBUTE2', 'APP_DATE', 'ATTRIBUTE5'].filter(
      (k) => k in b && (key === 'admin' || key === 'employeeDept'),
    );

    const updates = Object.keys(b).map(
      (k) => `${k} = ${dateFields.includes(k) ? `TO_DATE(:${k}, 'YYYY-MM-DD')` : ':' + k}`,
    );

    updates.push('LAST_UPDATED_DATE = SYSDATE', 'LAST_UPDATE_BY = :writer');

    const r = await run(
      c,
      `
      UPDATE ${table}
      SET ${updates.join(', ')}
      WHERE HEADER_ID = :id
    `,
      {
        ...b,
        id,
        writer: h.userId,
      },
    );

    if (r.rowsAffected) return;
  }

  const fields = {
    HEADER_ID: id,
    LINE_ID: 1,
    ...values,
    CREATED_BY: h.userId,
  };

  const keys = Object.keys(fields);

  await run(
    c,
    `
    INSERT INTO ${table}
      (${keys.join(', ')}, CREATION_DATE)
    VALUES (
      ${keys
        .map((k) =>
          (key === 'employeeDept' && ['ATTRIBUTE1', 'ATTRIBUTE2'].includes(k)) ||
          (key === 'admin' && ['APP_DATE', 'ATTRIBUTE5'].includes(k))
            ? `TO_DATE(:${k}, 'YYYY-MM-DD')`
            : ':' + k,
        )
        .join(', ')},
      SYSDATE
    )
  `,
    fields,
  );
}

export async function updateHeader(c, id, h) {
  return run(
    c,
    `
    UPDATE XXZP.XX_CLEARANCE_HEADER
    SET
      PERSON_ID = :personId,
      EMP_NO = :empNo,
      EMP_NAME = :empName,
      JOB_TITLE = :jobTitle,
      DEPARTMENT = :department,
      ATTRIBUTE1 = :division,
      ATTRIBUTE2 = :computerFlag,
      ATTRIBUTE3 = :purpose,
      CONTACT = :contact,

      DEP_MGR = :depMgrName,
      DEPMGR_DATE = TO_DATE(:depMgrDate, 'YYYY-MM-DD'),
      DEPMGR_SIG = :depMgrSig,
      DEPMGR_NO = :depMgrNo,

      COM_REC = :compRec,
      COM_SIG = :compSig,

      IT_MGR = :itMgr,
      ITMGR_DATE = TO_DATE(:itMgrDate, 'YYYY-MM-DD'),
      ITMGR_SIG = :itMgrSig,

      LAST_UPDATED_DATE = SYSDATE,
      UPDATED_BY = :userId

    WHERE HEADER_ID = :id
      AND UPPER(STATUS) IN ('DRAFT', 'REJECTED')
  `,
    {
      id,

      ...Object.fromEntries(
        [
          'personId',
          'empNo',
          'empName',
          'jobTitle',
          'department',
          'division',
          'computerFlag',
          'purpose',
          'contact',
          'depMgrName',
          'depMgrDate',
          'depMgrSig',
          'depMgrNo',
          'compRec',
          'compSig',
          'itMgr',
          'itMgrDate',
          'itMgrSig',
          'userId',
        ].map((k) => [k, h[k]]),
      ),
    },
  );
}

export async function remove(c, id) {
  const deleted = {};

  for (const table of [
    'XX_CLEARANCE_IT',
    'XX_CLEARANCE_EMPLOYEES',
    'XX_CLEARANCE_QUALITY',
    'XX_CLEARANCE_WH',
    'XX_CLEARANCE_ACCOUNTS',
    'XX_CLEARANCE_ADMIN',
  ]) {
    deleted[table] = (
      await run(
        c,
        `
        DELETE FROM XXZP.${table}
        WHERE HEADER_ID = :id
      `,
        { id },
      )
    ).rowsAffected;
  }

  deleted.XXZP_EMCLFOR_WORK = (
    await run(
      c,
      `
      DELETE FROM XXZP_EMCLFOR_WORK
      WHERE FORM_ID = :id
    `,
      { id },
    )
  ).rowsAffected;

  deleted.XX_CLEARANCE_HEADER = (
    await run(
      c,
      `
      DELETE FROM XXZP.XX_CLEARANCE_HEADER
      WHERE HEADER_ID = :id
    `,
      { id },
    )
  ).rowsAffected;

  return deleted;
}

export async function list(c, userId, privileged, filter) {
  const a = await actor(c, userId);

  const parts = [
    `
    (
      :privileged = 1
      OR CH.EMP_NO = :myNo
      OR CH.EMP_NO IN (
        SELECT E.EMPLOYEE_NUMBER
        FROM XX_DIGI_EMP_MASTER E
        WHERE E.SUPERVISOR_ID = :myPersonId
          AND E.CURRENT_EMP_FLAG = 'Y'
          AND TRUNC(SYSDATE)
              BETWEEN E.PAPF_EFFECTIVE_START_DATE
                  AND E.PAPF_EFFECTIVE_END_DATE
          AND TRUNC(SYSDATE)
              BETWEEN E.PAAF_EFFECTIVE_START_DATE
                  AND E.PAAF_EFFECTIVE_END_DATE
      )
    )
  `,
  ];

  const b = {
    privileged: privileged ? 1 : 0,
    myNo: a?.EMPLOYEE_NUMBER ?? null,
    myPersonId: a?.PERSON_ID ?? null,
    offset: (filter.page - 1) * filter.pageSize,
    pageSize: filter.pageSize,
  };

  if (filter.status && filter.status.toUpperCase() !== 'ALL') {
    if (filter.status.toUpperCase() === 'APPROVED') {
      parts.push(`
        UPPER(CH.STATUS) IN ('APPROVED', 'ACCEPTED')
      `);
    } else {
      parts.push('UPPER(CH.STATUS) = :status');
      b.status = filter.status.toUpperCase();
    }
  }

  for (const [k, col] of [
    ['q', 'CH.EMP_NAME'],
    ['department', 'CH.DEPARTMENT'],
    ['purpose', 'CH.ATTRIBUTE3'],
  ]) {
    if (filter[k]) {
      parts.push(
        k === 'q'
          ? `(
              UPPER(CH.EMP_NAME) LIKE :q ESCAPE '\\'
              OR TO_CHAR(CH.EMP_NO) LIKE :q ESCAPE '\\'
              OR UPPER(CH.REFERENCE_NO) LIKE :q ESCAPE '\\'
            )`
          : `UPPER(${col}) LIKE :${k} ESCAPE '\\'`,
      );

      b[k] = '%' + filter[k].toUpperCase().replace(/[\\%_]/g, (x) => '\\' + x) + '%';
    }
  }

  if (filter.empNo) {
    parts.push('CH.EMP_NO = :empNo');
    b.empNo = filter.empNo;
  }

  if (filter.createdFrom) {
    parts.push(`
      CH.CREATION_DATE >=
      TO_DATE(:createdFrom, 'YYYY-MM-DD')
    `);
    b.createdFrom = filter.createdFrom;
  }

  if (filter.createdTo) {
    parts.push(`
      CH.CREATION_DATE <
      TO_DATE(:createdTo, 'YYYY-MM-DD') + 1
    `);
    b.createdTo = filter.createdTo;
  }

  // Workflow reads excluded from this patch.
  if (filter.pendingAt) {
    parts.push('1=0');
  }

  const where = parts.join(' AND ');

  const base = `
    FROM XXZP.XX_CLEARANCE_HEADER CH
    LEFT JOIN XXZP.XX_CLEARANCE_EMPLOYEES CE
      ON CE.HEADER_ID = CH.HEADER_ID
    WHERE ${where}
  `;

  const count = await one(
    c,
    `
    SELECT COUNT(*) AS TOTAL
    ${base}
  `,
    b,
  );

  const data = await all(
    c,
    `
    SELECT
      CH.HEADER_ID,
      CH.REFERENCE_NO,
      CH.EMP_NO,
      CH.EMP_NAME,
      CH.JOB_TITLE,
      CH.DEPARTMENT,
      CH.CONTACT,
      CH.ATTRIBUTE1 AS DIVISION,
      CH.ATTRIBUTE2 AS COMPUTER_FLAG,
      CH.ATTRIBUTE3 AS PURPOSE,
      CH.STATUS,
      CH.CREATION_DATE,
      CE.ATTRIBUTE1 AS VACATION_FROM,
      CE.ATTRIBUTE2 AS VACATION_TO
    ${base}
    ORDER BY CH.HEADER_ID DESC
    OFFSET :offset ROWS
    FETCH NEXT :pageSize ROWS ONLY
  `,
    b,
  );

  return {
    total: count.TOTAL,
    items: data,
  };
}

export async function employees(c, userId, privileged, f) {
  const a = await actor(c, userId);

  const b = {
    mine: a?.EMPLOYEE_NUMBER ?? -1,
    myPersonId: a?.PERSON_ID ?? null,
    q: '%' + (f.q ?? '').toUpperCase().replace(/[\\%_]/g, (x) => '\\' + x) + '%',
    offset: (f.page - 1) * f.pageSize,
    pageSize: f.pageSize,
  };

  const scope =
    f.scope === 'all' && privileged
      ? '1=1'
      : `(
          E.EMPLOYEE_NUMBER = :mine
          OR E.SUPERVISOR_ID = :myPersonId
        )`;

  const where = `
    FROM XX_DIGI_EMP_MASTER E
    WHERE E.CURRENT_EMP_FLAG = 'Y'
      AND TRUNC(SYSDATE)
          BETWEEN E.PAPF_EFFECTIVE_START_DATE
              AND E.PAPF_EFFECTIVE_END_DATE
      AND TRUNC(SYSDATE)
          BETWEEN E.PAAF_EFFECTIVE_START_DATE
              AND E.PAAF_EFFECTIVE_END_DATE
      AND ${scope}
      AND (
        UPPER(E.FULL_NAME) LIKE :q ESCAPE '\\'
        OR TO_CHAR(E.EMPLOYEE_NUMBER) LIKE :q ESCAPE '\\'
      )
  `;

  const total = (
    await one(
      c,
      `
      SELECT COUNT(*) AS N
      ${where}
    `,
      b,
    )
  ).N;

  const items = await all(
    c,
    `
    SELECT
      E.EMPLOYEE_NUMBER,
      E.FULL_NAME,
      E.JOB_TITLE,
      E.ORGANIZATION_NAME AS DEPARTMENT,
      E.DIVISION,
      E.EMAIL_ADDRESS
    ${where}
    ORDER BY E.FULL_NAME, E.EMPLOYEE_NUMBER
    OFFSET :offset ROWS
    FETCH NEXT :pageSize ROWS ONLY
  `,
    b,
  );

  return { total, items };
}

export async function approvers(c, section) {
  if (section === 'department') {
    return all(
      c,
      `
      SELECT DISTINCT
        M.FULL_NAME AS NAME,
        M.EMPLOYEE_NUMBER AS EMP_NO,
        M.USER_ID
      FROM XX_DIGI_EMP_MASTER M
      JOIN XX_DIGI_JOB_MASTER J
        ON J.JOB_ID = M.JOB_ID
      WHERE M.CURRENT_EMP_FLAG = 'Y'
        AND J.APPROVAL_AUTHORITY BETWEEN 5 AND 9
      ORDER BY NAME, EMP_NO
    `,
    );
  }

  return all(
    c,
    `
    SELECT DISTINCT
      M.FULL_NAME AS NAME,
      M.EMPLOYEE_NUMBER AS EMP_NO,
      D.USER_ID
    FROM XX_DIGI_LOOKUP_VALUES L
    JOIN XX_DIGI_EMP_MASTER M
      ON TO_CHAR(M.EMPLOYEE_NUMBER) = L.LOOKUP_CODE
    JOIN XX_DIGI_EMP_DETAILS D
      ON D.EMPLOYEE_NUMBER = M.EMPLOYEE_NUMBER
    WHERE L.LOOKUP_TYPE = 'XX_CLEARANCE_APPR'
      AND UPPER(L.DESCRIPTION) = UPPER(:section)
      AND M.CURRENT_EMP_FLAG = 'Y'
    ORDER BY NAME, EMP_NO
  `,
    {
      section: section === 'warehouse' ? 'Warehouse' : section,
    },
  );
}

export async function computerDestinations(c, userId, privileged) {
  const a = await actor(c, userId);

  return all(
    c,
    `
    SELECT
      E.EMPLOYEE_NUMBER AS VALUE,
      E.FULL_NAME AS LABEL
    FROM XX_DIGI_EMP_MASTER E
    WHERE E.CURRENT_EMP_FLAG = 'Y'
      AND TRUNC(SYSDATE)
          BETWEEN E.PAPF_EFFECTIVE_START_DATE
              AND E.PAPF_EFFECTIVE_END_DATE
      AND TRUNC(SYSDATE)
          BETWEEN E.PAAF_EFFECTIVE_START_DATE
              AND E.PAAF_EFFECTIVE_END_DATE
      AND (
        :privileged = 1
        OR E.EMPLOYEE_NUMBER = :mine
        OR E.SUPERVISOR_ID = :myPersonId
      )
    ORDER BY E.FULL_NAME, E.EMPLOYEE_NUMBER
  `,
    {
      privileged: privileged ? 1 : 0,
      mine: a?.EMPLOYEE_NUMBER ?? -1,
      myPersonId: a?.PERSON_ID ?? -1,
    },
  );
}

export async function supervisorUserId(c, empNo) {
  return one(
    c,
    `
    SELECT M.USER_ID
    FROM XX_DIGI_EMP_MASTER E
    JOIN XX_DIGI_EMP_MASTER M
      ON M.PERSON_ID = E.SUPERVISOR_ID
    WHERE E.EMPLOYEE_NUMBER = :empNo
      AND E.CURRENT_EMP_FLAG = 'Y'
      AND TRUNC(SYSDATE)
          BETWEEN E.PAPF_EFFECTIVE_START_DATE
              AND E.PAPF_EFFECTIVE_END_DATE
      AND TRUNC(SYSDATE)
          BETWEEN E.PAAF_EFFECTIVE_START_DATE
              AND E.PAAF_EFFECTIVE_END_DATE
      AND M.CURRENT_EMP_FLAG = 'Y'
      AND TRUNC(SYSDATE)
          BETWEEN M.PAPF_EFFECTIVE_START_DATE
              AND M.PAPF_EFFECTIVE_END_DATE
      AND TRUNC(SYSDATE)
          BETWEEN M.PAAF_EFFECTIVE_START_DATE
              AND M.PAAF_EFFECTIVE_END_DATE
    ORDER BY M.EMPLOYEE_NUMBER
    FETCH FIRST 1 ROW ONLY
  `,
    { empNo },
  );
}
