import { terminationStatus } from './authFakes.js';

/*
 * In-memory double of users.repository.js over an auth store's `state` (so transactions roll it
 * back). Mirrors: one employee-master row per account plus the duplicate-row count, upper-case
 * contains search on employee number / username / full name, filters, allowlisted sorting, the
 * PENDING insert with UQ_ZRV_USERS_EMP (ORA-00001), guarded activation (password set and change time
 * present) and disable, user-scoped session revocation and outstanding action-token revocation.
 * It does NOT prove the SQL; see scripts/verify-auth-sql.js.
 */
export function installUsers(store) {
  store.state.actionTokens = [];
  const nowMs = () => store.now().getTime();
  const rowsFor = (employeeNumber) =>
    store.state.employees.filter((e) => e.employeeNumber === employeeNumber);
  const toEmployee = (e) =>
    e && {
      username: e.username,
      fullName: e.fullName,
      email: e.email,
      jobTitle: e.jobTitle,
      department: e.department,
      currentEmployeeFlag: e.currentEmployeeFlag,
      terminationStatus: terminationStatus(e.terminationDate, store.now()),
      employeeRowCount: rowsFor(e.employeeNumber).length,
    };
  const employeeOf = (u) => toEmployee(rowsFor(u.employeeNumber)[0]);
  const locked = (u) => Boolean(u.lockedUntil && u.lockedUntil.getTime() > nowMs());
  const mfaEnrolled = (u) => u.mfaEnrolledAt !== null || u.mfaTotpSecretEncrypted !== null;
  // Reverses searchPattern(): '%TERM%' with \-escaped wildcards -> contains-match on TERM.
  const matches = (pattern, ...values) => {
    const term = pattern.slice(1, -1).replace(/\\([\\%_])/g, '$1');
    return values.some((v) => v?.toUpperCase().includes(term));
  };
  const sortKey = {
    employeeNumber: (u) => u.employeeNumber,
    username: (u) => employeeOf(u)?.username ?? null,
    createdAt: (u) => u.createdAt?.getTime() ?? null,
    lastLoginAt: (u) => u.lastLoginAt?.getTime() ?? null,
  };
  const page = (items, { limit, offset }) => items.slice(offset, offset + limit);

  const usersRepository = {
    async listUsers(_c, { limit, offset, filters = {}, sortBy, sortOrder }) {
      const key = sortKey[sortBy];
      if (!key) throw new Error(`Unsupported sort ${sortBy}`);
      const items = store.state.users.filter((u) => {
        const e = employeeOf(u);
        if (filters.status && u.accountStatus !== filters.status) return false;
        if (
          filters.search &&
          !matches(filters.search, u.employeeNumber, e?.username, e?.fullName)
        ) {
          return false;
        }
        if (filters.mfaEnrolled !== undefined && mfaEnrolled(u) !== filters.mfaEnrolled)
          return false;
        if (filters.locked !== undefined && locked(u) !== filters.locked) return false;
        return true;
      });
      const direction = sortOrder === 'desc' ? -1 : 1;
      items.sort((a, b) => {
        const [x, y] = [key(a), key(b)];
        if (x === y) return Number(a.userId) - Number(b.userId);
        if (x === null) return 1;
        if (y === null) return -1;
        return (x < y ? -1 : 1) * direction;
      });
      return {
        total: items.length,
        items: page(items, { limit, offset }).map((u) => {
          const e = employeeOf(u);
          return {
            userId: u.userId,
            employeeNumber: u.employeeNumber,
            username: e?.username ?? null,
            fullName: e?.fullName ?? null,
            department: e?.department ?? null,
            jobTitle: e?.jobTitle ?? null,
            accountStatus: u.accountStatus,
            locked: locked(u),
            mfaEnrolled: mfaEnrolled(u),
            lastLoginAt: u.lastLoginAt,
            createdAt: u.createdAt ?? null,
          };
        }),
      };
    },

    async findUserDetail(_c, userId) {
      const u = store.user(userId);
      if (!u) return null;
      return {
        userId: u.userId,
        employeeNumber: u.employeeNumber,
        accountStatus: u.accountStatus,
        failedLoginAttempts: u.failedLoginAttempts,
        lastFailedLoginAt: u.lastFailedLoginAt,
        lockedUntil: u.lockedUntil,
        locked: locked(u),
        lastLoginAt: u.lastLoginAt,
        passwordSet: u.passwordHash !== null,
        passwordChangedAt: u.passwordChangedAt,
        mfaEnrolledAt: u.mfaEnrolledAt,
        createdAt: u.createdAt ?? null,
        updatedAt: u.updatedAt ?? null,
        employee: employeeOf(u) ?? null,
        mfaEnrolled: mfaEnrolled(u),
        isPrivilegedRoleMember: u.isPrivilegedRoleMember,
        hasSecurityAdministration: u.hasSecurityAdministration,
        dbNow: store.now(),
      };
    },

    async listActiveSessions(_c, userId) {
      return store.state.sessions
        .filter((s) => s.userId === userId && !s.revokedAt && s.expiresAt.getTime() > nowMs())
        .sort((a, b) => Number(b.sessionId) - Number(a.sessionId))
        .slice(0, 50)
        .map((s) => ({
          sessionId: s.sessionId,
          createdAt: s.createdAt,
          lastActivityAt: s.lastActivityAt,
          expiresAt: s.expiresAt,
          mfaVerified: Boolean(s.mfaVerifiedAt),
          ipAddress: s.ipAddress ?? null,
          userAgent: s.userAgent ?? null,
        }));
    },

    async findSession(_c, { userId, sessionId }) {
      const s = store.state.sessions.find((x) => x.sessionId === sessionId && x.userId === userId);
      return s ? { sessionId: s.sessionId, revoked: Boolean(s.revokedAt) } : null;
    },

    async listEmployeeCandidates(_c, { limit, offset, search, hasAccount }) {
      const items = store.state.employees
        .filter((e) => !search || matches(search, e.employeeNumber, e.username, e.fullName))
        .map(candidate)
        .filter((c) => hasAccount === undefined || (c.userId !== null) === hasAccount)
        .sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber));
      return { total: items.length, items: page(items, { limit, offset }) };
    },

    async findEmployeeCandidate(_c, employeeNumber) {
      return rowsFor(employeeNumber).slice(0, 2).map(candidate);
    },

    async insertUser(_c, { employeeNumber, actorUserId }) {
      if (store.state.users.some((u) => u.employeeNumber === employeeNumber)) {
        throw Object.assign(new Error('ORA-00001: unique constraint (UQ_ZRV_USERS_EMP) violated'), {
          errorNum: 1,
        });
      }
      const user = store.addUser(employeeNumber, {
        accountStatus: 'PENDING',
        passwordChangedAt: null,
        createdAt: store.now(),
        createdBy: actorUserId,
      });
      return user.userId;
    },

    async activateUser(_c, { userId, actorUserId }) {
      const u = store.user(userId);
      if (!u || !['PENDING', 'DISABLED'].includes(u.accountStatus)) return false;
      if (u.passwordHash === null || u.passwordChangedAt === null) return false;
      Object.assign(u, { accountStatus: 'ACTIVE', updatedAt: store.now(), updatedBy: actorUserId });
      return true;
    },

    async disableUser(_c, { userId, actorUserId }) {
      const u = store.user(userId);
      if (!u || u.accountStatus === 'DISABLED') return false;
      Object.assign(u, {
        accountStatus: 'DISABLED',
        updatedAt: store.now(),
        updatedBy: actorUserId,
      });
      return true;
    },

    async revokeUserSession(_c, { userId, sessionId, actorUserId }) {
      const s = store.state.sessions.find(
        (x) => x.sessionId === sessionId && x.userId === userId && !x.revokedAt,
      );
      if (!s) return false;
      Object.assign(s, { revokedAt: store.now(), updatedBy: actorUserId });
      return true;
    },

    async revokeActionTokens(_c, { userId, actorUserId }) {
      let count = 0;
      for (const t of store.state.actionTokens) {
        if (t.userId === userId && !t.consumedAt && !t.revokedAt) {
          Object.assign(t, { revokedAt: store.now(), updatedBy: actorUserId });
          count += 1;
        }
      }
      return count;
    },
  };

  function candidate(e) {
    const user = store.state.users.find((u) => u.employeeNumber === e.employeeNumber);
    const normalized = e.username?.trim().toUpperCase();
    return {
      employeeNumber: e.employeeNumber,
      employee: toEmployee(e),
      usernameCount: store.state.employees.filter(
        (x) => normalized && x.username?.trim().toUpperCase() === normalized,
      ).length,
      userId: user?.userId ?? null,
      accountStatus: user?.accountStatus ?? null,
    };
  }

  store.usersRepository = usersRepository;
  return usersRepository;
}
