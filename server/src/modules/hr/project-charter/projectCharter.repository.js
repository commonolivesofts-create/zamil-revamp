import oracledb from 'oracledb';

const fetchRows = async (connection, sql, binds = {}) =>
  (
    await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    })
  ).rows;

const charDate = (column) => `TO_CHAR(${column}, 'YYYY-MM-DD')`;

const milestoneMap = {
  formProjectTeam: 'PJTEAM_PRE_SCOPE',
  finalizePlan: 'FINALPJ_CHARER',
  definePhase: 'DEFINE_PHASE',
  analysisPhase: 'ANALYSIS_PHASE',
  improvementPhase: 'IMPROVEMENT_PHASE',
  controlPhase: 'CONTROL_PHASE',
  projectSummary: 'PROJECT_SUMMARY',
};

const parse = (value) => {
  const [start, complete] = String(value ?? '').split('__00__');

  return {
    start: start === 'yes',
    complete: complete === 'yes',
  };
};

export const pack = (value) =>
  `${value?.start ? 'yes' : 'null'}__00__${value?.complete ? 'yes' : 'null'}`;

const display = (r, detail = false) => {
  if (!r) return null;

  const record = {
    headerId: String(r.HEADER_ID),

    ideaId: r.ATTRIBUTE1 === null || r.ATTRIBUTE1 === undefined ? null : String(r.ATTRIBUTE1),

    ideaNum: r.IDEA_NUM,
    projectName: r.PRJ_NAME,
    projectManager: r.PRJ_MANAGER,
    businessUnit: r.BUSINESS_UNIT,
    processImpacted: r.PROCESS_IMPACTED,

    expectedStartDate: r.EXPECTED_START_DATE,
    expectedEndDate: r.EXPECTED_END_DATE,

    purpose: r.PURPOSE_PRJ,
    expectedDeliverables: r.EXP_DELIVERABLES,

    projectTeam: r.PROJECT_TEAM,
    supportResources: r.SUPPORT_R,
    specialNeeds: r.SPECIAL_NEEDS,

    processOwner: r.PROCESS_OWNER,
    keyStakeholders: r.KEY_STAKEHOLDERS,
    finalCustomer: r.FINAL_CUSTOMER,

    preparedBy: r.PREPARED_BY,
    creationDate: r.CREATION_DATE_ISO,
    status: r.STATUS,
  };

  if (detail) {
    record.milestones = Object.fromEntries(
      Object.entries(milestoneMap).map(([key, column]) => [key, parse(r[column])]),
    );

    record.rewardExists = Boolean(r.REWARD_EXISTS);
  }

  return record;
};

const projection = `
  C.HEADER_ID,
  C.ATTRIBUTE1,
  C.IDEA_NUM,
  C.PRJ_NAME,
  C.PRJ_MANAGER,
  C.BUSINESS_UNIT,
  C.PROCESS_IMPACTED,

  ${charDate('C.EXP_START_DATE')} EXPECTED_START_DATE,
  ${charDate('C.EXP_COMPLETE_DATE')} EXPECTED_END_DATE,

  C.PURPOSE_PRJ,
  C.EXP_DELIVERABLES,

  C.PJTEAM_PRE_SCOPE,
  C.FINALPJ_CHARER,
  C.DEFINE_PHASE,
  C.ANALYSIS_PHASE,
  C.IMPROVEMENT_PHASE,
  C.CONTROL_PHASE,
  C.PROJECT_SUMMARY,

  C.PROJECT_TEAM,
  C.SUPPORT_R,
  C.SPECIAL_NEEDS,

  C.PROCESS_OWNER,
  C.KEY_STAKEHOLDERS,
  C.FINAL_CUSTOMER,

  C.PREPARED_BY,
  ${charDate('C.CREATION_DATE')} CREATION_DATE_ISO,
  C.STATUS
`;

export async function findCharter(connection, headerId, lock = false) {
  const [row] = await fetchRows(
    connection,
    `
      SELECT ${projection},
        (
          SELECT COUNT(*)
          FROM IDEA_REWARD R
          WHERE R.HEADER_ID = C.HEADER_ID
        ) REWARD_EXISTS
      FROM XXZP.XXZP_PRJ_CHARTER C
      WHERE C.HEADER_ID = :headerId
      ${lock ? 'FOR UPDATE OF C.STATUS' : ''}
    `,
    { headerId },
  );

  return display(row, true);
}

export async function findApprovedIdea(connection, ideaId) {
  const [row] = await fetchRows(
    connection,
    `
      SELECT
        HEADER_ID,
        ID_NO,
        TITLE,
        DIVISION,
        SAVING,
        AMOUNT,
        INV_CATEGORY,
        CATERGORY
      FROM XXZP_IDEA
      WHERE HEADER_ID = :ideaId
        AND UPPER(STATUS) = 'APPROVED'
    `,
    { ideaId },
  );

  if (!row) {
    return null;
  }

  return {
    ideaId: String(row.HEADER_ID),
    ideaNum: row.ID_NO,
    title: row.TITLE,
    businessUnit: row.DIVISION,
    estimatedSavings: row.SAVING,
    investmentAmount: row.AMOUNT,
    investmentCategory: row.INV_CATEGORY,
    ideaCategory: row.CATERGORY,
  };
}

export async function listIdeas(connection) {
  const rows = await fetchRows(
    connection,
    `
      SELECT
        HEADER_ID,
        ID_NO,
        TITLE
      FROM XXZP_IDEA
      WHERE UPPER(STATUS) = 'APPROVED'
      ORDER BY HEADER_ID DESC
    `,
  );

  return rows.map((row) => ({
    ideaId: String(row.HEADER_ID),
    ideaNum: row.ID_NO,
    title: row.TITLE,
  }));
}

export async function listCharters(connection, query) {
  const q = {
    page: 1,
    pageSize: 25,
    ...query,
  };

  const binds = {
    q: q.q ?? null,
    ideaNo: q.ideaNo ?? null,
    status: q.status ?? null,
    pm: q.projectManager ?? null,
    owner: q.processOwner ?? null,
    fromDate: q.from ?? null,
    toDate: q.to ?? null,
    createdFrom: q.createdFrom ?? null,
    createdTo: q.createdTo ?? null,
  };

  const where = `
    FROM XXZP.XXZP_PRJ_CHARTER C
    LEFT JOIN XXZP_IDEA I
      ON I.HEADER_ID = C.ATTRIBUTE1

    WHERE (
      :q IS NULL
      OR UPPER(C.PRJ_NAME)
        LIKE '%' || UPPER(:q) || '%'
      OR UPPER(C.PRJ_MANAGER)
        LIKE '%' || UPPER(:q) || '%'
      OR UPPER(C.IDEA_NUM)
        LIKE '%' || UPPER(:q) || '%'
      OR UPPER(I.ID_NO)
        LIKE '%' || UPPER(:q) || '%'
    )

    AND (
      :ideaNo IS NULL
      OR C.IDEA_NUM = :ideaNo
    )

    AND (
      :status IS NULL
      OR UPPER(C.STATUS) = UPPER(:status)
    )

    AND (
      :pm IS NULL
      OR UPPER(C.PRJ_MANAGER)
        LIKE '%' || UPPER(:pm) || '%'
    )

    AND (
      :owner IS NULL
      OR UPPER(C.PROCESS_OWNER)
        LIKE '%' || UPPER(:owner) || '%'
    )

    AND (
      :fromDate IS NULL
      OR C.EXP_START_DATE >=
        TO_DATE(:fromDate, 'YYYY-MM-DD')
    )

    AND (
      :toDate IS NULL
      OR C.EXP_COMPLETE_DATE <
        TO_DATE(:toDate, 'YYYY-MM-DD') + 1
    )

    AND (
      :createdFrom IS NULL
      OR C.CREATION_DATE >=
        TO_DATE(:createdFrom, 'YYYY-MM-DD')
    )

    AND (
      :createdTo IS NULL
      OR C.CREATION_DATE <
        TO_DATE(:createdTo, 'YYYY-MM-DD') + 1
    )
  `;

  const [count] = await fetchRows(
    connection,
    `
      SELECT COUNT(*) TOTAL
      ${where}
    `,
    binds,
  );

  const rows = await fetchRows(
    connection,
    `
      SELECT ${projection}
      ${where}
      ORDER BY C.HEADER_ID DESC
      OFFSET :offset ROWS
      FETCH NEXT :pageSize ROWS ONLY
    `,
    {
      ...binds,
      offset: (q.page - 1) * q.pageSize,
      pageSize: q.pageSize,
    },
  );

  return {
    total: count.TOTAL,
    items: rows.map((row) => display(row)),
  };
}

const columnBindings = {
  projectManager: 'PRJ_MANAGER',
  processImpacted: 'PROCESS_IMPACTED',
  expectedStartDate: 'EXP_START_DATE',
  expectedEndDate: 'EXP_COMPLETE_DATE',
  purpose: 'PURPOSE_PRJ',
  expectedDeliverables: 'EXP_DELIVERABLES',
  projectTeam: 'PROJECT_TEAM',
  supportResources: 'SUPPORT_R',
  specialNeeds: 'SPECIAL_NEEDS',
  processOwner: 'PROCESS_OWNER',
  keyStakeholders: 'KEY_STAKEHOLDERS',
  finalCustomer: 'FINAL_CUSTOMER',
  preparedBy: 'PREPARED_BY',
};

const dateKeys = new Set(['expectedStartDate', 'expectedEndDate']);

function writeFields(payload) {
  const entries = Object.entries(columnBindings).map(([key, column]) => [
    column,
    key,
    dateKeys.has(key) ? `TO_DATE(:${key}, 'YYYY-MM-DD')` : `:${key}`,
    payload[key] ?? null,
  ]);

  for (const [key, column] of Object.entries(milestoneMap)) {
    entries.push([column, `ms_${key}`, `:ms_${key}`, pack(payload.milestones?.[key])]);
  }

  return entries;
}

/**
 * Creates a Project Charter using a database-generated
 * HEADER_ID.
 *
 * IMPORTANT:
 * This function must only be activated after confirming
 * that HEADER_ID has a compatible database identity
 * or generated-key mechanism.
 *
 * Never use MAX(HEADER_ID) + 1.
 * Never invent a sequence name.
 */
export async function insertCharterUsingIdentity(connection, payload, idea) {
  const fields = writeFields(payload);

  const columns = fields.map((entry) => entry[0]);
  const values = fields.map((entry) => entry[2]);

  const binds = Object.fromEntries(fields.map((entry) => [entry[1], entry[3]]));

  columns.push('ATTRIBUTE1', 'IDEA_NUM', 'PRJ_NAME', 'BUSINESS_UNIT', 'STATUS', 'CREATION_DATE');

  values.push(':ideaId', ':ideaNum', ':title', ':bu', "'Pending'", 'SYSDATE');

  Object.assign(binds, {
    ideaId: idea.ideaId,
    ideaNum: idea.ideaNum,
    title: idea.title,
    bu: idea.businessUnit,

    generatedId: {
      dir: oracledb.BIND_OUT,
      type: oracledb.STRING,
      maxSize: 40,
    },
  });

  const result = await connection.execute(
    `
      INSERT INTO XXZP.XXZP_PRJ_CHARTER
        (${columns.join(', ')})
      VALUES
        (${values.join(', ')})
      RETURNING HEADER_ID INTO :generatedId
    `,
    binds,
  );

  return String(result.outBinds.generatedId[0]);
}

export async function updateCharter(connection, headerId, payload, idea) {
  const fields = writeFields(payload);

  const sets = fields.map((entry) => `${entry[0]} = ${entry[2]}`);

  const binds = Object.fromEntries(fields.map((entry) => [entry[1], entry[3]]));

  sets.push('PRJ_NAME = :title', 'BUSINESS_UNIT = :bu', 'IDEA_NUM = :ideaNum');

  Object.assign(binds, {
    headerId,
    title: idea.title,
    bu: idea.businessUnit,
    ideaNum: idea.ideaNum,
  });

  const result = await connection.execute(
    `
      UPDATE XXZP.XXZP_PRJ_CHARTER
      SET ${sets.join(', ')}
      WHERE HEADER_ID = :headerId
        AND STATUS = 'Pending'
    `,
    binds,
  );

  return result.rowsAffected;
}

export async function removeCharter(connection, headerId) {
  const rewardResult = await connection.execute(
    `
      DELETE FROM IDEA_REWARD
      WHERE HEADER_ID = :headerId
    `,
    { headerId },
  );

  const charterResult = await connection.execute(
    `
      DELETE FROM XXZP.XXZP_PRJ_CHARTER
      WHERE HEADER_ID = :headerId
        AND STATUS = 'Pending'
    `,
    { headerId },
  );

  return {
    charterDeleted: charterResult.rowsAffected,
    rewardDeleted: rewardResult.rowsAffected,
  };
}

export async function getReward(connection, headerId) {
  const [row] = await fetchRows(
    connection,
    `
      SELECT
        R.HEADER_ID,
        R.IDEA_NUMBER,
        R.PROJECT_NAME,
        R.PROJECT_MANAGER,
        ${charDate('R.EXP_START_DATE')} EXP_START_DATE,
        ${charDate('R.EXP_END_DATE')} EXP_END_DATE,
        R.PROCESS_OWNER,
        R.IDEA_CATEGORY,
        R.ESTD_SAVINGS,
        R.ACTUAL_SAVINGS,
        R.IRR_RATE,
        R.PERCENTAGE,
        R.TOTAL_GRADE,
        R.REWARD
      FROM IDEA_REWARD R
      WHERE R.HEADER_ID = :headerId
    `,
    { headerId },
  );

  if (!row) {
    return null;
  }

  return {
    headerId: String(row.HEADER_ID),
    ideaNum: row.IDEA_NUMBER,
    projectName: row.PROJECT_NAME,
    projectManager: row.PROJECT_MANAGER,
    expectedStartDate: row.EXP_START_DATE,
    expectedEndDate: row.EXP_END_DATE,
    processOwner: row.PROCESS_OWNER,
    ideaCategory: row.IDEA_CATEGORY,
    estimatedSavings: row.ESTD_SAVINGS,
    actualSavings: row.ACTUAL_SAVINGS,
    irrRate: row.IRR_RATE,
    percentage: row.PERCENTAGE,
    totalGrade: row.TOTAL_GRADE,
    reward: row.REWARD,
  };
}

export async function listEmployees(connection, { q = null, page = 1, pageSize = 25 }) {
  const rows = await fetchRows(
    connection,
    `
      SELECT
        EMPLOYEE_NUMBER,
        FULL_NAME,
        JOB_TITLE,
        CAST(NULL AS VARCHAR2(1))
          AS DEPARTMENT_NAME
      FROM XX_DIGI_EMP_MASTER

      WHERE (
        :q IS NULL
        OR UPPER(FULL_NAME)
          LIKE '%' || UPPER(:q) || '%'
        OR TO_CHAR(EMPLOYEE_NUMBER)
          LIKE '%' || :q || '%'
      )

      ORDER BY FULL_NAME
      OFFSET :offset ROWS
      FETCH NEXT :limit ROWS ONLY
    `,
    {
      q,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    },
  );

  return rows.map((row) => ({
    empNo: String(row.EMPLOYEE_NUMBER),
    fullName: row.FULL_NAME,
    jobTitle: row.JOB_TITLE,
    department: row.DEPARTMENT_NAME,
  }));
}

export async function findEmployee(connection, empNo) {
  const [row] = await fetchRows(
    connection,
    `
      SELECT
        EMPLOYEE_NUMBER,
        FULL_NAME,
        JOB_TITLE,
        CAST(NULL AS VARCHAR2(1))
          AS DEPARTMENT_NAME
      FROM XX_DIGI_EMP_MASTER
      WHERE EMPLOYEE_NUMBER = :empNo
    `,
    { empNo },
  );

  if (!row) {
    return null;
  }

  return {
    empNo: String(row.EMPLOYEE_NUMBER),
    fullName: row.FULL_NAME,
    jobTitle: row.JOB_TITLE,
    department: row.DEPARTMENT_NAME,
  };
}

export async function findActorProfile(connection, userId) {
  const [row] = await fetchRows(
    connection,
    `
      SELECT
        FULL_NAME,
        EMAIL_ADDRESS
      FROM XX_DIGI_EMP_MASTER
      WHERE USER_ID = :userId
    `,
    { userId },
  );

  if (!row) {
    return null;
  }

  return {
    fullName: row.FULL_NAME,
    emailAddress: row.EMAIL_ADDRESS,
  };
}
