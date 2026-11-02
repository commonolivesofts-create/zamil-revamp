/*
 * In-memory double of workflowManager.repository.js over an auth store's `state` (so transactions
 * snapshot/rollback it too). It mirrors the semantics the service relies on: identity IDs, the
 * FORM_CODE / SOURCE_CODE unique keys (ORA-00001), ROW_VERSION matching and increment, the
 * module catalogue (read from the RBAC double), read-only version metadata and a seeded Oracle
 * dictionary (names only). `failNext(name)` makes the next call of a repository function throw an
 * Oracle-like error. It does NOT prove the SQL; it proves routes, guards, validation, rules and
 * transaction boundaries.
 */
const uniqueViolation = (constraint) =>
  Object.assign(new Error(`ORA-00001: unique constraint (XXZP.${constraint}) violated`), {
    errorNum: 1,
  });

const STATUS = { ACTIVE: true, INACTIVE: false };

const unescapeLike = (pattern) => pattern.slice(1, -1).replace(/\\([\\%_])/g, '$1');

export function installWorkflowManager(store, { dictionary = [] } = {}) {
  store.state.workflowManager = {
    nextId: 1,
    forms: [],
    sources: [],
    sourceVersions: [],
    formVersions: [],
  };
  const t = () => store.state.workflowManager; // re-read: a rollback replaces the object
  const newId = () => String(t().nextId++);
  const failures = new Set();
  const calls = [];

  const userName = (userId) =>
    store.state.employees?.find(
      (e) =>
        e.employeeNumber === store.state.users?.find((u) => u.userId === userId)?.employeeNumber,
    )?.fullName ?? null;
  const modules = () => store.state.rbac?.modules ?? [];

  const formView = (f) => ({
    formId: f.formId,
    formCode: f.formCode,
    formName: f.formName,
    moduleCode: f.moduleCode,
    moduleName: modules().find((m) => m.moduleCode === f.moduleCode)?.moduleName ?? null,
    detailRoute: f.detailRoute,
    description: f.description,
    isActive: f.isActive,
    versionCount: t().formVersions.filter((v) => v.formId === f.formId).length,
    rowVersion: f.rowVersion,
    createdAt: f.createdAt.toISOString(),
    createdBy: f.createdBy,
    createdByName: userName(f.createdBy),
    updatedAt: f.updatedAt.toISOString(),
    updatedBy: f.updatedBy,
    updatedByName: userName(f.updatedBy),
  });

  const sourceView = (s) => ({
    sourceId: s.sourceId,
    sourceCode: s.sourceCode,
    sourceName: s.sourceName,
    sourceKind: s.sourceKind,
    ownerName: s.ownerName,
    objectName: s.objectName,
    handlerCode: s.handlerCode,
    isActive: s.isActive,
    versionCount: t().sourceVersions.filter((v) => v.sourceId === s.sourceId).length,
    rowVersion: s.rowVersion,
    createdAt: s.createdAt.toISOString(),
    createdBy: s.createdBy,
    createdByName: userName(s.createdBy),
    updatedAt: s.updatedAt.toISOString(),
    updatedBy: s.updatedBy,
    updatedByName: userName(s.updatedBy),
  });

  const page = (rows, { limit, offset, sortBy, sortDir }, keys) => {
    const key = keys[sortBy];
    const sorted = [...rows].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      const order = x < y ? -1 : x > y ? 1 : Number(a.id) - Number(b.id);
      return sortDir === 'desc' ? -order : order;
    });
    return { total: rows.length, items: sorted.slice(offset, offset + limit) };
  };

  const matches = (search, ...values) => {
    if (!search) return true;
    const term = unescapeLike(search);
    return values.some((value) => value && value.toUpperCase().includes(term));
  };

  const touch = (row, actorUserId) =>
    Object.assign(row, {
      updatedAt: store.now(),
      updatedBy: actorUserId,
      rowVersion: row.rowVersion + 1,
    });

  const repository = {
    async listForms(_c, { limit, offset, filters, sortBy, sortDir }) {
      const rows = t()
        .forms.filter((f) => matches(filters.search, f.formCode, f.formName, f.moduleCode))
        .filter((f) => !filters.moduleCode || f.moduleCode === filters.moduleCode)
        .filter((f) => !filters.status || f.isActive === STATUS[filters.status])
        .map(formView)
        .map((f) => ({ ...f, id: f.formId }));
      const result = page(
        rows,
        { limit, offset, sortBy, sortDir },
        {
          FORM_CODE: (f) => f.formCode,
          FORM_NAME: (f) => f.formName.toUpperCase(),
          MODULE_CODE: (f) => f.moduleCode,
          UPDATED_AT: (f) => f.updatedAt,
        },
      );
      return {
        total: result.total,
        items: result.items.map(({ id: _id, createdByName: _a, updatedByName: _b, ...f }) => ({
          ...f,
          createdByName: null,
          updatedByName: null,
        })),
      };
    },
    async findForm(_c, formId) {
      const f = t().forms.find((row) => row.formId === formId);
      return f ? formView(f) : null;
    },
    async findFormIdByCode(_c, formCode) {
      return t().forms.find((f) => f.formCode === formCode)?.formId ?? null;
    },
    async insertForm(_c, form) {
      if (t().forms.some((f) => f.formCode === form.formCode))
        throw uniqueViolation('ZWF_UQ_FORM_1');
      const formId = newId();
      t().forms.push({
        formId,
        formCode: form.formCode,
        formName: form.formName,
        moduleCode: form.moduleCode,
        detailRoute: form.detailRoute,
        description: form.description,
        isActive: true,
        createdAt: store.now(),
        createdBy: form.actorUserId,
        updatedAt: store.now(),
        updatedBy: form.actorUserId,
        rowVersion: 1,
      });
      return formId;
    },
    async updateForm(_c, form) {
      const row = t().forms.find(
        (f) => f.formId === form.formId && f.rowVersion === form.rowVersion,
      );
      if (!row) return 0;
      Object.assign(row, {
        formName: form.formName,
        moduleCode: form.moduleCode,
        detailRoute: form.detailRoute,
        description: form.description,
      });
      touch(row, form.actorUserId);
      return 1;
    },
    async setFormActive(_c, { formId, isActive, rowVersion, actorUserId }) {
      const row = t().forms.find((f) => f.formId === formId && f.rowVersion === rowVersion);
      if (!row) return 0;
      row.isActive = isActive;
      touch(row, actorUserId);
      return 1;
    },
    async listFormVersions(_c, formId) {
      return t()
        .formVersions.filter((v) => v.formId === formId)
        .sort((a, b) => b.versionNo - a.versionNo)
        .map((v) => {
          const sv = t().sourceVersions.find((s) => s.sourceVersionId === v.headerSourceVersionId);
          const source = t().sources.find((s) => s.sourceId === sv.sourceId);
          return {
            formVersionId: v.formVersionId,
            versionNo: v.versionNo,
            lifecycleState: v.lifecycleState,
            isDefault: v.isDefault,
            configSha256: v.configSha256,
            schemaVersion: 1,
            publishedAt: null,
            createdAt: store.now().toISOString(),
            updatedAt: store.now().toISOString(),
            headerSource: {
              sourceVersionId: sv.sourceVersionId,
              versionNo: sv.versionNo,
              sourceId: source.sourceId,
              sourceCode: source.sourceCode,
            },
          };
        });
    },

    async listSources(_c, { limit, offset, filters, sortBy, sortDir }) {
      const rows = t()
        .sources.filter((s) =>
          matches(filters.search, s.sourceCode, s.sourceName, s.objectName, s.handlerCode),
        )
        .filter((s) => !filters.sourceKind || s.sourceKind === filters.sourceKind)
        .filter((s) => !filters.status || s.isActive === STATUS[filters.status])
        .map(sourceView)
        .map((s) => ({ ...s, id: s.sourceId }));
      const result = page(
        rows,
        { limit, offset, sortBy, sortDir },
        {
          SOURCE_CODE: (s) => s.sourceCode,
          SOURCE_NAME: (s) => s.sourceName.toUpperCase(),
          SOURCE_KIND: (s) => s.sourceKind,
          UPDATED_AT: (s) => s.updatedAt,
        },
      );
      return {
        total: result.total,
        items: result.items.map(({ id: _id, ...s }) => ({
          ...s,
          createdByName: null,
          updatedByName: null,
        })),
      };
    },
    async findSource(_c, sourceId) {
      const s = t().sources.find((row) => row.sourceId === sourceId);
      return s ? sourceView(s) : null;
    },
    async findSourceIdByCode(_c, sourceCode) {
      return t().sources.find((s) => s.sourceCode === sourceCode)?.sourceId ?? null;
    },
    async insertSource(_c, source) {
      if (t().sources.some((s) => s.sourceCode === source.sourceCode)) {
        throw uniqueViolation('ZWF_UQ_SRC_1');
      }
      const sourceId = newId();
      t().sources.push({
        sourceId,
        sourceCode: source.sourceCode,
        sourceName: source.sourceName,
        sourceKind: source.sourceKind,
        ownerName: source.ownerName,
        objectName: source.objectName,
        handlerCode: source.handlerCode,
        isActive: true,
        createdAt: store.now(),
        createdBy: source.actorUserId,
        updatedAt: store.now(),
        updatedBy: source.actorUserId,
        rowVersion: 1,
      });
      return sourceId;
    },
    async updateSource(_c, source) {
      const row = t().sources.find(
        (s) => s.sourceId === source.sourceId && s.rowVersion === source.rowVersion,
      );
      if (!row) return 0;
      Object.assign(row, {
        sourceName: source.sourceName,
        sourceKind: source.sourceKind,
        ownerName: source.ownerName,
        objectName: source.objectName,
        handlerCode: source.handlerCode,
      });
      touch(row, source.actorUserId);
      return 1;
    },
    async setSourceActive(_c, { sourceId, isActive, rowVersion, actorUserId }) {
      const row = t().sources.find((s) => s.sourceId === sourceId && s.rowVersion === rowVersion);
      if (!row) return 0;
      row.isActive = isActive;
      touch(row, actorUserId);
      return 1;
    },
    async listSourceVersions(_c, sourceId) {
      return t()
        .sourceVersions.filter((v) => v.sourceId === sourceId)
        .sort((a, b) => b.versionNo - a.versionNo)
        .map((v) => ({
          sourceVersionId: v.sourceVersionId,
          versionNo: v.versionNo,
          lifecycleState: v.lifecycleState,
          isDefault: v.isDefault,
          configSha256: v.configSha256,
          schemaVersion: 1,
          validatedAt: null,
          publishedAt: null,
          createdAt: store.now().toISOString(),
          updatedAt: store.now().toISOString(),
        }));
    },

    async countForms() {
      return {
        total: t().forms.length,
        active: t().forms.filter((f) => f.isActive).length,
      };
    },
    async countSources() {
      const kinds = [...new Set(t().sources.map((s) => s.sourceKind))];
      return kinds.map((sourceKind) => {
        const rows = t().sources.filter((s) => s.sourceKind === sourceKind);
        return { sourceKind, total: rows.length, active: rows.filter((s) => s.isActive).length };
      });
    },

    async listActiveModules() {
      return modules()
        .filter((m) => m.isActive)
        .map((m) => ({ moduleCode: m.moduleCode, moduleName: m.moduleName }));
    },
    async findActiveModule(_c, moduleCode) {
      const m = modules().find((row) => row.moduleCode === moduleCode && row.isActive);
      return m ? { moduleCode: m.moduleCode, moduleName: m.moduleName } : null;
    },
    async findDictionaryObject(_c, { ownerName, objectName }) {
      return dictionary.filter((o) => o.ownerName === ownerName && o.objectName === objectName);
    },
    async listDictionaryObjects(_c, { owners, objectType, search, excludedPrefixes, limit }) {
      return dictionary
        .filter((o) => owners.includes(o.ownerName) && o.objectType === objectType)
        .filter((o) => o.status === 'VALID')
        .filter((o) => !excludedPrefixes.some((prefix) => o.objectName.startsWith(prefix)))
        .filter((o) => !search || o.objectName.includes(unescapeLike(search)))
        .slice(0, limit)
        .map(({ ownerName, objectName, objectType: type }) => ({
          ownerName,
          objectName,
          objectType: type,
        }));
    },
  };

  // Wraps every function: records calls and throws once for names passed to failNext().
  const wrapped = Object.fromEntries(
    Object.entries(repository).map(([name, fn]) => [
      name,
      async (...args) => {
        calls.push(name);
        if (failures.delete(name)) {
          throw Object.assign(new Error('ORA-03113: end-of-file on communication channel'), {
            errorNum: 3113,
          });
        }
        return fn(...args);
      },
    ]),
  );

  store.workflowManagerRepository = wrapped;
  return {
    repository: wrapped,
    tables: t,
    calls,
    failNext: (name) => failures.add(name),
    /** Seeds read-only version metadata (created by M2 in production). */
    addSourceVersion(sourceId, overrides = {}) {
      const v = {
        sourceVersionId: newId(),
        sourceId,
        versionNo: 1,
        lifecycleState: 'DRAFT',
        isDefault: false,
        configSha256: 'a'.repeat(64),
        ...overrides,
      };
      t().sourceVersions.push(v);
      return v;
    },
    addFormVersion(formId, headerSourceVersionId, overrides = {}) {
      const v = {
        formVersionId: newId(),
        formId,
        headerSourceVersionId,
        versionNo: 1,
        lifecycleState: 'DRAFT',
        isDefault: false,
        configSha256: 'b'.repeat(64),
        ...overrides,
      };
      t().formVersions.push(v);
      return v;
    },
  };
}
