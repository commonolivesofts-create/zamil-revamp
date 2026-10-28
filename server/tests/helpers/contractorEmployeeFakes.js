const copy = (value) => structuredClone(value);

export function installContractorEmployees(store) {
  store.state.contractorEmployees = {
    employees: [],
    contractors: [
      { conId: '71', conNumber: '88', conName: 'Contractor Example', status: 'Active', rate: 15 },
    ],
    jobs: [{ jobId: '40', jobTitle: 'Operator' }],
    bosses: [{ personId: '50', fullName: 'Boss Example' }],
  };
  store.failures.contractorEmployees = {};
  const state = () => store.state.contractorEmployees;
  const maybeFail = (name) => {
    if (store.failures.contractorEmployees[name]) throw new Error(`injected ${name} failure`);
  };
  const repo = {
    async listEmployees(_c, { filters, limit, offset, sort, order }) {
      let rows = state().employees.filter(
        (e) =>
          (!filters.division || e.division === filters.division) &&
          (!filters.department || e.department === filters.department) &&
          (!filters.status || e.status === filters.status) &&
          (!filters.contractorNumber || e.con_number === filters.contractorNumber) &&
          (!filters.dateFrom || e.start_date >= filters.dateFrom) &&
          (!filters.dateTo || !e.end_date || e.end_date <= filters.dateTo),
      );
      rows = rows.sort(
        (a, b) =>
          String(a[sort] ?? '').localeCompare(String(b[sort] ?? '')) *
            (order === 'desc' ? -1 : 1) || Number(a.emp_id) - Number(b.emp_id),
      );
      return { items: copy(rows.slice(offset, offset + limit)), total: rows.length };
    },
    async findEmployee(_c, empId) {
      return copy(state().employees.find((e) => e.emp_id === String(empId)) ?? null);
    },
    async deleteEmployee(_c, empId) {
      const before = state().employees.length;
      state().employees = state().employees.filter((e) => e.emp_id !== String(empId));
      maybeFail('delete');
      return before !== state().employees.length;
    },
    async lockContractor(_c, number) {
      return copy(state().contractors.find((c) => c.conNumber === String(number)) ?? null);
    },
    async findContractor(_c, number) {
      return copy(state().contractors.find((c) => c.conNumber === String(number)) ?? null);
    },
    async findJob(_c, id) {
      return copy(state().jobs.find((j) => j.jobId === String(id)) ?? null);
    },
    async findBoss(_c, id) {
      return copy(state().bosses.find((b) => b.personId === String(id)) ?? null);
    },
    async generateEmployeeId() {
      return String(Math.max(0, ...state().employees.map((e) => Number(e.emp_id))) + 1);
    },
    async generateEmployeeNumber(_c, number) {
      return String(
        Math.max(
          Number(number) - 1,
          ...state()
            .employees.filter((e) => e.con_number === String(number))
            .map((e) => Number(e.employee_number)),
        ) + 1,
      );
    },
    async insertEmployee(_c, input) {
      state().employees.push({
        emp_id: String(input.empId),
        employee_number: String(input.employeeNumber),
        employee_name: input.employeeName,
        division: input.division,
        iqamah: input.iqamah,
        department: input.department,
        prod_dep: input.prodDep,
        direct_boss: input.directBoss,
        direct_boss_id: String(input.directBossId),
        job: String(input.job),
        job_title: input.jobTitle,
        place: input.place,
        replacement: input.replacement,
        rate: input.rate,
        start_date: input.startDate,
        end_date: input.endDate,
        status: input.status,
        ajeer: input.ajeer === 'on',
        sfda: input.sfda === 'on',
        blacklist: input.blacklist === 'on',
        remark: input.remark,
        con_number: String(input.conNumber),
        con_name: input.conName,
        created_by: String(input.createdBy),
        creation_date: '2026-10-28T00:00:00Z',
      });
      maybeFail('insert');
    },
    async updateEmployee(_c, input) {
      const row = state().employees.find((e) => e.emp_id === String(input.empId));
      if (!row) return false;
      Object.assign(row, {
        employee_name: input.employeeName,
        division: input.division,
        iqamah: input.iqamah,
        department: input.department,
        prod_dep: input.prodDep,
        direct_boss: input.directBoss,
        direct_boss_id: String(input.directBossId),
        job: String(input.job),
        job_title: input.jobTitle,
        place: input.place,
        replacement: input.replacement,
        rate: input.rate,
        start_date: input.startDate,
        end_date: input.endDate,
        status: input.status,
        ajeer: input.ajeer === 'on',
        sfda: input.sfda === 'on',
        blacklist: input.blacklist === 'on',
        remark: input.remark,
        con_number: String(input.conNumber),
        con_name: input.conName,
        updated_by: String(input.updatedBy),
      });
      maybeFail('update');
      return true;
    },
    async listDivisions() {
      return [
        { value: '300000003618177', label: 'IPP BU' },
        { value: '300000003618190', label: 'FPP BU' },
      ];
    },
    async listDepartments() {
      return [
        { value: 'ALL', label: 'ALL' },
        { value: 'QC', label: 'QC' },
      ];
    },
    async listContractors() {
      return [{ value: '88', label: 'Contractor Example' }];
    },
    async listJobs() {
      return [{ value: '40', label: 'Operator' }];
    },
    async listBosses() {
      return [{ value: '50', label: 'Boss Example' }];
    },
    async listSections() {
      return [{ value: '900', label: 'Section Example' }];
    },
  };
  store.contractorEmployeeRepository = repo;
  return repo;
}
