import { config } from '../../src/config/index.js';
import { createApp } from '../../src/app.js';
import { hashPassword } from '../../src/modules/auth/password.js';

/*
 * In-memory doubles for the Phase 01 auth repositories. They mirror the repository SQL semantics
 * (case-insensitive trimmed username match, atomic lockout counter, session lookup joins) and
 * implement transactions with snapshot/rollback, so service behaviour such as "failed-login
 * audit persists although the request is rejected" can be asserted. They do NOT prove the SQL
 * itself; see scripts/verify-auth-sql.js for read-only checks against the real Oracle schema.
 */

// The approved minimum (Decision 05): hashes below it are refused, so tests use it too.
export const TEST_ARGON2_COST = Object.freeze({ memoryKiB: 19456, passes: 2, parallelism: 1 });

const MINUTE_MS = 60 * 1000;
export const DAY_MS = 24 * 60 * MINUTE_MS;

const clone = (value) => structuredClone(value);

// KSA calendar date (YYYY-MM-DD) of an instant, as Oracle's CAST(now AT TIME ZONE 'Asia/Riyadh').
export const riyadhDate = (instant) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(instant);

/**
 * Mirrors TERMINATION_STATUS_SQL. `terminationDate` is a date-only 'YYYY-MM-DD' string, like an
 * Oracle DATE business value; it is FUTURE only when strictly after today's KSA date.
 */
export function terminationStatus(terminationDate, instant) {
  if (terminationDate === null) return 'NONE';
  return terminationDate > riyadhDate(instant) ? 'FUTURE' : 'ENDED';
}

const CODE = /^[A-Z][A-Z0-9_]*$/;

/**
 * The deployed XX_ZRV_RBAC_AUDIT_LOGS constraints (verified read-only in TEST), applied to every
 * row the doubles receive so that any test producing an invalid row fails.
 */
export function assertAuditRowConstraints(row) {
  const fail = (message) => {
    throw new Error(`Audit row violates ${message}: ${JSON.stringify(row)}`);
  };
  if (!CODE.test(row.eventCode) || row.eventCode.length > 80) fail('CK_ZRV_AUD_EVENT');
  if (!['SUCCESS', 'FAILURE', 'DENIED'].includes(row.eventOutcome)) fail('CK_ZRV_AUD_OUTCOME');
  if (!['USER', 'SYSTEM', 'ANONYMOUS'].includes(row.actorType)) fail('CK_ZRV_AUD_ACTOR');
  if ((row.actorType === 'USER') !== (row.createdBy !== null)) fail('CK_ZRV_AUD_ACTOR_ID');
  if ((row.targetType === null) !== (row.targetRecordId === null)) fail('CK_ZRV_AUD_TARGET');
  if (row.targetType !== null && (!CODE.test(row.targetType) || row.targetType.length > 40)) {
    fail('CK_ZRV_AUD_TARGET_CODE');
  }
  if (row.reasonCode !== null && (!CODE.test(row.reasonCode) || row.reasonCode.length > 60)) {
    fail('REASON_CODE VARCHAR2(60)');
  }
  if (row.eventDetails !== null) JSON.parse(row.eventDetails);
  if ('updatedAt' in row || 'updatedBy' in row) fail('CK_ZRV_AUD_IMMUT');
}

export function createAuthStore({ start = new Date('2026-10-19T08:00:00Z') } = {}) {
  let nowMs = start.getTime();
  let nextUserId = 100;
  let nextSessionId = 5000;

  const state = { employees: [], users: [], sessions: [], audit: [] };
  const stats = { commits: 0, rollbacks: 0 };
  const failures = {
    auditInsert: false,
    sessionInsert: false,
    failedAttemptUpdate: false,
    mfaStepUpdate: false,
    resetUpdate: false,
    revokeUpdate: false,
  };

  const now = () => new Date(nowMs);

  // Race simulation: a read registered with holdReads() returns its already-captured result only
  // once `count` callers have read, so concurrent requests all read before any of them writes.
  const barriers = new Map();
  let transactionQueue = Promise.resolve();
  async function barrier(name) {
    const gate = barriers.get(name);
    if (!gate) return;
    gate.arrived += 1;
    if (gate.arrived >= gate.count) {
      barriers.delete(name);
      gate.release();
    }
    await gate.promise;
  }
  const isActivelyLocked = (user) => user.lockedUntil && user.lockedUntil.getTime() > nowMs;
  const findUser = (userId) => state.users.find((user) => user.userId === userId);

  function employeeRows(employeeNumber) {
    return state.employees.filter((employee) => employee.employeeNumber === employeeNumber);
  }

  function toEmployee(employee) {
    return {
      username: employee.username,
      fullName: employee.fullName,
      email: employee.email,
      jobTitle: employee.jobTitle,
      department: employee.department,
      currentEmployeeFlag: employee.currentEmployeeFlag,
      terminationStatus: terminationStatus(employee.terminationDate, now()),
      employeeRowCount: employeeRows(employee.employeeNumber).length,
    };
  }

  // Mirrors the Oracle classification columns (PRIVILEGE_COLUMNS). Their SQL semantics are verified
  // on Oracle by `npm run db:verify-auth`; here tests set the resulting flags directly.
  const privilegeFlags = (user) => ({
    mfaEnrolled: user.mfaEnrolledAt !== null,
    isPrivilegedRoleMember: user.isPrivilegedRoleMember,
    hasSecurityAdministration: user.hasSecurityAdministration,
  });

  const db = {
    async withConnection(_pool, work) {
      return work({});
    },
    // Transactions run one at a time (as Oracle row locks serialise writers of the same rows), so
    // a rollback restores only its own changes. Reads outside transactions stay concurrent.
    async withTransaction(_pool, work) {
      const previous = transactionQueue;
      let done;
      transactionQueue = new Promise((resolve) => {
        done = resolve;
      });
      await previous;

      const snapshot = clone(state);
      try {
        const result = await work({});
        stats.commits += 1;
        return result;
      } catch (error) {
        Object.assign(state, snapshot);
        stats.rollbacks += 1;
        throw error;
      } finally {
        done();
      }
    },
  };

  const authRepository = {
    async findLoginCandidates(_connection, username) {
      const wanted = username.trim().toUpperCase();
      return state.employees
        .filter((employee) => employee.username?.trim().toUpperCase() === wanted)
        .slice(0, 2)
        .map((employee) => {
          const user = state.users.find((item) => item.employeeNumber === employee.employeeNumber);
          return {
            employeeNumber: employee.employeeNumber,
            employee: toEmployee(employee),
            account: user
              ? {
                  userId: user.userId,
                  passwordHash: user.passwordHash,
                  passwordChangedAt: user.passwordChangedAt,
                  accountStatus: user.accountStatus,
                  failedLoginAttempts: user.failedLoginAttempts,
                  lockedUntil: user.lockedUntil,
                  employeeNumber: user.employeeNumber,
                  ...privilegeFlags(user),
                }
              : null,
            dbNow: now(),
          };
        });
    },

    async recordFailedAttempt(_connection, { userId, maxFailures, lockSeconds }) {
      if (failures.failedAttemptUpdate) throw new Error('simulated counter update failure');
      const user = findUser(userId);
      if (isActivelyLocked(user)) return null;

      const base = user.lockedUntil ? 0 : user.failedLoginAttempts;
      user.failedLoginAttempts = base + 1;
      user.lastFailedLoginAt = now();
      user.lockedUntil =
        user.failedLoginAttempts >= maxFailures ? new Date(nowMs + lockSeconds * 1000) : null;
      return { failedAttempts: user.failedLoginAttempts, locked: user.lockedUntil !== null };
    },

    async resetFailedAttempts(_connection, userId) {
      if (failures.resetUpdate) throw new Error('simulated reset failure');
      const user = findUser(userId);
      if (isActivelyLocked(user)) return;
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
    },

    async findMfaCredential(_connection, userId) {
      const user = findUser(userId);
      const credential =
        user.mfaTotpSecretEncrypted && user.mfaEnrolledAt
          ? { encryptedSecret: user.mfaTotpSecretEncrypted, lastUsedStep: user.mfaLastUsedStep }
          : null;
      await barrier('findMfaCredential');
      return credential;
    },

    async recordMfaStep(_connection, { userId, step }) {
      if (failures.mfaStepUpdate) throw new Error('simulated MFA step update failure');
      const user = findUser(userId);
      if (!user.mfaTotpSecretEncrypted) return false;
      if (user.mfaLastUsedStep !== null && user.mfaLastUsedStep >= step) return false;
      user.mfaLastUsedStep = step;
      return true;
    },

    async enrollMfa(_connection, { userId, encryptedSecret, step }) {
      const user = findUser(userId);
      if (user.mfaTotpSecretEncrypted !== null || user.mfaEnrolledAt !== null) return false;
      user.mfaTotpSecretEncrypted = encryptedSecret;
      user.mfaEnrolledAt = now();
      user.mfaLastUsedStep = step;
      return true;
    },

    async replaceMfa(_connection, { userId, currentEncryptedSecret, encryptedSecret, step }) {
      const user = findUser(userId);
      if (
        user.mfaTotpSecretEncrypted !== currentEncryptedSecret ||
        !user.mfaEnrolledAt ||
        user.accountStatus !== 'ACTIVE' ||
        isActivelyLocked(user)
      ) {
        return false;
      }
      Object.assign(user, {
        mfaTotpSecretEncrypted: encryptedSecret,
        mfaEnrolledAt: now(),
        mfaLastUsedStep: step,
      });
      return true;
    },

    async recordLoginSuccess(_connection, userId) {
      const user = findUser(userId);
      if (user.accountStatus !== 'ACTIVE' || !user.passwordHash || isActivelyLocked(user)) {
        return false;
      }
      user.failedLoginAttempts = 0;
      user.lockedUntil = null;
      user.lastLoginAt = now();
      return true;
    },
  };

  const sessionRepository = {
    async insertSession(
      _connection,
      { userId, tokenHash, absoluteSeconds, ipAddress, userAgent, mfaVerified = false },
    ) {
      if (failures.sessionInsert) throw new Error('simulated session insert failure');
      const session = {
        sessionId: String(nextSessionId++),
        userId,
        tokenHash: tokenHash.toString('hex'),
        lastActivityAt: now(),
        expiresAt: new Date(nowMs + absoluteSeconds * 1000),
        revokedAt: null,
        mfaVerifiedAt: mfaVerified ? now() : null,
        createdAt: now(),
        ipAddress,
        userAgent,
        createdBy: userId,
      };
      state.sessions.push(session);
      return { sessionId: session.sessionId, expiresAt: session.expiresAt };
    },

    async findSessionByTokenHash(_connection, tokenHash) {
      const session = state.sessions.find((item) => item.tokenHash === tokenHash.toString('hex'));
      if (!session) return [];

      const user = findUser(session.userId);
      const employees = employeeRows(user.employeeNumber);
      const base = {
        sessionId: session.sessionId,
        userId: session.userId,
        lastActivityAt: session.lastActivityAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        mfaVerifiedAt: session.mfaVerifiedAt,
        createdAt: session.createdAt,
        employeeNumber: user.employeeNumber,
        accountStatus: user.accountStatus,
        passwordChangedAt: user.passwordChangedAt,
        lockedUntil: user.lockedUntil,
        ...privilegeFlags(user),
        dbNow: now(),
      };
      const rows =
        employees.length === 0
          ? [{ ...base, employee: null }]
          : employees.slice(0, 2).map((employee) => ({ ...base, employee: toEmployee(employee) }));
      await barrier('findSessionByTokenHash');
      return rows;
    },

    async touchSession(_connection, { sessionId, userId }) {
      const session = state.sessions.find(
        (item) => item.sessionId === sessionId && item.userId === userId,
      );
      if (!session || session.revokedAt || session.expiresAt.getTime() <= nowMs) return false;
      session.lastActivityAt = now();
      return true;
    },

    async revokeSession(_connection, { sessionId, actorUserId }) {
      if (failures.revokeUpdate) throw new Error('simulated revoke failure');
      const session = state.sessions.find((item) => item.sessionId === sessionId);
      if (!session || session.revokedAt) return false;
      session.revokedAt = now();
      session.updatedBy = actorUserId;
      return true;
    },

    async revokeUserSessions(_connection, { userId, actorUserId }) {
      let count = 0;
      for (const session of state.sessions) {
        if (session.userId === userId && !session.revokedAt) {
          session.revokedAt = now();
          session.updatedBy = actorUserId;
          count += 1;
        }
      }
      return count;
    },

    async revokeSessionByTokenHash(_connection, { tokenHash, actorUserId }) {
      const session = state.sessions.find((item) => item.tokenHash === tokenHash.toString('hex'));
      if (session && !session.revokedAt) {
        session.revokedAt = now();
        session.updatedBy = actorUserId;
      }
    },
  };

  const auditRepository = {
    async insertAuditEvent(_connection, row) {
      if (failures.auditInsert) throw new Error('simulated audit insert failure');
      assertAuditRowConstraints(row);
      state.audit.push({ ...row, createdAt: now() });
    },
  };

  return {
    state,
    stats,
    failures,
    db,
    authRepository,
    sessionRepository,
    auditRepository,
    now,
    holdReads(name, count) {
      let release;
      const promise = new Promise((resolve) => {
        release = resolve;
      });
      barriers.set(name, { count, arrived: 0, promise, release });
    },
    advance(ms) {
      nowMs += ms;
    },
    addEmployee(overrides = {}) {
      const employee = {
        employeeNumber: `E${state.employees.length + 1000}`,
        username: `USER${state.employees.length + 1}`,
        fullName: 'Test Employee',
        email: 'test.employee@example.invalid',
        jobTitle: 'Engineer',
        department: 'Engineering',
        currentEmployeeFlag: 'Y',
        terminationDate: null,
        ...overrides,
      };
      state.employees.push(employee);
      return employee;
    },
    addUser(employeeNumber, overrides = {}) {
      const user = {
        userId: String(nextUserId++),
        employeeNumber,
        passwordHash: null,
        passwordChangedAt: now(),
        accountStatus: 'ACTIVE',
        failedLoginAttempts: 0,
        lastFailedLoginAt: null,
        lockedUntil: null,
        lastLoginAt: null,
        mfaEnrolledAt: null,
        mfaTotpSecretEncrypted: null,
        mfaLastUsedStep: null,
        isPrivilegedRoleMember: false,
        hasSecurityAdministration: false,
        ...overrides,
      };
      state.users.push(user);
      return user;
    },
    user: findUser,
    auditEvents: (eventCode) =>
      state.audit.filter((row) => !eventCode || row.eventCode === eventCode),
  };
}

// Hashing at the approved cost is slow, so one hash per test password is reused.
const hashCache = new Map();
export function cachedHash(password) {
  if (!hashCache.has(password)) hashCache.set(password, hashPassword(password, TEST_ARGON2_COST));
  return hashCache.get(password);
}

/** Creates an employee plus an ACTIVE local account with the given password. */
export async function addActiveAccount(store, { password, employee = {}, user = {} } = {}) {
  const emp = store.addEmployee(employee);
  const account = store.addUser(emp.employeeNumber, {
    passwordHash: await cachedHash(password),
    ...user,
  });
  return { employee: emp, user: account };
}

// Synthetic key for tests only; never a real key.
export const TEST_MFA_KEY = Buffer.alloc(32, 9);

export function testAuthConfig(overrides = {}) {
  return {
    ...config,
    auth: {
      ...config.auth,
      ...overrides,
      mfa: { ...config.auth.mfa, ...overrides.mfa },
      loginRateLimit: { ...config.auth.loginRateLimit, max: 1000, ...overrides.loginRateLimit },
    },
  };
}

export function createTestApp(store, authOverrides) {
  return createApp(testAuthConfig(authOverrides), {
    checkReadiness: async () => ({ LOW: true, HIGH: true }),
    api: {
      db: store.db,
      authRepository: store.authRepository,
      sessionRepository: store.sessionRepository,
      auditRepository: store.auditRepository,
      authorizationRepository: store.authorizationRepository,
      rbacRepository: store.rbacRepository,
      argon2Cost: TEST_ARGON2_COST,
    },
  });
}

/** Extracts the session cookie (name=value) from a Supertest response. */
export function sessionCookie(res, name = config.auth.cookie.name) {
  const header = (res.headers['set-cookie'] ?? []).find((item) => item.startsWith(`${name}=`));
  return header?.split(';')[0];
}
