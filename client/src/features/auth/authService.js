// Authentication endpoints over the single shared API client.
// Relative imports keep this module loadable by the Node-native tests.
import { apiClient } from "../../services/api/apiClient.js";
import { authEndpoints } from "../../config/authConfig.js";
import { apiConfig } from "../../config/apiConfig.js";
import {
  readCsrfToken,
  readCurrentUser,
  readLoginResult,
  readMfaEnrollment,
  readMfaRecoveryResult,
  readMfaRecoverySetup,
  readMfaReplacementResult,
  readMfaSignIn,
  readPasswordChangeResult,
  readPasswordPolicy,
  readRecoveryAccepted,
} from "./authContract.js";

// A 401 from these calls describes the login attempt, the MFA challenge or the
// session being restored, so it must not trigger the global session-invalidation event.
const ownUnauthorized = { notifyUnauthorized: false };
// MFA challenge endpoints authenticate with the challenge cookie and its own CSRF token.
const challengeRequest = { ...ownUnauthorized, csrf: "challenge" };
// Anonymous recovery endpoints: authorized by the link token in the body, never
// by a session, so they carry no CSRF token and cannot end a signed-in session.
const publicRequest = { ...ownUnauthorized, csrf: "none" };
const profileImagePath = `${apiConfig.baseUrl === "/" ? "" : apiConfig.baseUrl}${authEndpoints.profileImage}`;

export function createAuthService({ client }) {
  return Object.freeze({
    // POST /auth/login has no session yet: no CSRF token; the backend checks Origin.
    async login({ username, password }, { signal } = {}) {
      const { data } = await client.post(
        authEndpoints.login,
        { username, password },
        {
          ...ownUnauthorized,
          csrf: "none",
          signal,
        },
      );
      return readLoginResult(data);
    },

    async getCurrentUser({ signal } = {}) {
      const { data } = await client.get(authEndpoints.currentUser, {
        ...ownUnauthorized,
        signal,
      });
      return readCurrentUser(data);
    },

    async updateProfileImage(file, { signal } = {}) {
      const body = new FormData();
      body.append("profileImage", file);
      await client.put(authEndpoints.profileImage, body, {
        csrf: "session",
        signal,
        responseType: "void",
      });
      return `${profileImagePath}?v=${Date.now()}`;
    },

    async removeProfileImage({ signal } = {}) {
      await client.delete(authEndpoints.profileImage, {
        csrf: "session",
        signal,
        responseType: "void",
      });
      return `${profileImagePath}?v=${Date.now()}`;
    },

    async getCsrfToken({ signal } = {}) {
      const { data } = await client.get(authEndpoints.csrf, {
        ...ownUnauthorized,
        signal,
      });
      return readCsrfToken(data);
    },

    // 204 on success; requires the session CSRF token.
    async logout({ signal } = {}) {
      await client.post(authEndpoints.logout, undefined, {
        ...ownUnauthorized,
        csrf: "session",
        signal,
      });
    },

    async verifyMfa(code, { signal } = {}) {
      const { data } = await client.post(
        authEndpoints.mfaVerify,
        { code },
        { ...challengeRequest, signal },
      );
      return readMfaSignIn(data);
    },

    async startMfaEnrollment({ signal } = {}) {
      const { data } = await client.post(
        authEndpoints.mfaEnrollment,
        {},
        { ...challengeRequest, signal },
      );
      return readMfaEnrollment(data);
    },

    async confirmMfaEnrollment(code, { signal } = {}) {
      const { data } = await client.post(
        authEndpoints.mfaEnrollmentConfirm,
        { code },
        { ...challengeRequest, signal },
      );
      return readMfaSignIn(data);
    },

    // Signed-in session: a 401 here is a real session failure, so it notifies.
    async startMfaReplacement({ signal } = {}) {
      const { data } = await client.post(
        authEndpoints.mfaReplacement,
        {},
        { csrf: "session", signal },
      );
      return readMfaEnrollment(data);
    },

    // A wrong code is also a 401 (MFA_VERIFICATION_FAILED), so the caller decides
    // whether a 401 ended the session.
    async confirmMfaReplacement(code, { signal } = {}) {
      const { data } = await client.post(
        authEndpoints.mfaReplacementConfirm,
        { code },
        {
          ...ownUnauthorized,
          csrf: "session",
          signal,
        },
      );
      return readMfaReplacementResult(data);
    },

    async getPasswordPolicy({ signal } = {}) {
      const { data } = await client.get(authEndpoints.passwordPolicy, {
        ...ownUnauthorized,
        signal,
      });
      return readPasswordPolicy(data);
    },

    // Always the same 202 for every username (no enumeration).
    async requestRecovery({ username, purpose }, { signal } = {}) {
      const { data } = await client.post(
        authEndpoints.recoveryRequest,
        { username, purpose },
        { ...publicRequest, signal },
      );
      return readRecoveryAccepted(data);
    },

    async completePasswordSetup({ token, newPassword }, { signal } = {}) {
      const { data } = await client.post(
        authEndpoints.passwordSetup,
        { token, newPassword },
        { ...publicRequest, signal },
      );
      return readPasswordChangeResult(data);
    },

    async completePasswordReset({ token, newPassword }, { signal } = {}) {
      const { data } = await client.post(
        authEndpoints.passwordReset,
        { token, newPassword },
        { ...publicRequest, signal },
      );
      return readPasswordChangeResult(data);
    },

    // Signed-in session: a 401 here is a real session failure, so it notifies.
    async changePassword({ currentPassword, newPassword }, { signal } = {}) {
      const { data } = await client.post(
        authEndpoints.passwordChange,
        { currentPassword, newPassword },
        { csrf: "session", signal },
      );
      return readPasswordChangeResult(data);
    },

    async startMfaRecovery({ token, password }, { signal } = {}) {
      const { data } = await client.post(
        authEndpoints.mfaRecoveryStart,
        { token, password },
        { ...publicRequest, signal },
      );
      return readMfaRecoverySetup(data);
    },

    async confirmMfaRecovery({ token, password, code }, { signal } = {}) {
      const { data } = await client.post(
        authEndpoints.mfaRecoveryConfirm,
        { token, password, code },
        { ...publicRequest, signal },
      );
      return readMfaRecoveryResult(data);
    },
  });
}

export const authService = createAuthService({ client: apiClient });
