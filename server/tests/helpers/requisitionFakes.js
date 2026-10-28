/*
 * In-memory double of requisition.repository.js over an auth store's `state` (so transactions
 * snapshot/rollback it too). It mirrors the SQL semantics the service relies on: max+20 header
 * keys with the 100000 fallback, 'Draft' insert with the corrected ATTRIBUTE14/15 ticket dates,
 * the §7.1 filters/sort/pagination, the §7.4 HR + recursive-supervisor scope, the corrected
 * non-wiping update, the attachment rows keyed by FORM_HEADER_ID, the §6 delete guards and the
 * §8 lookups. It does NOT prove the SQL; it proves the wiring of routes/controllers/service and
 * the transaction boundaries.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parses the stored 'DD-Mon-YY' date; mirrors TO_DATE semantics (no timezone involved). */
const legacyToTime = (value) => {
  if (!value) return null;
  const [, day, month, year] = /^(\d{2})-([A-Za-z]{3})-(\d{2,4})$/.exec(value);
  const fullYear = year.length === 2 ? Number(year) + 2000 : Number(year);
  return Date.UTC(fullYear, MONTHS.indexOf(month), Number(day));
};
const isoToTime = (value) => (value ? Date.parse(`${value}T00:00:00Z`) : null);

/** The stored legacy date form of an instant ('25-Oct-26'), like TO_CHAR(SYSDATE,'DD-Mon-YY'). */
const legacyDay = (date) =>
  `${String(date.getUTCDate()).padStart(2, '0')}-${MONTHS[date.getUTCMonth()]}-${String(
    date.getUTCFullYear(),
  ).slice(2)}`;

const likeTerm = (pattern) =>
  pattern
    .slice(1, -1)
    .replace(/\\([\\%_])/g, '$1')
    .toUpperCase();

export function installRequisitions(
  store,
  { hrUserIds = [], empMaster = [], deptMaster = [], interviewReferenceNumbers = [] } = {},
) {
  store.state.requisitionForm = { nextAttachmentId: 1, headers: [], attachments: [] };
  store.state.hrUserIds = [...hrUserIds];
  store.state.empMaster = empMaster.map((employee) => ({ ...employee }));
  store.state.deptMaster = deptMaster.map((dept) => ({ ...dept }));
  store.state.interviewReferenceNumbers = [...interviewReferenceNumbers];

  const table = () => store.state.requisitionForm; // re-read: a rollback replaces the object
  const headerOf = (requisitionId) =>
    table().headers.find((h) => h.requisitionId === requisitionId);

  // §7.4: the actor plus everyone reachable through SUPERVISOR_NAME chains (recursive CTE).
  const supervisedIds = (scopeUserId) => {
    const employees = store.state.empMaster;
    const self = employees.find((employee) => String(employee.userId) === String(scopeUserId));
    const names = new Set(self ? [self.fullName] : []);
    let grew = true;
    while (grew) {
      grew = false;
      for (const employee of employees) {
        if (
          employee.supervisorName &&
          names.has(employee.supervisorName) &&
          !names.has(employee.fullName)
        ) {
          names.add(employee.fullName);
          grew = true;
        }
      }
    }
    const ids = employees
      .filter((employee) => names.has(employee.fullName))
      .map((e) => String(e.userId));
    if (self) return ids;
    return [...ids, String(scopeUserId)]; // no employee-master row: only their own CREATED_BY
  };

  const toReadHeader = (h) => ({
    requisitionId: h.requisitionId,
    requisitionNumber: h.requisitionNumber,
    requisitionStatus: h.requisitionStatus,
    requestedBy: h.requestedBy,
    requesterName: h.requesterName,
    requestDate: h.requestDate,
    jobId: h.jobId,
    jobName: h.jobName,
    deptId: h.deptId,
    deptName: h.deptName,
    dateNeeded: h.dateNeeded,
    reasonOfReq: h.reasonOfReq,
    replacementFor: h.replacementFor,
    reason: h.reason,
    budgeted: h.budgeted,
    budgetedSal: h.budgetedSal,
    highSchool: h.highSchool,
    diploma: h.diploma,
    higherDiploma: h.higherDiploma,
    degree: h.degree,
    masterDegree: h.masterDegree,
    gccExp: h.gccExp,
    workExp: h.workExp,
    skills: h.skills,
    other: h.other,
    remark: h.remark,
    totalPackage: h.totalPackage,
    ticketStatus: h.ticketStatus ?? '',
    acceptedDate: h.acceptedDate,
    closedDate: h.closedDate,
    createdBy: h.createdBy,
    createdAt: h.createdAt,
    updatedBy: h.updatedBy,
    updatedAt: h.updatedAt,
  });

  const attachmentRows = (requisitionId) =>
    table()
      .attachments.filter((a) => a.requisitionId === requisitionId)
      .sort((a, b) => Number(a.attachmentId) - Number(b.attachmentId))
      .map((a) => ({ ...a }));

  const requisitionRepository = {
    async generateRequisitionId() {
      const ids = table().headers.map((h) => Number(h.requisitionId));
      return String(ids.length ? Math.max(...ids) + 20 : 100000);
    },
    async insertHeader(_c, h) {
      const ticket = h.ticketStatus || null;
      table().headers.push({
        ...h,
        requisitionId: h.reqId,
        requisitionNumber: h.reqId,
        requisitionStatus: 'Draft', // README §11: the only status this API ever writes
        ticketStatus: ticket,
        acceptedDate: ticket === 'Accepted' ? legacyDay(store.now()) : null,
        closedDate: ticket === 'Close' ? legacyDay(store.now()) : null,
        createdBy: h.createdBy,
        createdAt: store.now(),
        updatedBy: null,
        updatedAt: null,
      });
    },

    async findHeader(_c, requisitionId) {
      const h = headerOf(requisitionId);
      return h ? toReadHeader(h) : null;
    },

    async updateHeader(_c, { requisitionId, values, ticket, updatedBy }) {
      const h = headerOf(requisitionId);
      if (!h) return false;
      Object.assign(h, values);
      if (ticket) {
        const today = legacyDay(store.now());
        h.ticketStatus = ticket.ticketStatus || null;
        // Corrected §5.1 behaviour: the other stored date survives while its status stands.
        h.acceptedDate =
          ticket.ticketStatus === 'Accepted'
            ? today
            : ticket.ticketStatus === 'Close'
              ? (h.acceptedDate ?? today)
              : null;
        h.closedDate =
          ticket.ticketStatus === 'Close'
            ? today
            : ticket.ticketStatus === 'Accepted'
              ? (h.closedDate ?? today)
              : null;
      }
      Object.assign(h, { updatedBy, updatedAt: store.now() });
      return true;
    },

    async generateAttachmentId() {
      return String(table().nextAttachmentId++);
    },
    async insertAttachment(_c, { attachmentId, requisitionId, fileName }) {
      table().attachments.push({
        attachmentId,
        requisitionId,
        fileName,
        attachedOn: legacyDay(store.now()),
      });
    },
    async listAttachments(_c, requisitionId) {
      return attachmentRows(requisitionId);
    },
    async findAttachment(_c, { requisitionId, attachmentId }) {
      const row = attachmentRows(requisitionId).find((a) => a.attachmentId === attachmentId);
      return row ?? null;
    },
    async deleteAttachment(_c, { requisitionId, attachmentId }) {
      const t = table();
      const before = t.attachments.length;
      t.attachments = t.attachments.filter(
        (a) => !(a.requisitionId === requisitionId && a.attachmentId === attachmentId),
      );
      return before - t.attachments.length > 0;
    },
    async deleteAttachmentsByHeader(_c, requisitionId) {
      const t = table();
      const before = t.attachments.length;
      t.attachments = t.attachments.filter((a) => a.requisitionId !== requisitionId);
      return before - t.attachments.length;
    },
    async deleteHeader(_c, requisitionId) {
      const t = table();
      const before = t.headers.length;
      t.headers = t.headers.filter((h) => h.requisitionId !== requisitionId);
      if (before === t.headers.length) return false;
      if (store.failures.requisitionDelete) throw new Error('simulated header delete failure');
      return true;
    },
    async countInterviewReferences(_c, requisitionNumber) {
      return store.state.interviewReferenceNumbers.includes(requisitionNumber) ? 1 : 0;
    },

    async listRequisitions(
      _c,
      { limit, offset, filters = {}, createdBy, scopeUserId, sortBy, sortDir },
    ) {
      const key = {
        requisitionId: (h) => Number(h.requisitionId),
        requestDate: (h) => legacyToTime(h.requestDate),
        dateNeeded: (h) => legacyToTime(h.dateNeeded),
        requesterName: (h) => h.requesterName,
        creationDate: (h) => h.createdAt.getTime(),
      }[sortBy];
      if (!key) throw new Error(`Unsupported sort ${sortBy}`);
      const inScope = scopeUserId ? new Set(supervisedIds(scopeUserId)) : null;
      const items = table()
        .headers.filter((h) => {
          const f = filters;
          if (f.requisitionStatus && h.requisitionStatus !== f.requisitionStatus) return false;
          if (f.ticketStatus && (h.ticketStatus ?? 'Open') !== f.ticketStatus) return false;
          if (f.requisitionId && h.requisitionId !== f.requisitionId) return false;
          if (
            f.requesterName &&
            !h.requesterName.toUpperCase().includes(f.requesterName.toUpperCase())
          )
            return false;
          if (f.jobName && !h.jobName.toUpperCase().includes(f.jobName.toUpperCase())) return false;
          if (f.deptName && !h.deptName.toUpperCase().includes(f.deptName.toUpperCase()))
            return false;
          if (f.reasonOfReq && h.reasonOfReq !== f.reasonOfReq) return false;
          if (f.dateFrom && legacyToTime(h.requestDate) < isoToTime(f.dateFrom)) return false;
          if (f.dateTo && legacyToTime(h.requestDate) >= isoToTime(f.dateTo) + 86_400_000)
            return false;
          if (f.search) {
            const term = likeTerm(f.search);
            if (
              ![h.requesterName, h.jobName, h.deptName, h.requisitionNumber].some((v) =>
                v.toUpperCase().includes(term),
              )
            ) {
              return false;
            }
          }
          if (
            createdBy !== null &&
            createdBy !== undefined &&
            String(h.createdBy) !== String(createdBy)
          )
            return false;
          if (inScope && !inScope.has(String(h.createdBy))) return false;
          return true;
        })
        .sort((a, b) => {
          const [x, y] = [key(a), key(b)];
          if (x === y) return Number(a.requisitionId) - Number(b.requisitionId);
          if (x === null) return 1;
          if (y === null) return -1;
          return (x < y ? -1 : 1) * (sortDir === 'desc' ? -1 : 1);
        });
      return {
        total: items.length,
        items: items.slice(offset, offset + limit).map((h) => ({
          requisitionId: h.requisitionId,
          requisitionNumber: h.requisitionNumber,
          requisitionStatus: h.requisitionStatus,
          requesterName: h.requesterName,
          requestedBy: h.requestedBy,
          requestDate: h.requestDate,
          dateNeeded: h.dateNeeded,
          jobName: h.jobName,
          deptName: h.deptName,
          reasonOfReq: h.reasonOfReq,
          replacementFor: h.replacementFor,
          budgeted: h.budgeted,
          totalPackage: h.totalPackage,
          ticketStatus: h.ticketStatus ?? 'Open', // NVL(ATTRIBUTE1,'Open') in the listing
          acceptedDate: h.acceptedDate,
          closedDate: h.closedDate,
          createdBy: h.createdBy,
          creationDate: legacyDay(h.createdAt),
          lastUpdateDate: h.updatedAt,
        })),
      };
    },

    async isHrUser(_c, userId) {
      return store.state.hrUserIds.includes(userId);
    },
    async createdByInScope(_c, { scopeUserId, createdBy }) {
      return supervisedIds(scopeUserId).includes(String(createdBy));
    },

    // --- Lookups (README §8) ------------------------------------------------------------------

    async listJobTitles() {
      const seen = new Map();
      for (const employee of store.state.empMaster) {
        if (employee.jobId && !seen.has(String(employee.jobId))) {
          seen.set(String(employee.jobId), {
            JOB_ID: String(employee.jobId),
            NAME: employee.jobTitle,
          });
        }
      }
      return [...seen.values()].sort((a, b) => Number(b.JOB_ID) - Number(a.JOB_ID));
    },
    async findRequestor(_c, userId) {
      const employee = store.state.empMaster.find((e) => String(e.userId) === String(userId));
      return employee
        ? {
            fullName: employee.fullName,
            emailAddress: employee.emailAddress,
            employeeNumber: employee.employeeNumber,
          }
        : null;
    },
    async listDepartments() {
      return [...store.state.deptMaster]
        .sort((a, b) => Number(a.orgId) - Number(b.orgId))
        .map((dept) => ({ ORGANIZATION_ID: String(dept.orgId), NAME: dept.name }));
    },
    async listReplacementCandidates(_c, employeeNumber) {
      const requestor = store.state.empMaster.find((e) => e.employeeNumber === employeeNumber);
      if (!requestor) return [];
      return store.state.empMaster
        .filter((e) => e.supervisorName === requestor.fullName)
        .map((e) => e.fullName);
    },
    async findBudget(_c, fullName) {
      const employee = store.state.empMaster.find((e) => e.fullName === fullName);
      return employee ? (employee.basicSalary ?? null) : null;
    },
    async listFilterOptions(_c, { scopeUserId }) {
      const inScope = scopeUserId ? new Set(supervisedIds(scopeUserId)) : null;
      const headers = table().headers.filter((h) => !inScope || inScope.has(String(h.createdBy)));
      const distinct = (values) =>
        [...new Set(values.filter((v) => v !== null && v !== undefined && v !== ''))].slice(0, 500);
      return {
        requisitionIds: distinct(headers.map((h) => h.requisitionId)),
        requesterNames: distinct(headers.map((h) => h.requesterName)),
        jobNames: distinct(headers.map((h) => h.jobName)),
        deptNames: distinct(headers.map((h) => h.deptName)),
        reasons: distinct(headers.map((h) => h.reasonOfReq)),
      };
    },
  };

  // Physical-file double: keeps an inventory so tests can assert saves/removals and simulate
  // a disk failure mid-transaction (the service must compensate and roll back). `failures.save`
  // is the 1-based save number to fail at (0 = never).
  const saved = [];
  let saveCount = 0;
  const storage = {
    inventory: saved,
    failures: { save: 0 },
    async save({ attachmentId, fileName, buffer }) {
      saveCount += 1;
      if (storage.failures.save && saveCount >= storage.failures.save) {
        throw new Error('simulated storage failure');
      }
      saved.push({ attachmentId, fileName, size: buffer.length });
    },
    async remove({ attachmentId, fileName }) {
      const index = saved.findIndex(
        (f) => f.attachmentId === attachmentId && f.fileName === fileName,
      );
      if (index >= 0) saved.splice(index, 1);
    },
  };

  /**
   * Seeds a requisition header in its stored shape; `attachments` is a list of file names.
   * Dates use the stored 'DD-Mon-YY' form.
   */
  function seedRequisition({
    createdBy = store.state.users[0]?.userId ?? '100',
    requestedBy = '1001',
    requesterName = 'Seeded Requester',
    requisitionStatus = 'Draft',
    ticketStatus = null,
    acceptedDate = null,
    closedDate = null,
    requestDate = '19-Oct-26',
    dateNeeded = '01-Nov-26',
    jobName = 'Machine Operator',
    deptName = 'Production',
    reasonOfReq = 'Addition',
    replacementFor = null,
    reason = 'New headcount',
    requisitionId,
    attachments = [],
  } = {}) {
    const t = table();
    const id = requisitionId ?? String(100000 + 20 * t.headers.length);
    t.headers.push({
      requisitionId: id,
      requisitionNumber: id,
      requisitionStatus,
      requestedBy,
      requesterName,
      requestDate,
      jobId: null,
      jobName,
      deptId: null,
      deptName,
      dateNeeded,
      reasonOfReq,
      replacementFor,
      reason,
      budgeted: 'N',
      budgetedSal: 0,
      highSchool: 'N',
      diploma: 'N',
      higherDiploma: 'N',
      degree: 'N',
      masterDegree: 'N',
      gccExp: '0 - 2',
      workExp: '0 - 2',
      skills: null,
      other: null,
      remark: null,
      totalPackage: null,
      ticketStatus,
      acceptedDate,
      closedDate,
      createdBy,
      createdAt: store.now(),
      updatedBy: null,
      updatedAt: null,
    });
    for (const fileName of attachments) {
      t.attachments.push({
        attachmentId: String(t.nextAttachmentId++),
        requisitionId: id,
        fileName,
        attachedOn: legacyDay(store.now()),
      });
    }
    return id;
  }

  store.requisitionRepository = requisitionRepository;
  store.requisitionStorage = storage;
  store.seedRequisition = seedRequisition;
  return requisitionRepository;
}
