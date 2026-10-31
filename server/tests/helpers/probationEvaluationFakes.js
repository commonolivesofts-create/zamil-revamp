const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const legacyDate = (value) => {
  if (!value) return '01-JAN-00';
  const [year, month, day] = value.split('-');
  return `${day}-${MONTHS[Number(month) - 1]}-${year}`;
};
const isoDate = (value) => {
  if (!value || value === '01-JAN-00') return null;
  const [, day, month, year] = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(value);
  return `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, '0')}-${day}`;
};

// `departments` maps employee numbers to an ORGANIZATION_ID for the same-department rule.
export function installProbationEvaluations(
  store,
  { hrEmployeeNumbers = [], departments = {} } = {},
) {
  store.state.probationEvaluations = { headers: [], lines: [] };
  store.state.probationHrEmployeeNumbers = [...hrEmployeeNumbers];
  store.state.probationDepartments = { ...departments };
  const table = () => store.state.probationEvaluations;
  const headerOf = (headerId) => table().headers.find((header) => header.headerId === headerId);
  const linesOf = (headerId) => table().lines.filter((line) => line.headerId === headerId);
  const requestorFor = (userId) => {
    const user = store.state.users.find((item) => item.userId === userId);
    const employee =
      user && store.state.employees.find((item) => item.employeeNumber === user.employeeNumber);
    return employee
      ? {
          fullName: employee.fullName,
          emailAddress: employee.email,
          employeeNumber: employee.employeeNumber,
        }
      : null;
  };
  const matches = (header, filters) => {
    if (filters.search) {
      const haystack = [
        header.employeeName,
        header.employeeNumber,
        header.jobTitle,
        header.department,
      ]
        .join(' ')
        .toUpperCase();
      const query = filters.search.replaceAll('%', '').replaceAll('_', '').toUpperCase();
      if (!haystack.includes(query)) return false;
    }
    if (filters.requestStatus && header.requestStatus !== filters.requestStatus) return false;
    if (filters.formType && header.formType !== filters.formType) return false;
    if (filters.empNumber && header.employeeNumber !== filters.empNumber) return false;
    if (filters.department && header.department?.toUpperCase() !== filters.department.toUpperCase())
      return false;
    if (filters.dateFrom && header.createdDate < filters.dateFrom) return false;
    if (filters.dateTo && header.createdDate > filters.dateTo) return false;
    return true;
  };

  const repository = {
    async generateHeaderId() {
      const next =
        table().headers.reduce((max, header) => Math.max(max, Number(header.headerId)), 0) + 1;
      return String(next);
    },
    async findHeaderIdByUuid(_connection, uuid) {
      return table().headers.find((header) => header.uuid === uuid)?.headerId ?? null;
    },
    async findRequestor(_connection, userId) {
      return requestorFor(userId);
    },
    async insertHeader(_connection, input) {
      const headerId = String(
        table().headers.reduce((max, header) => Math.max(max, Number(header.headerId)), 0) + 1,
      );
      table().headers.push({
        ...input,
        headerId,
        createdDate: '2026-10-19',
        createdAt: '19-Oct-26',
        requestStatus: 'DRAFT',
      });
      if (store.failures.probationInsertAfterHeader) throw new Error('injected insert failure');
    },
    async generateLineId(_connection, headerId) {
      const next =
        linesOf(headerId).reduce((max, line) => Math.max(max, Number(line.lineId)), 0) + 1;
      return String(next);
    },
    async insertLine(_connection, input) {
      table().lines.push({ ...input });
      if (store.failures.probationInsertAfterLine) throw new Error('injected line failure');
    },
    async findHeader(_connection, headerId) {
      const header = headerOf(headerId);
      if (!header) return null;
      return {
        headerId: header.headerId,
        uuid: header.uuid,
        formDate: isoDate(header.formDate),
        employeeName: header.employeeName,
        employeeNumber: header.employeeNumber,
        empId: header.empId,
        grade: header.grade,
        evaluationPeriod: header.evaluationPeriod,
        formType: header.formType,
        totalRating: header.totalRating,
        comment: header.comment,
        comments: header.comments,
        jobTitle: header.jobTitle,
        department: header.department,
        fromDate: isoDate(header.fromDate),
        toDate: isoDate(header.toDate),
        requestStatus: header.requestStatus,
        createdAt: header.createdAt,
      };
    },
    async listLines(_connection, headerId) {
      return linesOf(headerId)
        .slice()
        .sort((a, b) => Number(a.lineId) - Number(b.lineId))
        .map((line) => ({ ...line }));
    },
    async findAccessFacts(_connection, headerId) {
      const header = headerOf(headerId);
      return header
        ? {
            createdBy: header.createdBy,
            requestStatus: header.requestStatus,
            employeeNumber: header.employeeNumber,
          }
        : null;
    },
    async isSameDepartment(_connection, { actorEmployeeNumber, subjectEmployeeNumber }) {
      const departments = store.state.probationDepartments;
      return (
        departments[actorEmployeeNumber] !== undefined &&
        departments[actorEmployeeNumber] === departments[subjectEmployeeNumber]
      );
    },
    async updateHeader(_connection, input) {
      const header = headerOf(input.headerId);
      if (!header) return false;
      // Mirrors UPDATED_AT = SYSDATE.
      Object.assign(header, { ...input, updatedAt: 'SYSDATE' });
      if (store.failures.probationUpdateAfterHeader) throw new Error('injected update failure');
      return true;
    },
    async updateLine(_connection, input) {
      const line = linesOf(input.headerId).find((item) => item.lineId === input.lineId);
      if (!line) return false;
      Object.assign(line, input);
      if (store.failures.probationUpdateAfterLine) throw new Error('injected line update failure');
      return true;
    },
    async deleteEvaluation(_connection, headerId) {
      table().lines = table().lines.filter((line) => line.headerId !== headerId);
      if (store.failures.probationDeleteAfterLines) throw new Error('injected delete failure');
      const before = table().headers.length;
      table().headers = table().headers.filter((header) => header.headerId !== headerId);
      return before - table().headers.length;
    },
    async isHrUser(_connection, employeeNumber) {
      return store.state.probationHrEmployeeNumbers.includes(employeeNumber);
    },
    async listEvaluations(_connection, { limit, offset, filters, createdBy, sortBy, sortDir }) {
      const rows = table()
        .headers.filter((header) => createdBy === null || header.createdBy === createdBy)
        .filter((header) => matches(header, filters))
        .sort((a, b) => {
          const field = {
            HEADER_ID: 'headerId',
            CREATED_AT: 'createdDate',
            EMP_NAME: 'employeeName',
            TOTAL_RATING: 'totalRating',
          }[sortBy];
          const compared = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
          return (
            (sortDir === 'desc' ? -compared : compared) || Number(a.headerId) - Number(b.headerId)
          );
        });
      return {
        total: rows.length,
        items: rows.slice(offset, offset + limit).map((header) => ({
          headerId: header.headerId,
          formDate: isoDate(header.formDate),
          employeeName: header.employeeName,
          employeeNumber: header.employeeNumber,
          jobTitle: header.jobTitle,
          department: header.department,
          formType: header.formType,
          totalRating: header.totalRating,
          requestStatus: header.requestStatus,
          createdAt: header.createdAt,
          createdBy: header.createdBy,
        })),
      };
    },
    async listEmployees(_connection, userId) {
      const user = store.state.users.find((item) => item.userId === userId);
      const employee =
        user && store.state.employees.find((item) => item.employeeNumber === user.employeeNumber);
      return employee ? [{ hierarchyLevel: 2, userId, fullName: employee.fullName }] : [];
    },
    async findEmployeeDetails(_connection, { empName, userId }) {
      const employee = store.state.employees.find((item) => item.fullName === empName);
      if (!employee) return null;
      const requestor = requestorFor(userId);
      return {
        ids: { personId: '7001', employeeNumber: employee.employeeNumber },
        hire: { startDate: new Date('2020-01-01T00:00:00Z') },
        job: { name: employee.jobTitle, jobId: '71' },
        dept: { organizationId: '32', name: employee.department },
        sup: requestor ? { fullName: requestor.fullName, personId: '7002' } : null,
        pos_year_detail: { year: 1 },
      };
    },
  };

  store.probationEvaluationRepository = repository;
  store.seedProbationEvaluation = (header = {}, lines = []) => {
    const headerId = String(header.headerId ?? table().headers.length + 1);
    table().headers.push({
      uuid: `test-${headerId}`,
      formDate: legacyDate('2026-10-01'),
      employeeName: 'Test Employee',
      employeeNumber: 'T-1001',
      empId: 'P-1001',
      grade: 1,
      evaluationPeriod: 'Test period',
      formType: 'Engineers_Staff',
      totalRating: 4,
      comment: '-',
      comments: '-',
      jobTitle: 'Engineer',
      department: 'Engineering',
      fromDate: legacyDate('2026-01-01'),
      toDate: legacyDate('2026-09-30'),
      requestStatus: 'DRAFT',
      createdBy: '100',
      createdDate: '2026-10-19',
      createdAt: '19-Oct-26',
      ...header,
      headerId,
    });
    for (const [index, line] of lines.entries()) {
      table().lines.push({
        headerId,
        lineId: String(index + 1),
        rating: 4,
        param: 'Quality',
        paramAr: '-',
        ...line,
      });
    }
    return headerId;
  };
}
