import oracledb from 'oracledb';

/*
 * Interview Assessment Form SQL (README_interview_assessment_form.md §3–§8). Values are always
 * bound; sort columns come only from the fixed SORT_COLUMNS allowlist. IDs (NUMBER(19,0)) are read
 * and bound as strings. Business dates are bound as legacy 'DD-Mon-YY' strings and matched with
 * TO_DATE, as the approved SQL specifies; filter dates are ISO 'YYYY-MM-DD'. Every statement runs
 * on the connection the service passes in — repositories never commit or roll back.
 */
const ID = { type: oracledb.STRING };

const rows = async (connection, sql, binds, fetchInfo) =>
  (
    await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchInfo,
    })
  ).rows;

const ID_FETCH = { HEADER_ID: ID, CREATED_BY: ID };

// --- Key generation & insert (README §3) --------------------------------------------------------

/** Legacy max+1 key with the documented 636 fallback, generated inside the caller's transaction. */
export async function generateHeaderId(connection) {
  const [row] = await rows(
    connection,
    `SELECT NVL(MAX(HEADER_ID + 1), 636) AS ID
       FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T`,
    {},
  );
  return String(row.ID);
}

export async function insertHeader(connection, h) {
  await connection.execute(
    `INSERT INTO XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
       (UUID, HEADER_ID, CANDIDATE_NAME, POSITION_NAME, NATIONALITY, MARITAL_STATUS, AGE,
        INTERVIEW_DATE, INTERVIEW_TIME, INTERVIEW_TYPE, SECONDARY_EDUCATION, SECONDARY_EDUCATION_CHK,
        LAST_POSITION_HELD, COMPANY_NAME, RELEVANT_YEARS_EXPERIENCE, INTERVIEWED_BY,
        PERSONAL_SPEC_TOTAL, PERSONAL_SPEC_RESULT, JOB_COMPETENCY_TOTAL, JOB_COMPETENCY_RESULT,
        CREATED_BY, CREATION_DATE, ATTRIBUTE3, ATTRIBUTE4, STATUS,
        INTERVIEWEDBY2, INTERVIEWEDBY3, INT_NO, LOCATION, CURR_EMPLOYER, JOINING, MAJOR, DIVISION,
        CUR_SAL_BASIC, EXP_SAL_BASIC, CUR_SAL_TOTAL, EXP_SAL_TOTAL)
     VALUES
       (:uuid, :headerId, :candidateName, :positionName, :nationality, :maritalStatus, NVL(:age, 0),
        TO_DATE(:interviewDate, 'DD-Mon-YY'), :interviewTime, :interviewType, :secondaryEducation, :secondaryEducationChk,
        :lastPositionHeld, :companyName, NVL(:relevantYearsExperience, 0), :interviewedBy,
        NVL(:personalSpecTotal, 0), :personalSpecResult, NVL(:jobCompetencyTotal, 0), :jobCompetencyResult,
        :createdBy, SYSDATE, :attribute3, :requisitionNo, :status,
        :interviewedBy2, :interviewedBy3, :intNo, :location, :currentEmployer,
        TO_DATE(:joining, 'DD-Mon-YY'), :major, :division,
        :curSalBasic, :expSalBasic, :curSalTotal, :expSalTotal)`,
    h,
  );
}

export async function insertPersonalSpec(connection, s) {
  await connection.execute(
    `INSERT INTO XXZP.XXZP_PERSONAL_SPEC_T
       (HEADER_ID, SELF_CONFIDANCE_RATING, SELF_CONFIDANCE_REMARK,
        ATTITUDE_RATING, ATTITUDE_REMARK,
        GENERAL_KNOWLEDGE_RATING, GENERAL_KNOWLEDGE_REMARK,
        EXPERIENCE_RATING, EXPERIENCE_REMARK,
        LANGUAGE_FLUENCY_RATING, LANGUAGE_FLUENCY_REMARK,
        COMMUNICATION_SKILL_RATING, COMMUNICATION_SKILL_REMARK,
        SAFTY_AWARENESS_RATING, SAFTY_AWARENESS_REMARK,
        PHYSICAL_HEALTH_RATING, PHYSICAL_HEALTH_REMARK,
        CREATED_BY, CREATION_DATE)
     VALUES
       (:headerId, :rate1, :remark1, :rate2, :remark2, :rate3, :remark3,
        :rate4, :remark4, :rate5, :remark5, :rate6, :remark6,
        :rate7, :remark7, :rate8, :remark8, :createdBy, SYSDATE)`,
    s,
  );
}

export async function insertJobCompetency(connection, j) {
  await connection.execute(
    `INSERT INTO XXZP.XXZP_JOB_COMPETENCY_T
       (HEADER_ID, JOB_KNOWLEDGE_RATING, JOB_KNOWLEDGE_REMARK,
        LEADERSHIP_SKILLS_RATING, LEADERSHIP_SKILLS_REMARK,
        WORK_UNDER_PRESSURE_RATING, WORK_UNDER_PRESSURE_REMARK,
        NATION_CONFIRT_RATING, NATION_CONFIRT_REMARK,
        SHIFTS_CONFIRT_RATING, SHIFTS_CONFIRT_REMARK,
        OVERTIME_CONFIRT_RATING, OVERTIME_CONFIRT_REMARK,
        STRENGTHS_SUMMARY, WEAKNESSES_SUMMARY, CREATED_BY, CREATION_DATE)
     VALUES
       (:headerId, :cRating1, :cRemark1, :cRating2, :cRemark2, :cRating3, :cRemark3,
        :cRating4, :cRemark4, :cRating5, :cRemark5, :cRating6, :cRemark6,
        :sumStrength, :sumWeekness, :createdBy, SYSDATE)`,
    j,
  );
}

export async function insertEvaluation(connection, e) {
  await connection.execute(
    `INSERT INTO XXZP.XXZP_INTERVIEW_EVAL_T
       (HEADER_ID, STATUS, INTERVIEWED_BY, ADMIN_MANAGER, MANAGNING_DIRECTOR,
        HR_REP, ATTRIBUTE1, DEPT_REP, CREATED_BY, CREATION_DATE)
     VALUES
       (:headerId, :evalStatus, :evalInterviewedBy, :adminManager, :managningDirector,
        :hrRep, :comment, :deptRep, :createdBy, SYSDATE)`,
    e,
  );
}

// --- Read (README §4) ---------------------------------------------------------------------------

const mapHeader = (row) => ({
  headerId: row.HEADER_ID,
  candidateName: row.CANDIDATE_NAME,
  positionName: row.POSITION_NAME,
  requisitionNo: row.ATTRIBUTE4,
  attribute3: row.ATTRIBUTE3,
  nationality: row.NATIONALITY,
  materialStatus: row.MARITAL_STATUS,
  age: row.AGE,
  interviewDate: row.INTERVIEW_DATE,
  interviewTime: row.INTERVIEW_TIME,
  interviewType: row.INTERVIEW_TYPE,
  secondaryEducation: row.SECONDARY_EDUCATION,
  secondaryEducationChk: row.SECONDARY_EDUCATION_CHK,
  lastPositionHeld: row.LAST_POSITION_HELD,
  companyName: row.COMPANY_NAME,
  relevantYearsExperience: row.RELEVANT_YEARS_EXPERIENCE,
  location: row.LOCATION,
  currentEmployer: row.CURR_EMPLOYER,
  joining: row.JOINING,
  major: row.MAJOR,
  division: row.DIVISION,
  curSalBasic: row.CUR_SAL_BASIC,
  expSalBasic: row.EXP_SAL_BASIC,
  curSalTotal: row.CUR_SAL_TOTAL,
  expSalTotal: row.EXP_SAL_TOTAL,
  interviewedBy: row.INTERVIEWED_BY,
  interviewedBy2: row.INTERVIEWEDBY2,
  interviewedBy3: row.INTERVIEWEDBY3,
  personalSpecTotal: row.PERSONAL_SPEC_TOTAL,
  personalSpecResult: row.PERSONAL_SPEC_RESULT,
  jobCompetencyTotal: row.JOB_COMPETENCY_TOTAL,
  jobCompetencyResult: row.JOB_COMPETENCY_RESULT,
  status: row.STATUS,
  intNo: row.INT_NO,
  approvalAuthority: row.APPROVAL_AUTHORITY,
  createdAt: row.CREATION_DATE,
  updatedAt: row.LAST_UPDATE_DATE,
});

const HEADER_COLUMNS = `
  INT.HEADER_ID, INT.CANDIDATE_NAME, INT.POSITION_NAME, INT.ATTRIBUTE4, INT.ATTRIBUTE3,
  INT.NATIONALITY, INT.MARITAL_STATUS, INT.AGE,
  TO_CHAR(INT.INTERVIEW_DATE, 'DD-Mon-YY') AS INTERVIEW_DATE, INT.INTERVIEW_TIME, INT.INTERVIEW_TYPE,
  INT.SECONDARY_EDUCATION, INT.SECONDARY_EDUCATION_CHK, INT.LAST_POSITION_HELD, INT.COMPANY_NAME,
  INT.RELEVANT_YEARS_EXPERIENCE, INT.LOCATION, INT.CURR_EMPLOYER,
  TO_CHAR(INT.JOINING, 'DD-Mon-YY') AS JOINING, INT.MAJOR, INT.DIVISION,
  INT.CUR_SAL_BASIC, INT.EXP_SAL_BASIC, INT.CUR_SAL_TOTAL, INT.EXP_SAL_TOTAL,
  INT.INTERVIEWED_BY, INT.INTERVIEWEDBY2, INT.INTERVIEWEDBY3, INT.STATUS, INT.INT_NO,
  INT.PERSONAL_SPEC_TOTAL, INT.PERSONAL_SPEC_RESULT, INT.JOB_COMPETENCY_TOTAL, INT.JOB_COMPETENCY_RESULT,
  INT.CREATION_DATE, INT.LAST_UPDATE_DATE,
  (SELECT JM.APPROVAL_AUTHORITY FROM XX_DIGI_JOB_MASTER JM WHERE JM.NAME = INT.POSITION_NAME)
      AS APPROVAL_AUTHORITY`;

/** Full header row with the position's approval authority, or null when absent (README §4.1). */
export async function findHeader(connection, headerId) {
  const [row] = await rows(
    connection,
    `SELECT ${HEADER_COLUMNS}
       FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T INT
      WHERE INT.HEADER_ID = :headerId`,
    { headerId },
    ID_FETCH,
  );
  return row ? mapHeader(row) : null;
}

/** HEADER_ID + STATUS only — the existence check and delete guard of README §5/§6. */
export async function findHeaderStatus(connection, headerId) {
  const [row] = await rows(
    connection,
    `SELECT HEADER_ID, STATUS FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T WHERE HEADER_ID = :headerId`,
    { headerId },
    { HEADER_ID: ID },
  );
  return row ? { headerId: row.HEADER_ID, status: row.STATUS } : null;
}

const mapPersonalSpec = (row) => ({
  rate1: row.SELF_CONFIDANCE_RATING,
  remark1: row.SELF_CONFIDANCE_REMARK,
  rate2: row.ATTITUDE_RATING,
  remark2: row.ATTITUDE_REMARK,
  rate3: row.GENERAL_KNOWLEDGE_RATING,
  remark3: row.GENERAL_KNOWLEDGE_REMARK,
  rate4: row.EXPERIENCE_RATING,
  remark4: row.EXPERIENCE_REMARK,
  rate5: row.LANGUAGE_FLUENCY_RATING,
  remark5: row.LANGUAGE_FLUENCY_REMARK,
  rate6: row.COMMUNICATION_SKILL_RATING,
  remark6: row.COMMUNICATION_SKILL_REMARK,
  rate7: row.SAFTY_AWARENESS_RATING,
  remark7: row.SAFTY_AWARENESS_REMARK,
  rate8: row.PHYSICAL_HEALTH_RATING,
  remark8: row.PHYSICAL_HEALTH_REMARK,
});

export async function findPersonalSpec(connection, headerId) {
  const [row] = await rows(
    connection,
    `SELECT SELF_CONFIDANCE_RATING, SELF_CONFIDANCE_REMARK, ATTITUDE_RATING, ATTITUDE_REMARK,
            GENERAL_KNOWLEDGE_RATING, GENERAL_KNOWLEDGE_REMARK, EXPERIENCE_RATING, EXPERIENCE_REMARK,
            LANGUAGE_FLUENCY_RATING, LANGUAGE_FLUENCY_REMARK, COMMUNICATION_SKILL_RATING,
            COMMUNICATION_SKILL_REMARK, SAFTY_AWARENESS_RATING, SAFTY_AWARENESS_REMARK,
            PHYSICAL_HEALTH_RATING, PHYSICAL_HEALTH_REMARK
       FROM XXZP.XXZP_PERSONAL_SPEC_T
      WHERE HEADER_ID = :headerId`,
    { headerId },
  );
  return row ? mapPersonalSpec(row) : null;
}

const mapJobCompetency = (row) => ({
  cRating1: row.JOB_KNOWLEDGE_RATING,
  cRemark1: row.JOB_KNOWLEDGE_REMARK,
  cRating2: row.LEADERSHIP_SKILLS_RATING,
  cRemark2: row.LEADERSHIP_SKILLS_REMARK,
  cRating3: row.WORK_UNDER_PRESSURE_RATING,
  cRemark3: row.WORK_UNDER_PRESSURE_REMARK,
  cRating4: row.NATION_CONFIRT_RATING,
  cRemark4: row.NATION_CONFIRT_REMARK,
  cRating5: row.SHIFTS_CONFIRT_RATING,
  cRemark5: row.SHIFTS_CONFIRT_REMARK,
  cRating6: row.OVERTIME_CONFIRT_RATING,
  cRemark6: row.OVERTIME_CONFIRT_REMARK,
  sumStrength: row.STRENGTHS_SUMMARY,
  sumWeekness: row.WEAKNESSES_SUMMARY,
});

export async function findJobCompetency(connection, headerId) {
  const [row] = await rows(
    connection,
    `SELECT JOB_KNOWLEDGE_RATING, JOB_KNOWLEDGE_REMARK, LEADERSHIP_SKILLS_RATING,
            LEADERSHIP_SKILLS_REMARK, WORK_UNDER_PRESSURE_RATING, WORK_UNDER_PRESSURE_REMARK,
            NATION_CONFIRT_RATING, NATION_CONFIRT_REMARK, SHIFTS_CONFIRT_RATING, SHIFTS_CONFIRT_REMARK,
            OVERTIME_CONFIRT_RATING, OVERTIME_CONFIRT_REMARK, STRENGTHS_SUMMARY, WEAKNESSES_SUMMARY
       FROM XXZP.XXZP_JOB_COMPETENCY_T
      WHERE HEADER_ID = :headerId`,
    { headerId },
  );
  return row ? mapJobCompetency(row) : null;
}

const mapEvaluation = (row) => ({
  status: row.STATUS,
  interviewedBy: row.INTERVIEWED_BY,
  adminManager: row.ADMIN_MANAGER,
  managningDirector: row.MANAGNING_DIRECTOR,
  hrRep: row.HR_REP,
  comment: row.ATTRIBUTE1,
  deptRep: row.DEPT_REP,
});

const EVAL_COLUMNS = `STATUS, INTERVIEWED_BY, ADMIN_MANAGER, MANAGNING_DIRECTOR, HR_REP, ATTRIBUTE1, DEPT_REP`;

export async function findEvaluation(connection, headerId) {
  const [row] = await rows(
    connection,
    `SELECT ${EVAL_COLUMNS} FROM XXZP.XXZP_INTERVIEW_EVAL_T WHERE HEADER_ID = :headerId`,
    { headerId },
  );
  return row ? mapEvaluation(row) : null;
}

/** Evaluation status for the delete guard (README §6); null when no evaluation row exists. */
export async function findEvaluationStatus(connection, headerId) {
  const [row] = await rows(
    connection,
    `SELECT STATUS FROM XXZP.XXZP_INTERVIEW_EVAL_T WHERE HEADER_ID = :headerId`,
    { headerId },
  );
  return row ? row.STATUS : null;
}

// --- Listing (README §7) ------------------------------------------------------------------------

const SORT_COLUMNS = Object.freeze({
  HEADER_ID: 'INV.HEADER_ID',
  INTERVIEW_DATE: 'INV.INTERVIEW_DATE',
  CANDIDATE_NAME: 'INV.CANDIDATE_NAME',
  CREATION_DATE: 'INV.CREATION_DATE',
});

// Fixed fragments; only their values come from the validated request.
const FILTERS = Object.freeze({
  search: () => `(UPPER(INV.CANDIDATE_NAME) LIKE :search ESCAPE '\\'
                 OR UPPER(INV.INT_NO) LIKE :search ESCAPE '\\'
                 OR UPPER(INV.POSITION_NAME) LIKE :search ESCAPE '\\')`,
  status: () => 'UPPER(INV.STATUS) = UPPER(:status)',
  evaluationStatus: () => 'UPPER(EVAL.STATUS) = UPPER(:evaluationStatus)',
  requisitionNo: () => 'UPPER(INV.ATTRIBUTE4) = UPPER(:requisitionNo)',
  positionName: () => "UPPER(INV.POSITION_NAME) LIKE '%'||UPPER(:positionName)||'%'",
  division: () => 'UPPER(INV.DIVISION) = UPPER(:division)',
  interviewType: () => 'UPPER(INV.INTERVIEW_TYPE) = UPPER(:interviewType)',
  dateFrom: () => "INV.INTERVIEW_DATE >= TO_DATE(:dateFrom, 'YYYY-MM-DD')",
  dateTo: () => "INV.INTERVIEW_DATE < TO_DATE(:dateTo, 'YYYY-MM-DD') + 1",
});

const LIST_COLUMNS = `
  INV.HEADER_ID, INV.CANDIDATE_NAME, INV.POSITION_NAME, INV.NATIONALITY,
  TO_CHAR(INV.INTERVIEW_DATE, 'DD-Mon-YY') AS INTERVIEW_DATE, INV.INT_NO,
  INV.ATTRIBUTE4 AS REQUISITION_NO, INV.DIVISION, INV.INTERVIEW_TYPE,
  INV.CREATED_BY, TO_CHAR(INV.CREATION_DATE, 'YYYY-MM-DD') AS CREATION_DATE,
  INV.STATUS AS HEADER_STATUS, EVAL.STATUS AS EVALUATION_STATUS`;

const FROM_JOIN = `FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T INV
  JOIN XXZP.XXZP_INTERVIEW_EVAL_T EVAL ON EVAL.HEADER_ID = INV.HEADER_ID`;

const mapListItem = (row) => ({
  headerId: row.HEADER_ID,
  intNo: row.INT_NO,
  candidateName: row.CANDIDATE_NAME,
  positionName: row.POSITION_NAME,
  nationality: row.NATIONALITY,
  interviewDate: row.INTERVIEW_DATE,
  requisitionNo: row.REQUISITION_NO,
  division: row.DIVISION,
  interviewType: row.INTERVIEW_TYPE,
  createdBy: row.CREATED_BY,
  creationDate: row.CREATION_DATE,
  headerStatus: row.HEADER_STATUS,
  evaluationStatus: row.EVALUATION_STATUS,
});

/**
 * Paginated, filtered listing (README §7.2). `search` is an upper-case LIKE pattern already escaped
 * by the caller; `sortBy` must be a key of SORT_COLUMNS; `createdBy` is the server-side scope
 * resolved by the service (HR: optional filter; non-HR: always the actor's own userId).
 */
export async function listAssessments(
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
    conditions.push('INV.CREATED_BY = :createdBy');
    binds.createdBy = createdBy;
  }
  const where = `WHERE ${conditions.join(' AND ')}`;
  const column = SORT_COLUMNS[sortBy];
  if (!column) throw new Error(`Unsupported sort ${sortBy}`);
  const direction = sortDir === 'desc' ? 'DESC' : 'ASC';

  const [{ TOTAL: total }] = await rows(
    connection,
    `SELECT COUNT(DISTINCT INV.HEADER_ID) AS TOTAL ${FROM_JOIN} ${where}`,
    binds,
  );
  const result = await rows(
    connection,
    `SELECT DISTINCT ${LIST_COLUMNS}
       ${FROM_JOIN}
       ${where}
      ORDER BY ${column} ${direction}, INV.HEADER_ID
      OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`,
    { ...binds, offset, limit },
    ID_FETCH,
  );
  return { total, items: result.map(mapListItem) };
}

// --- HR membership (README §7.4) ----------------------------------------------------------------

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

// --- Validation support (README §9) -------------------------------------------------------------

/** Whether an approved requisition exists (XXZPI_PER_REQUISITIONS_ALL, REQUISITION_STATUS='Approved'). */
export async function approvedRequisitionExists(connection, requisitionNo) {
  const result = await rows(
    connection,
    `SELECT REQUISITION_NUMBER
       FROM XXZPI_PER_REQUISITIONS_ALL
      WHERE REQUISITION_NUMBER = :requisitionNo AND REQUISITION_STATUS = 'Approved'
      FETCH FIRST 1 ROWS ONLY`,
    { requisitionNo },
  );
  return result.length > 0;
}

// --- Update (README §5) -------------------------------------------------------------------------

export async function updateHeaderSection(connection, h) {
  const result = await connection.execute(
    `UPDATE XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
        SET CANDIDATE_NAME = :candidateName,
            POSITION_NAME = :positionName,
            NATIONALITY = :nationality,
            MARITAL_STATUS = :maritalStatus,
            AGE = NVL(:age, 0),
            INTERVIEW_DATE = TO_DATE(:interviewDate, 'DD-Mon-YY'),
            INTERVIEW_TIME = :interviewTime,
            INTERVIEW_TYPE = :interviewType,
            SECONDARY_EDUCATION = :secondaryEducation,
            SECONDARY_EDUCATION_CHK = :secondaryEducationChk,
            LAST_POSITION_HELD = :lastPositionHeld,
            COMPANY_NAME = :companyName,
            RELEVANT_YEARS_EXPERIENCE = NVL(:relevantYearsExperience, 0),
            ATTRIBUTE4 = :requisitionNo,
            LOCATION = :location,
            CURR_EMPLOYER = :currentEmployer,
            JOINING = TO_DATE(:joining, 'DD-Mon-YY'),
            MAJOR = :major,
            DIVISION = :division,
            CUR_SAL_BASIC = :curSalBasic,
            EXP_SAL_BASIC = :expSalBasic,
            CUR_SAL_TOTAL = :curSalTotal,
            EXP_SAL_TOTAL = :expSalTotal,
            LAST_UPDATED_BY = :updatedBy,
            LAST_UPDATE_LOGIN = :updatedBy,
            LAST_UPDATE_DATE = SYSDATE
      WHERE HEADER_ID = :headerId`,
    h,
  );
  return result.rowsAffected === 1;
}

export async function mergePersonalSpec(connection, s) {
  await connection.execute(
    `MERGE INTO XXZP.XXZP_PERSONAL_SPEC_T d
      USING (SELECT :headerId AS HEADER_ID FROM DUAL) s
      ON (d.HEADER_ID = s.HEADER_ID)
      WHEN MATCHED THEN UPDATE SET
        SELF_CONFIDANCE_RATING = :rate1, SELF_CONFIDANCE_REMARK = :remark1,
        ATTITUDE_RATING = :rate2, ATTITUDE_REMARK = :remark2,
        GENERAL_KNOWLEDGE_RATING = :rate3, GENERAL_KNOWLEDGE_REMARK = :remark3,
        EXPERIENCE_RATING = :rate4, EXPERIENCE_REMARK = :remark4,
        LANGUAGE_FLUENCY_RATING = :rate5, LANGUAGE_FLUENCY_REMARK = :remark5,
        COMMUNICATION_SKILL_RATING = :rate6, COMMUNICATION_SKILL_REMARK = :remark6,
        SAFTY_AWARENESS_RATING = :rate7, SAFTY_AWARENESS_REMARK = :remark7,
        PHYSICAL_HEALTH_RATING = :rate8, PHYSICAL_HEALTH_REMARK = :remark8,
        LAST_UPDATED_BY = :updatedBy, LAST_UPDATE_LOGIN = :updatedBy, LAST_UPDATE_DATE = SYSDATE
      WHEN NOT MATCHED THEN INSERT
        (HEADER_ID, SELF_CONFIDANCE_RATING, SELF_CONFIDANCE_REMARK,
         ATTITUDE_RATING, ATTITUDE_REMARK,
         GENERAL_KNOWLEDGE_RATING, GENERAL_KNOWLEDGE_REMARK,
         EXPERIENCE_RATING, EXPERIENCE_REMARK,
         LANGUAGE_FLUENCY_RATING, LANGUAGE_FLUENCY_REMARK,
         COMMUNICATION_SKILL_RATING, COMMUNICATION_SKILL_REMARK,
         SAFTY_AWARENESS_RATING, SAFTY_AWARENESS_REMARK,
         PHYSICAL_HEALTH_RATING, PHYSICAL_HEALTH_REMARK,
         CREATED_BY, CREATION_DATE)
        VALUES
        (:headerId, :rate1, :remark1, :rate2, :remark2, :rate3, :remark3,
         :rate4, :remark4, :rate5, :remark5, :rate6, :remark6,
         :rate7, :remark7, :rate8, :remark8, :createdBy, SYSDATE)`,
    s,
  );
}

export async function updateHeaderPersonalTotals(connection, t) {
  await connection.execute(
    `UPDATE XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
        SET PERSONAL_SPEC_TOTAL = NVL(:personalSpecTotal, 0),
            PERSONAL_SPEC_RESULT = :personalSpecResult,
            LAST_UPDATED_BY = :updatedBy, LAST_UPDATE_LOGIN = :updatedBy, LAST_UPDATE_DATE = SYSDATE
      WHERE HEADER_ID = :headerId`,
    t,
  );
}

export async function mergeJobCompetency(connection, j) {
  await connection.execute(
    `MERGE INTO XXZP.XXZP_JOB_COMPETENCY_T d
      USING (SELECT :headerId AS HEADER_ID FROM DUAL) s
      ON (d.HEADER_ID = s.HEADER_ID)
      WHEN MATCHED THEN UPDATE SET
        JOB_KNOWLEDGE_RATING = :cRating1, JOB_KNOWLEDGE_REMARK = :cRemark1,
        LEADERSHIP_SKILLS_RATING = :cRating2, LEADERSHIP_SKILLS_REMARK = :cRemark2,
        WORK_UNDER_PRESSURE_RATING = :cRating3, WORK_UNDER_PRESSURE_REMARK = :cRemark3,
        NATION_CONFIRT_RATING = :cRating4, NATION_CONFIRT_REMARK = :cRemark4,
        SHIFTS_CONFIRT_RATING = :cRating5, SHIFTS_CONFIRT_REMARK = :cRemark5,
        OVERTIME_CONFIRT_RATING = :cRating6, OVERTIME_CONFIRT_REMARK = :cRemark6,
        STRENGTHS_SUMMARY = :sumStrength, WEAKNESSES_SUMMARY = :sumWeekness,
        LAST_UPDATED_BY = :updatedBy, LAST_UPDATE_LOGIN = :updatedBy, LAST_UPDATE_DATE = SYSDATE
      WHEN NOT MATCHED THEN INSERT
        (HEADER_ID, JOB_KNOWLEDGE_RATING, JOB_KNOWLEDGE_REMARK,
         LEADERSHIP_SKILLS_RATING, LEADERSHIP_SKILLS_REMARK,
         WORK_UNDER_PRESSURE_RATING, WORK_UNDER_PRESSURE_REMARK,
         NATION_CONFIRT_RATING, NATION_CONFIRT_REMARK,
         SHIFTS_CONFIRT_RATING, SHIFTS_CONFIRT_REMARK,
         OVERTIME_CONFIRT_RATING, OVERTIME_CONFIRT_REMARK,
         STRENGTHS_SUMMARY, WEAKNESSES_SUMMARY, CREATED_BY, CREATION_DATE)
        VALUES
        (:headerId, :cRating1, :cRemark1, :cRating2, :cRemark2, :cRating3, :cRemark3,
         :cRating4, :cRemark4, :cRating5, :cRemark5, :cRating6, :cRemark6,
         :sumStrength, :sumWeekness, :createdBy, SYSDATE)`,
    j,
  );
}

export async function updateHeaderCompetencyTotals(connection, t) {
  await connection.execute(
    `UPDATE XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
        SET JOB_COMPETENCY_TOTAL = NVL(:jobCompetencyTotal, 0),
            JOB_COMPETENCY_RESULT = :jobCompetencyResult,
            LAST_UPDATED_BY = :updatedBy, LAST_UPDATE_LOGIN = :updatedBy, LAST_UPDATE_DATE = SYSDATE
      WHERE HEADER_ID = :headerId`,
    t,
  );
}

export async function mergeEvaluation(connection, e) {
  await connection.execute(
    `MERGE INTO XXZP.XXZP_INTERVIEW_EVAL_T d
      USING (SELECT :headerId AS HEADER_ID FROM DUAL) s
      ON (d.HEADER_ID = s.HEADER_ID)
      WHEN MATCHED THEN UPDATE SET
        STATUS = :evalStatus, INTERVIEWED_BY = :evalInterviewedBy,
        ADMIN_MANAGER = :adminManager, MANAGNING_DIRECTOR = :managningDirector,
        HR_REP = :hrRep, ATTRIBUTE1 = :comment, DEPT_REP = :deptRep,
        LAST_UPDATED_BY = :updatedBy, LAST_UPDATE_LOGIN = :updatedBy, LAST_UPDATE_DATE = SYSDATE
      WHEN NOT MATCHED THEN INSERT
        (HEADER_ID, STATUS, INTERVIEWED_BY, ADMIN_MANAGER, MANAGNING_DIRECTOR,
         HR_REP, ATTRIBUTE1, DEPT_REP, CREATED_BY, CREATION_DATE)
        VALUES
        (:headerId, :evalStatus, :evalInterviewedBy, :adminManager, :managningDirector,
         :hrRep, :comment, :deptRep, :createdBy, SYSDATE)`,
    e,
  );
}

/** Mirror of the evaluation interviewers and the payroll BU onto the header (README §5.4). */
export async function updateHeaderMirror(connection, m) {
  await connection.execute(
    `UPDATE XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T
        SET INTERVIEWED_BY = :evalInterviewedBy,
            INTERVIEWEDBY2 = :interviewedBy2,
            INTERVIEWEDBY3 = :interviewedBy3,
            ATTRIBUTE3 = :attribute3,
            LAST_UPDATED_BY = :updatedBy, LAST_UPDATE_LOGIN = :updatedBy, LAST_UPDATE_DATE = SYSDATE
      WHERE HEADER_ID = :headerId`,
    m,
  );
}

// --- Delete (README §6) -------------------------------------------------------------------------

/** Removes the four rows of one assessment; returns the number of header rows deleted. */
export async function deleteAssessment(connection, headerId) {
  await connection.execute(`DELETE FROM XXZP.XXZP_INTERVIEW_EVAL_T WHERE HEADER_ID = :headerId`, {
    headerId,
  });
  await connection.execute(`DELETE FROM XXZP.XXZP_JOB_COMPETENCY_T WHERE HEADER_ID = :headerId`, {
    headerId,
  });
  await connection.execute(`DELETE FROM XXZP.XXZP_PERSONAL_SPEC_T WHERE HEADER_ID = :headerId`, {
    headerId,
  });
  const result = await connection.execute(
    `DELETE FROM XXZP.XXZP_INTERVW_ASSESMNT_HEADER_T WHERE HEADER_ID = :headerId`,
    { headerId },
  );
  return result.rowsAffected;
}

// --- Lookups (README §8) ------------------------------------------------------------------------

/** Nationalities for the form (README §8.1). */
export async function listNationalities(connection) {
  const result = await rows(
    connection,
    `SELECT DISTINCT MEANING
       FROM XX_DIGI_LOOKUP_VALUES
      WHERE LOOKUP_TYPE = 'ES_NATIONALITY' AND LANGUAGE = 'US'
      ORDER BY MEANING`,
    {},
  );
  return result.map((row) => row.MEANING);
}

/** Approved requisitions with their position (README §8.2). */
export async function listApprovedRequisitions(connection) {
  const result = await rows(
    connection,
    `SELECT DISTINCT REQUISITION_NUMBER, JOB_NAME
       FROM XXZPI_PER_REQUISITIONS_ALL
      WHERE REQUISITION_STATUS = 'Approved'
      ORDER BY 1 DESC`,
    {},
  );
  return result.map((row) => ({
    requisitionNumber: row.REQUISITION_NUMBER,
    jobName: row.JOB_NAME,
  }));
}

/** Current-employee full names for the interviewer datalists (README §8.3). */
export async function listEmployeeNames(connection) {
  const result = await rows(
    connection,
    `SELECT DISTINCT FULL_NAME
       FROM XX_DIGI_EMP_MASTER
      WHERE CURRENT_EMP_FLAG = 'Y'
        AND TRUNC(SYSDATE) BETWEEN PAAF_EFFECTIVE_START_DATE AND PAAF_EFFECTIVE_END_DATE
      ORDER BY 1`,
    {},
  );
  return result.map((row) => row.FULL_NAME);
}
