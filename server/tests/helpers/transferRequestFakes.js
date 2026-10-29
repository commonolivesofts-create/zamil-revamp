export function installTransferRequests(store, { hrUserIds = [] } = {}) {
  store.state.transferRequests = [];
  store.state.transferHrUserIds = hrUserIds;
  store.failures.transferRequests = {};
  const state = () => store.state.transferRequests;
  const repository = {
    async listEmployeeNames() {
      return [{ name: 'Employee Example' }];
    },
    async findEmployeeDetails(_c, name) {
      return name === 'Employee Example'
        ? {
            empNo: '4321',
            personId: '123',
            dateOfJoining: null,
            jobTitle: 'Operator',
            deptName: 'Production Section',
          }
        : null;
    },
    async listJobs() {
      return [{ name: 'Senior Operator' }];
    },
    async listSections() {
      return [{ name: 'Maintenance Section' }];
    },
    async listDirectors() {
      return [{ name: 'Manager Example', empNo: '2280' }];
    },
    async listBloodTypes() {
      return [{ code: 'O+' }];
    },
    async findRequestor() {
      return [{ empNo: '88', fullName: 'Requester Example', email: 'requester@example.invalid' }];
    },
    async isHrUser(_c, userId) {
      return store.state.transferHrUserIds.includes(userId);
    },
    async insertRequest(_c, input) {
      const headerId = String(state().length + 1);
      state().push({
        ...structuredClone(input),
        headerId,
        status: 'Draft',
        approvals: {
          transferDeptHead: 'Draft',
          adminSignature: 'Draft',
          president: 'Draft',
          hrManager: 'Draft',
          generalManager: 'Draft',
        },
      });
      if (store.failures.transferRequests.insert) throw new Error('injected insert failure');
      return headerId;
    },
    async listRequests(_c, input) {
      let result = state().filter((r) => input.isHr || r.createdBy === input.userId);
      const f = input.filters;
      if (f.search) {
        const needle = f.search.toLowerCase();
        result = result.filter((r) =>
          [r.requestedBy, r.cEmpName, r.cEmpNo, r.tJobTitle].some((value) =>
            String(value ?? '')
              .toLowerCase()
              .includes(needle),
          ),
        );
      }
      if (f.status)
        result = result.filter((r) => r.status.toLowerCase() === f.status.toLowerCase());
      if (f.plant) result = result.filter((r) => r.plant === f.plant);
      if (f.transferDept) result = result.filter((r) => r.tDept === f.transferDept);
      if (f.currentDept) result = result.filter((r) => r.cDept === f.currentDept);
      if (f.jobTitle) result = result.filter((r) => r.tJobTitle === f.jobTitle);
      if (f.date_from) result = result.filter((r) => r.mgrDate >= f.date_from);
      if (f.date_to) result = result.filter((r) => r.mgrDate <= f.date_to);
      const total = result.length;
      result = result.slice((input.page - 1) * input.pageSize, input.page * input.pageSize);
      return {
        total,
        rows: result.map((r) => ({ headerId: r.headerId, plant: r.plant, status: r.status })),
      };
    },
    async findRequest(_c, id) {
      return state().find((r) => r.headerId === id) ?? null;
    },
    async findStatusForUpdate(_c, id) {
      const r = state().find((x) => x.headerId === id);
      return r ? { status: r.status, requestedBy: r.requestedBy } : null;
    },
    async updateRequest(_c, input) {
      const r = state().find((x) => x.headerId === input.headerId);
      if (!r) return false;
      Object.assign(r, structuredClone(input));
      if (store.failures.transferRequests.update) throw new Error('injected update failure');
      return true;
    },
    async deleteRequest(_c, id) {
      const before = state().length;
      store.state.transferRequests = state().filter((x) => x.headerId !== id);
      if (store.failures.transferRequests.delete) throw new Error('injected delete failure');
      return store.state.transferRequests.length !== before;
    },
  };
  store.transferRequestRepository = repository;
}
