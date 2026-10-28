/*
 * In-memory double of interviewAssessment.repository.js over an auth store's `state` (so
 * transactions snapshot/rollback it too). It mirrors the SQL semantics the service relies on:
 * max+1 header keys with the 636 fallback, insert of the four rows, header read with the
 * position's approval authority, child rows keyed by HEADER_ID, MERGE-style upserts with the
 * audit trio, the delete order (children then header), §7.1 filters/sort/pagination, the §7.4
 * HR-membership scope and the §8 lookups. It does NOT prove the SQL; it proves the wiring of
 * routes/controllers/service and the transaction boundaries.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parses the stored 'DD-Mon-YY' date; mirrors TO_DATE semantics (no timezone involved). */
const legacyToTime = (value) => {
  if (!value) return null;
  const [, day, month, year] = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(value);
  return Date.UTC(Number(year), MONTHS.indexOf(month), Number(day));
};
const isoToTime = (value) => (value ? Date.parse(`${value}T00:00:00Z`) : null);
const day = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(date);

/** A copy of `row` without the columns the read projection drops (no unused bindings). */
const omit = (row, keys) => {
  const copy = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
};

export function installInterviewAssessments(
  store,
  { hrUserIds = [], requisitions = [], nationalities = [], employees = [], jobMaster = [] } = {},
) {
  store.state.interviewAssessments = {
    nextHeaderId: 636,
    headers: [],
    personalSpecs: [],
    competencies: [],
    evaluations: [],
  };
  store.state.hrUserIds = [...hrUserIds];
  store.state.requisitions = requisitions.map((r) => ({ requisitionStatus: 'Approved', ...r }));
  store.state.nationalities = nationalities;
  // NOT `state.employees`: that key is the auth store's employee table.
  store.state.interviewEmployeeNames = employees;
  store.state.jobMaster = jobMaster;

  const table = () => store.state.interviewAssessments; // re-read: a rollback replaces the object
  const headerOf = (headerId) => table().headers.find((h) => h.headerId === headerId);
  const specOf = (headerId) => table().personalSpecs.find((s) => s.headerId === headerId);
  const compOf = (headerId) => table().competencies.find((j) => j.headerId === headerId);
  const evalOf = (headerId) => table().evaluations.find((e) => e.headerId === headerId);

  const toReadHeader = (h) => ({
    headerId: h.headerId,
    candidateName: h.candidateName,
    positionName: h.positionName,
    requisitionNo: h.requisitionNo,
    attribute3: h.attribute3,
    nationality: h.nationality,
    materialStatus: h.maritalStatus,
    age: h.age,
    interviewDate: h.interviewDate,
    interviewTime: h.interviewTime,
    interviewType: h.interviewType,
    secondaryEducation: h.secondaryEducation,
    secondaryEducationChk: h.secondaryEducationChk,
    lastPositionHeld: h.lastPositionHeld,
    companyName: h.companyName,
    relevantYearsExperience: h.relevantYearsExperience,
    location: h.location,
    currentEmployer: h.currentEmployer,
    joining: h.joining,
    major: h.major,
    division: h.division,
    curSalBasic: h.curSalBasic,
    expSalBasic: h.expSalBasic,
    curSalTotal: h.curSalTotal,
    expSalTotal: h.expSalTotal,
    interviewedBy: h.interviewedBy,
    interviewedBy2: h.interviewedBy2,
    interviewedBy3: h.interviewedBy3,
    personalSpecTotal: h.personalSpecTotal,
    personalSpecResult: h.personalSpecResult,
    jobCompetencyTotal: h.jobCompetencyTotal,
    jobCompetencyResult: h.jobCompetencyResult,
    status: h.status,
    intNo: h.intNo,
    approvalAuthority:
      store.state.jobMaster.find((j) => j.name === h.positionName)?.approvalAuthority ?? null,
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
  });

  const interviewAssessmentRepository = {
    async generateHeaderId() {
      return String(table().nextHeaderId++);
    },
    async insertHeader(_c, h) {
      table().headers.push({ ...h, createdAt: store.now(), updatedAt: null });
    },
    async insertPersonalSpec(_c, s) {
      table().personalSpecs.push({ ...s });
    },
    async insertJobCompetency(_c, j) {
      table().competencies.push({ ...j });
    },
    async insertEvaluation(_c, e) {
      if (store.failures.interviewInsert) throw new Error('simulated evaluation insert failure');
      table().evaluations.push({ ...e });
    },

    async findHeader(_c, headerId) {
      const h = headerOf(headerId);
      return h ? toReadHeader(h) : null;
    },
    async findHeaderStatus(_c, headerId) {
      const h = headerOf(headerId);
      return h ? { headerId: h.headerId, status: h.status } : null;
    },
    async findPersonalSpec(_c, headerId) {
      const row = specOf(headerId);
      return row ? omit(row, ['headerId', 'createdBy', 'updatedAt', 'updatedBy']) : null;
    },
    async findJobCompetency(_c, headerId) {
      const row = compOf(headerId);
      return row ? omit(row, ['headerId', 'createdBy', 'updatedAt', 'updatedBy']) : null;
    },
    async findEvaluation(_c, headerId) {
      const row = evalOf(headerId);
      if (!row) return null;
      const rest = omit(row, [
        'headerId',
        'createdBy',
        'updatedAt',
        'updatedBy',
        'evalStatus',
        'evalInterviewedBy',
      ]);
      return { status: row.evalStatus, interviewedBy: row.evalInterviewedBy, ...rest };
    },
    async findEvaluationStatus(_c, headerId) {
      return evalOf(headerId)?.evalStatus ?? null;
    },

    async listAssessments(_c, { limit, offset, filters = {}, createdBy, sortBy, sortDir }) {
      const key = {
        HEADER_ID: (h) => Number(h.headerId),
        INTERVIEW_DATE: (h) => legacyToTime(h.interviewDate),
        CANDIDATE_NAME: (h) => h.candidateName,
        CREATION_DATE: (h) => h.createdAt.getTime(),
      }[sortBy];
      if (!key) throw new Error(`Unsupported sort ${sortBy}`);
      const term = (pattern) =>
        pattern
          .slice(1, -1)
          .replace(/\\([\\%_])/g, '$1')
          .toUpperCase();
      const items = table()
        .headers.filter((h) => {
          const evaluation = evalOf(h.headerId);
          if (!evaluation) return false; // JOIN XXZP_INTERVIEW_EVAL_T
          const f = filters;
          if (
            f.search &&
            ![h.candidateName, h.intNo, h.positionName].some((v) =>
              v.toUpperCase().includes(term(f.search)),
            )
          ) {
            return false;
          }
          if (f.status && h.status.toUpperCase() !== f.status.toUpperCase()) return false;
          if (
            f.evaluationStatus &&
            evaluation.evalStatus.toUpperCase() !== f.evaluationStatus.toUpperCase()
          ) {
            return false;
          }
          if (f.requisitionNo && h.requisitionNo.toUpperCase() !== f.requisitionNo.toUpperCase()) {
            return false;
          }
          if (
            f.positionName &&
            !h.positionName.toUpperCase().includes(f.positionName.toUpperCase())
          )
            return false;
          if (f.division && h.division.toUpperCase() !== f.division.toUpperCase()) return false;
          if (f.interviewType && h.interviewType.toUpperCase() !== f.interviewType.toUpperCase()) {
            return false;
          }
          if (f.dateFrom && legacyToTime(h.interviewDate) < isoToTime(f.dateFrom)) return false;
          if (f.dateTo && legacyToTime(h.interviewDate) >= isoToTime(f.dateTo) + 86_400_000)
            return false;
          if (createdBy !== null && createdBy !== undefined && h.createdBy !== createdBy)
            return false;
          return true;
        })
        .sort((a, b) => {
          const [x, y] = [key(a), key(b)];
          if (x === y) return Number(a.headerId) - Number(b.headerId);
          if (x === null) return 1;
          if (y === null) return -1;
          return (x < y ? -1 : 1) * (sortDir === 'desc' ? -1 : 1);
        });
      return {
        total: items.length,
        items: items.slice(offset, offset + limit).map((h) => {
          const evaluation = evalOf(h.headerId);
          return {
            headerId: h.headerId,
            intNo: h.intNo,
            candidateName: h.candidateName,
            positionName: h.positionName,
            nationality: h.nationality,
            interviewDate: h.interviewDate,
            requisitionNo: h.requisitionNo,
            division: h.division,
            interviewType: h.interviewType,
            createdBy: h.createdBy,
            creationDate: day(h.createdAt),
            headerStatus: h.status,
            evaluationStatus: evaluation.evalStatus,
          };
        }),
      };
    },

    async isHrUser(_c, userId) {
      return store.state.hrUserIds.includes(userId);
    },
    async approvedRequisitionExists(_c, requisitionNo) {
      return store.state.requisitions.some(
        (r) => r.requisitionNumber === requisitionNo && r.requisitionStatus === 'Approved',
      );
    },

    async updateHeaderSection(_c, { headerId, updatedBy, ...fields }) {
      const h = headerOf(headerId);
      if (!h) return false;
      Object.assign(h, fields, { updatedAt: store.now(), updatedBy });
      return true;
    },
    async mergePersonalSpec(_c, { headerId, createdBy, updatedBy, ...fields }) {
      const row = specOf(headerId);
      if (row) Object.assign(row, fields, { updatedAt: store.now(), updatedBy });
      else table().personalSpecs.push({ headerId, createdBy, ...fields });
    },
    async updateHeaderPersonalTotals(
      _c,
      { headerId, personalSpecTotal, personalSpecResult, updatedBy },
    ) {
      const h = headerOf(headerId);
      Object.assign(h, {
        personalSpecTotal,
        personalSpecResult,
        updatedAt: store.now(),
        updatedBy,
      });
    },
    async mergeJobCompetency(_c, { headerId, createdBy, updatedBy, ...fields }) {
      const row = compOf(headerId);
      if (row) Object.assign(row, fields, { updatedAt: store.now(), updatedBy });
      else table().competencies.push({ headerId, createdBy, ...fields });
    },
    async updateHeaderCompetencyTotals(
      _c,
      { headerId, jobCompetencyTotal, jobCompetencyResult, updatedBy },
    ) {
      const h = headerOf(headerId);
      Object.assign(h, {
        jobCompetencyTotal,
        jobCompetencyResult,
        updatedAt: store.now(),
        updatedBy,
      });
    },
    async mergeEvaluation(_c, { headerId, createdBy, updatedBy, ...fields }) {
      const row = evalOf(headerId);
      if (row) Object.assign(row, fields, { updatedAt: store.now(), updatedBy });
      else table().evaluations.push({ headerId, createdBy, ...fields });
    },
    async updateHeaderMirror(
      _c,
      { headerId, evalInterviewedBy, interviewedBy2, interviewedBy3, attribute3, updatedBy },
    ) {
      const h = headerOf(headerId);
      Object.assign(h, {
        interviewedBy: evalInterviewedBy,
        interviewedBy2,
        interviewedBy3,
        attribute3,
        updatedAt: store.now(),
        updatedBy,
      });
    },

    async deleteAssessment(_c, headerId) {
      const t = table();
      t.evaluations = t.evaluations.filter((e) => e.headerId !== headerId);
      t.competencies = t.competencies.filter((j) => j.headerId !== headerId);
      t.personalSpecs = t.personalSpecs.filter((s) => s.headerId !== headerId);
      if (store.failures.interviewDelete) throw new Error('simulated header delete failure');
      const before = t.headers.length;
      t.headers = t.headers.filter((h) => h.headerId !== headerId);
      return before - t.headers.length;
    },

    async listNationalities() {
      return [...store.state.nationalities].sort();
    },
    async listApprovedRequisitions() {
      return store.state.requisitions
        .filter((r) => r.requisitionStatus === 'Approved')
        .sort((a, b) => b.requisitionNumber.localeCompare(a.requisitionNumber))
        .map((r) => ({ requisitionNumber: r.requisitionNumber, jobName: r.jobName }));
    },
    async listEmployeeNames() {
      return [...store.state.interviewEmployeeNames].sort();
    },
  };

  /**
   * Seeds a complete assessment (header + three children unless `children: false`) for
   * read/list/delete tests; values use the same normalized ('-'/0/'DD-Mon-YY') shapes the
   * service produces.
   */
  function seedAssessment({
    createdBy = store.state.users[0]?.userId ?? '100',
    status = 'Incomplete',
    evaluationStatus = 'Passed',
    candidateName = 'Test Candidate',
    positionName = 'Machine Operator',
    requisitionNo = 'REQ-1024',
    attribute3 = '300000003618177',
    interviewDate = '25-Oct-2026',
    division = 'Food',
    interviewType = 'Online',
    nationality = 'Saudi',
    children = true,
    headerId,
  } = {}) {
    const t = table();
    const id = headerId ?? String(t.nextHeaderId++);
    t.headers.push({
      headerId: id,
      uuid: `seed-uuid-${id}`,
      intNo: `${attribute3}-${id.padStart(3, '0')}`,
      candidateName,
      positionName,
      requisitionNo,
      attribute3,
      nationality,
      maritalStatus: '-',
      age: 0,
      interviewDate,
      interviewTime: '-',
      interviewType,
      secondaryEducation: '-',
      secondaryEducationChk: '-',
      lastPositionHeld: '-',
      companyName: '-',
      relevantYearsExperience: 0,
      location: '-',
      currentEmployer: '-',
      joining: null,
      major: '-',
      division,
      curSalBasic: null,
      expSalBasic: null,
      curSalTotal: null,
      expSalTotal: null,
      interviewedBy: '-',
      interviewedBy2: '-',
      interviewedBy3: '-',
      personalSpecTotal: children ? 8 : 0,
      personalSpecResult: '-',
      jobCompetencyTotal: children ? 6 : 0,
      jobCompetencyResult: '-',
      status,
      createdBy,
      createdAt: store.now(),
      updatedAt: null,
    });
    if (children) {
      t.personalSpecs.push({
        headerId: id,
        createdBy,
        rate1: '4',
        remark1: '-',
        rate2: '4',
        remark2: '-',
        rate3: '-',
        remark3: '-',
        rate4: '-',
        remark4: '-',
        rate5: '-',
        remark5: '-',
        rate6: '-',
        remark6: '-',
        rate7: '-',
        remark7: '-',
        rate8: '-',
        remark8: '-',
      });
      t.competencies.push({
        headerId: id,
        createdBy,
        cRating1: '2',
        cRemark1: '-',
        cRating2: '2',
        cRemark2: '-',
        cRating3: '2',
        cRemark3: '-',
        cRating4: '-',
        cRemark4: '-',
        cRating5: '-',
        cRemark5: '-',
        cRating6: '-',
        cRemark6: '-',
        sumStrength: '-',
        sumWeekness: '-',
      });
      t.evaluations.push({
        headerId: id,
        createdBy,
        evalStatus: evaluationStatus,
        evalInterviewedBy: '-',
        adminManager: '-',
        managningDirector: '-',
        hrRep: '-',
        comment: '-',
        deptRep: '-',
      });
    }
    return id;
  }

  store.interviewAssessmentRepository = interviewAssessmentRepository;
  store.seedAssessment = seedAssessment;
  return interviewAssessmentRepository;
}
