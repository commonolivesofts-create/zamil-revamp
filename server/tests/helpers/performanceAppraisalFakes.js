const clone = (value) => structuredClone(value);

export function installPerformanceAppraisals(store) {
  store.state.performanceAppraisals = {
    headers: [],
    ratings: [],
    development: [],
    training: [],
    employees: [],
    hrUsers: [],
    failAt: null,
  };
  const state = () => store.state.performanceAppraisals;
  const header = (id) => state().headers.find((x) => x.headerId === String(id));
  const repo = {
    async isHrUser(_c, userId) {
      return state().hrUsers.includes(String(userId));
    },
    async listAppraisals(_c, args) {
      let data = state().headers.filter((h) => Number(h.year) === Number(args.year));
      if (!args.isHr) data = data.filter((h) => h.createdBy === String(args.userId));
      if (args.noEmployee) data = [];
      if (args.filters.grade) data = data.filter((h) => h.result.grade === args.filters.grade);
      if (args.filters.status)
        data = data.filter((h) => h.status.toUpperCase() === args.filters.status.toUpperCase());
      if (args.filters.department)
        data = data.filter((h) => h.employee.department === args.filters.department);
      if (args.filters.search)
        data = data.filter((h) =>
          `${h.employee.name} ${h.employee.number} ${h.employee.jobTitle} ${h.employee.department}`
            .toUpperCase()
            .includes(args.filters.search.replaceAll('%', '').toUpperCase()),
        );
      const sortMap = {
        headerId: 'headerId',
        empName: 'employee.name',
        empNumber: 'employee.number',
        jobTitle: 'employee.jobTitle',
        grade: 'result.grade',
        rating: 'result.rating',
        year: 'year',
        creationDate: 'creationDate',
      };
      const pick = (obj, key) => key.split('.').reduce((v, part) => v?.[part], obj);
      data.sort(
        (a, b) =>
          String(pick(a, sortMap[args.sort])).localeCompare(String(pick(b, sortMap[args.sort]))) *
          (args.order === 'asc' ? 1 : -1),
      );
      return {
        total: data.length,
        items: data.slice(args.pageSize * (args.page - 1), args.pageSize * args.page).map((h) => ({
          headerId: h.headerId,
          empName: h.employee.name,
          empNumber: h.employee.number,
          jobTitle: h.employee.jobTitle,
          department: h.employee.department,
          rating: h.result.rating,
          grade: h.result.grade,
          description: h.result.description,
          status: h.status,
          year: h.year,
          creationDate: h.creationDate,
        })),
      };
    },
    async findHeader(_c, id) {
      const h = header(id);
      if (!h) return null;
      return {
        ...clone(h),
        criteria: state()
          .ratings.filter((x) => x.headerId === String(id))
          .sort((a, b) => a.id - b.id)
          .map((x) => ({
            id: String(x.id),
            name: x.name,
            rating: x.rating,
            justification: x.justification,
          })),
        development: state()
          .development.filter((x) => x.headerId === String(id))
          .map((x) => ({ id: String(x.id), need: x.need })),
        training: state()
          .training.filter((x) => x.headerId === String(id))
          .map((x) => ({ id: String(x.id), objective: x.objective })),
      };
    },
    async findStatus(_c, id) {
      return header(id)?.status ?? null;
    },
    async hasDuplicate(_c, number, year) {
      return state().headers.some(
        (h) =>
          String(h.employee.number) === String(number) &&
          Number(h.year) === Number(year) &&
          h.status !== 'Rejected',
      );
    },
    async findEmployee(_c, name) {
      return clone(state().employees.find((e) => e.name === name) ?? null);
    },
    async findHeaderIdByUuid(_c, uuid) {
      return state().headers.find((h) => h.uuid === uuid)?.headerId ?? null;
    },
    async insertHeader(_c, x) {
      const id = String(Math.max(0, ...state().headers.map((h) => Number(h.headerId))) + 1);
      state().headers.push({
        headerId: id,
        uuid: x.uuid,
        employee: {
          personId: x.personId,
          name: x.empName,
          number: x.empNumber,
          hireDate: x.hireDate,
          jobId: x.jobId,
          jobTitle: x.jobTitle,
          departmentId: x.departmentId,
          department: x.department,
        },
        period: { year: x.year, from: x.periodFrom, to: x.periodTo },
        appraiser: {
          evaluatedBy: x.evaluatedBy,
          yearsInCompany: x.yearsInCompany,
          yearsInPosition: x.yearsInPosition,
        },
        result: { rating: x.rating, grade: x.grade, description: x.description },
        remarks: { employee: x.employeeRemarks, appraiser: x.appraiserRemarks },
        year: x.year,
        status: 'Inprocess',
        formLanguage: x.formLanguage,
        createdBy: String(x.createdBy),
        creationDate: '2026-10-29',
      });
      if (state().failAt === 'header') throw new Error('injected header failure');
    },
    async insertRating(_c, x) {
      state().ratings.push({ ...x, headerId: String(x.headerId) });
      if (state().failAt === 'rating') throw new Error('injected rating failure');
    },
    async insertDevelopment(_c, x) {
      state().development.push({ ...x, headerId: String(x.headerId) });
      if (state().failAt === 'development') throw new Error('injected development failure');
    },
    async insertTraining(_c, x) {
      state().training.push({ ...x, headerId: String(x.headerId) });
      if (state().failAt === 'training') throw new Error('injected training failure');
    },
    async updateHeader(_c, x) {
      const h = header(x.headerId);
      if (!h) return false;
      Object.assign(h.result, { rating: x.rating, grade: x.grade, description: x.description });
      Object.assign(h.remarks, { employee: x.employeeRemarks, appraiser: x.appraiserRemarks });
      if (state().failAt === 'updateHeader') throw new Error('injected update failure');
      return true;
    },
    async updateRating(_c, x) {
      const line = state().ratings.find((r) => r.headerId === String(x.headerId) && r.id === x.id);
      if (!line) return false;
      line.rating = x.rating;
      line.justification = x.justification;
      if (state().failAt === 'updateRating') throw new Error('injected update failure');
      return true;
    },
    async updateDevelopment(_c, x) {
      const line = state().development.find(
        (r) => r.headerId === String(x.headerId) && r.id === x.id,
      );
      if (!line) return false;
      line.need = x.need;
      return true;
    },
    async updateTraining(_c, x) {
      const line = state().training.find((r) => r.headerId === String(x.headerId) && r.id === x.id);
      if (!line) return false;
      line.objective = x.objective;
      return true;
    },
    async updateEmployeeRemarks(_c, x) {
      const h = header(x.headerId);
      if (!h) return false;
      h.remarks.employee = x.remarks;
      return true;
    },
    async deleteAppraisal(_c, id) {
      if (!header(id)) return false;
      for (const k of ['ratings', 'development', 'training'])
        state()[k] = state()[k].filter((x) => x.headerId !== String(id));
      state().headers = state().headers.filter((x) => x.headerId !== String(id));
      if (state().failAt === 'delete') throw new Error('injected delete failure');
      return true;
    },
    async listEmployees() {
      return state().employees.map((e) => ({
        HIERARCHY_LEVEL: 2,
        USER_ID: e.userId,
        FULL_NAME: e.name,
        EMPLOYEE_NUMBER: e.number,
      }));
    },
    async findRequestor(_c, userId) {
      const person = store.state.employees.find(
        (e) =>
          e.employeeNumber ===
          store.state.users.find((u) => u.userId === String(userId))?.employeeNumber,
      );
      return person
        ? {
            fullName: person.fullName,
            emailAddress: person.email,
            employeeNumber: person.employeeNumber,
          }
        : null;
    },
    async gradeStats(_c, _userId, totalEmployees) {
      return { totalEmployees, allocated: { A: 0, B: 1, C: 2, D: 0, E: 1 } };
    },
  };
  state().employees.push({
    personId: '9001',
    name: 'Jordan Example',
    number: '9001',
    hireDate: '2020-01-02',
    jobId: '5',
    jobTitle: 'Analyst',
    departmentId: '7',
    department: 'Finance Section',
    evaluatedBy: 'Hana Example',
    yearsInCompany: 6,
    yearsInPosition: 3,
    userId: '9001',
  });
  store.performanceAppraisalRepository = repo;
  return repo;
}
