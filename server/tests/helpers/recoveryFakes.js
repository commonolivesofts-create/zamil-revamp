import { createRecipientResolver } from '../../src/modules/notifications/delivery.js';
import { riyadhDate } from './authFakes.js';

/*
 * In-memory double of recovery.repository.js over an auth store's `state` (transactions roll it
 * back): token digests (hex), database-clock expiry, the guarded single-use consume, outstanding-
 * token revocation, the guarded password write and the KSA-date expiry-reminder query. It does NOT
 * prove the SQL; see scripts/verify-auth-sql.js. `findToken` passes the 'findToken' race barrier.
 */
export function installRecovery(store) {
  store.state.actionTokens ??= [];
  let nextId = 9000;
  const nowMs = () => store.now().getTime();
  const tokens = () => store.state.actionTokens;
  const usable = (t) => !t.consumedAt && !t.revokedAt && t.expiresAt.getTime() > nowMs();

  store.recoveryRepository = {
    async lockUser(_c, userId) {
      return Boolean(store.user(userId));
    },
    async hasRecentToken(_c, { userId, actionType, seconds }) {
      return tokens().some(
        (t) =>
          t.userId === userId &&
          t.actionType === actionType &&
          t.createdAt.getTime() > nowMs() - seconds * 1000,
      );
    },
    async revokeOutstandingTokens(_c, { userId, actionType, actorUserId }) {
      let count = 0;
      for (const t of tokens()) {
        if (t.userId === userId && t.actionType === actionType && !t.consumedAt && !t.revokedAt) {
          Object.assign(t, { revokedAt: store.now(), updatedBy: actorUserId });
          count += 1;
        }
      }
      return count;
    },
    async insertToken(_c, { userId, actionType, tokenHash, lifetimeSeconds, actorUserId }) {
      const token = {
        tokenId: String(nextId++),
        userId,
        actionType,
        tokenHash: tokenHash.toString('hex'),
        expiresAt: new Date(nowMs() + lifetimeSeconds * 1000),
        consumedAt: null,
        revokedAt: null,
        createdAt: store.now(),
        createdBy: actorUserId,
      };
      tokens().push(token);
      return { tokenId: token.tokenId, expiresAt: token.expiresAt };
    },
    async findToken(_c, tokenHash) {
      const t = tokens().find((x) => x.tokenHash === tokenHash.toString('hex'));
      const result = t
        ? {
            tokenId: t.tokenId,
            userId: t.userId,
            actionType: t.actionType,
            usable: usable(t),
            dbNow: store.now(),
          }
        : null;
      await store.barrier('findToken');
      return result;
    },
    async consumeToken(_c, { tokenId, actorUserId }) {
      const t = tokens().find((x) => x.tokenId === tokenId);
      if (!t || !usable(t)) return false;
      Object.assign(t, { consumedAt: store.now(), updatedBy: actorUserId });
      return true;
    },
    async findPasswordHash(_c, userId) {
      const u = store.user(userId);
      return u && u.accountStatus === 'ACTIVE' ? u.passwordHash : null;
    },
    async setPassword(_c, { userId, passwordHash, expectedStatus, activate, actorUserId }) {
      const u = store.user(userId);
      if (!u || u.accountStatus !== expectedStatus) return false;
      Object.assign(u, {
        passwordHash,
        passwordChangedAt: store.now(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        accountStatus: activate ? 'ACTIVE' : u.accountStatus,
        updatedBy: actorUserId,
      });
      return true;
    },
    async listPasswordExpiryReminders(_c, { daysBefore, expiryDays }) {
      const target = riyadhDate(new Date(nowMs() + daysBefore * 86400000));
      return store.state.users
        .filter(
          (u) =>
            u.accountStatus === 'ACTIVE' &&
            u.passwordHash &&
            u.passwordChangedAt &&
            riyadhDate(new Date(u.passwordChangedAt.getTime() + expiryDays * 86400000)) === target,
        )
        .map((u) => ({ userId: u.userId, employeeNumber: u.employeeNumber }));
    },
  };
  return store.recoveryRepository;
}

/**
 * Delivery double with the real recipient policy: records accepted messages (tests read the raw
 * token from here) or fails. Privileged delivery is enabled unless stated otherwise.
 */
export function createRecordingDelivery({
  configured = true,
  testRecipientOverride = null,
  userCreationTestRecipientOverride = null,
  privilegedDeliveryEnabled = true,
} = {}) {
  const delivery = {
    configured,
    resolveRecipient: createRecipientResolver({
      testRecipientOverride,
      userCreationTestRecipientOverride,
      privilegedDeliveryEnabled,
    }),
    fail: false,
    messages: [],
    async deliver(message) {
      if (delivery.fail) throw new Error('simulated provider failure');
      delivery.messages.push(message);
    },
  };
  return delivery;
}
