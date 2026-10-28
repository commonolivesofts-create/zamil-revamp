const copy = (value) => structuredClone(value);

export function installOrientationTrainings(store, { hrUserIds = [] } = {}) {
  store.state.orientationTrainings = {
    headers: { Y: [], N: [] },
    lines: { Y: [], N: [] },
    flags: [],
  };
  store.state.orientationHrUserIds = [...hrUserIds];
  store.failures.orientation = {};
  const state = () => store.state.orientationTrainings;
  const flagFor = (headerId) => state().flags.find((item) => item.headerId === headerId);
  const headerFor = (variant, headerId) =>
    state().headers[variant].find((item) => item.headerId === headerId);

  const repository = {
    TABLES: {
      Y: { tableName: 'SHARED' },
      N: { tableName: 'PRODUCTION' },
    },
    async resolveFlag(_connection, empNo) {
      if (empNo === 'MISSING') return null;
      return empNo.endsWith('Y') ? 'Y' : 'N';
    },
    async findEmployee(_connection, empNo) {
      if (empNo === 'MISSING') return null;
      return {
        empNo,
        section: 'Manufacturing',
        division: 'Production',
        empname: `Employee ${empNo}`,
        personId: '7001',
        empType: 'Employee',
        position: 'Technician',
        startDate: '2026-01-01',
      };
    },
    async findActorName(_connection, userId) {
      return store.state.users.find((user) => user.userId === userId)?.fullName ?? 'Test Actor';
    },
    async generateHeaderId(_connection, table) {
      const variant = table.tableName === 'SHARED' ? 'Y' : 'N';
      return String(
        state().headers[variant].reduce((max, item) => Math.max(max, Number(item.headerId)), 0) + 1,
      );
    },
    async insertHeader(_connection, table, input) {
      const variant = table.tableName === 'SHARED' ? 'Y' : 'N';
      const headerId = String(state().headers[variant].length + 1);
      state().headers[variant].push({ ...input, headerId, status: 'Draft', reference: null });
      if (store.failures.orientation.insertHeader) throw new Error('injected header failure');
    },
    async findHeaderIdByUuid(_connection, table, uuid) {
      const variant = table.tableName === 'SHARED' ? 'Y' : 'N';
      return state().headers[variant].find((item) => item.uuid === uuid)?.headerId ?? null;
    },
    async setReference(_connection, table, headerId, division) {
      const variant = table.tableName === 'SHARED' ? 'Y' : 'N';
      const header = headerFor(variant, headerId);
      header.reference = `${division}/26/${String(headerId).padStart(3, '0')}`;
      return header.reference;
    },
    async registerFlag(_connection, headerId, tableName) {
      state().flags.push({ headerId, tableName });
      if (store.failures.orientation.insertFlag) throw new Error('injected flag failure');
    },
    async generateLineId(_connection, table, headerId) {
      const variant = table.tableName === 'SHARED' ? 'Y' : 'N';
      return String(state().lines[variant].filter((item) => item.headerId === headerId).length + 1);
    },
    async insertLine(_connection, table, input) {
      const variant = table.tableName === 'SHARED' ? 'Y' : 'N';
      state().lines[variant].push({ ...input });
      if (store.failures.orientation.insertLine) throw new Error('injected line failure');
    },
    async findTableName(_connection, headerId) {
      return flagFor(headerId)?.tableName ?? null;
    },
    async findHeader(_connection, table, headerId) {
      const variant = table.tableName === 'SHARED' ? 'Y' : 'N';
      const header = headerFor(variant, headerId);
      return header ? copy(header) : null;
    },
    async listLines(_connection, table, headerId) {
      const variant = table.tableName === 'SHARED' ? 'Y' : 'N';
      return copy(state().lines[variant].filter((line) => line.headerId === headerId));
    },
    async findStatus(_connection, table, headerId) {
      const variant = table.tableName === 'SHARED' ? 'Y' : 'N';
      return headerFor(variant, headerId)?.status ?? null;
    },
    async updateHeader(_connection, table, input) {
      const variant = table.tableName === 'SHARED' ? 'Y' : 'N';
      const header = headerFor(variant, input.headerId);
      if (!header) return false;
      Object.assign(header, input);
      if (store.failures.orientation.updateHeader) throw new Error('injected update failure');
      return true;
    },
    async deleteLines(_connection, table, headerId) {
      const variant = table.tableName === 'SHARED' ? 'Y' : 'N';
      state().lines[variant] = state().lines[variant].filter((line) => line.headerId !== headerId);
      if (store.failures.orientation.deleteLines) throw new Error('injected line delete failure');
    },
    async deleteFlag(_connection, headerId) {
      state().flags = state().flags.filter((item) => item.headerId !== headerId);
    },
    async deleteHeader(_connection, table, headerId) {
      const variant = table.tableName === 'SHARED' ? 'Y' : 'N';
      const previous = state().headers[variant].length;
      state().headers[variant] = state().headers[variant].filter(
        (item) => item.headerId !== headerId,
      );
      if (store.failures.orientation.deleteHeader)
        throw new Error('injected header delete failure');
      return previous !== state().headers[variant].length;
    },
    async deleteLine(_connection, table, headerId, lineId) {
      const variant = table.tableName === 'SHARED' ? 'Y' : 'N';
      const previous = state().lines[variant].length;
      state().lines[variant] = state().lines[variant].filter(
        (line) => line.headerId !== headerId || line.lineId !== lineId,
      );
      return previous !== state().lines[variant].length;
    },
    async isHrUser(_connection, userId) {
      return store.state.orientationHrUserIds.includes(userId);
    },
    async listTrainings(_connection, table, query) {
      const variant = table.tableName === 'SHARED' ? 'Y' : 'N';
      const matches = state().headers[variant].filter((header) => {
        if (query.createdBy !== null && header.createdBy !== query.createdBy) return false;
        if (query.filters.status && header.status !== query.filters.status) return false;
        if (query.filters.empNo && header.empNo !== query.filters.empNo) return false;
        if (query.filters.empType && header.empType !== query.filters.empType) return false;
        if (
          query.filters.search &&
          !`${header.empname} ${header.section} ${header.division}`
            .toUpperCase()
            .includes(query.filters.search.replaceAll('%', '').toUpperCase())
        )
          return false;
        return true;
      });
      return {
        total: matches.length,
        items: copy(matches.slice(query.offset, query.offset + query.limit)),
      };
    },
    async listEmployees() {
      return [];
    },
    async listManagers() {
      return [{ empNo: 'M-100', fullName: 'Manager Example' }];
    },
  };

  store.orientationTrainingRepository = repository;
  store.seedOrientationTraining = ({ header = {}, lines = [], flag = 'Y' } = {}) => {
    const headerId = String(header.headerId ?? state().headers[flag].length + 1);
    const tableName = flag === 'Y' ? 'SHARED' : 'PRODUCTION';
    state().headers[flag].push({
      headerId,
      empNo: 'E-100Y',
      section: 'Manufacturing',
      empname: 'Employee E-100Y',
      fromOrient: '25-Oct-2026',
      toOrient: '30-Oct-2026',
      startDate: '01-Oct-2026',
      orientationBy: 'Test Actor',
      createdBy: '100',
      status: 'Draft',
      reference: `Production/26/${headerId.padStart(3, '0')}`,
      ...header,
    });
    state().flags.push({ headerId, tableName });
    for (const [index, line] of lines.entries()) {
      state().lines[flag].push({
        headerId,
        lineId: String(index + 1),
        department: 'Safety',
        ...line,
      });
    }
    return headerId;
  };
}
